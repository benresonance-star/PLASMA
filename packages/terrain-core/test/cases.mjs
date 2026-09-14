export function runTerrainTests(api) {
  const {validateTerrain,prepareTerrainEdit,makeTerrainRequest,beginTerrainPointInteraction,terrainFromLegacySurvey,terrainRequestKey}=api;
  const results=[];
  const assert=(ok,message="Assertion failed")=>{if(!ok)throw Error(message);};
  const eq=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),"Unequal: "+JSON.stringify(a)+" / "+JSON.stringify(b));
  const clone=x=>JSON.parse(JSON.stringify(x));
  const throws=(fn,code)=>{let caught;try{fn();}catch(e){caught=e;}assert(caught?.code===code,"Expected "+code+", got "+(caught?.code??caught??"no failure"));};
  const source={evidenceRef:"survey:demo",contentDigest:"fixture-digest",importerVersion:"fixture/1",registrationEvidenceRef:"registration:demo"};
  const point=(id,x,y,z=100000)=>({id,revision:0,x,y,z,evidenceRefs:["survey:demo"]});
  const fixture=()=>({branchId:"main",worldRevision:4,proposalRevision:null,terrain:{
    id:"terrain-1",kind:"terrain-controls",schema:"plasma-terrain-controls/1",surfaceRole:"design-ground",revision:0,
    frameId:"LOCAL-SITE-01",datum:"Synthetic local RL; not AHD",units:"mm",source:clone(source),
    points:[point("a",0,0),point("b",10000,0),point("c",10000,10000),point("d",0,10000),point("e",2000,4000),point("f",8000,4000)],
    features:[{id:"boundary",revision:0,kind:"boundary",pointIds:["a","b","c","d"]},{id:"ridge",revision:0,kind:"breakline",pointIds:["e","f"]}]
  }});
  const cap=(s,ids)=>({terrainId:s.terrain.id,allowedFeatureIds:ids});
  const move=(target,x,y,z=100000)=>({type:"point.replace",target,values:{x,y,z,evidenceRefs:["survey:demo"]}});
  const prepare=(s,ops)=>{const r=makeTerrainRequest(s,{requestId:"test-1",operations:ops});return prepareTerrainEdit(s,r,cap(s,ops.map(o=>o.target)));};
  const test=(name,fn)=>{try{fn();results.push({name,status:"pass"});}catch(e){results.push({name,status:"fail",error:e.message});}};
  test("registered controls and breakline remain explicitly unresolved",()=>{eq(validateTerrain(fixture().terrain).surfaceStatus,"unresolved");});
  test("atomic batch preserves input and exact requested levels",()=>{
    const s=fixture(),before=JSON.stringify(s),r=prepare(s,[move("e",2000,4000,100123),move("f",8000,4000,100321)]);
    eq(JSON.stringify(s),before);eq(r.candidate.points.slice(-2).map(p=>p.z),[100123,100321]);eq(r.status,"candidate");
    assert(r.affectedIds.includes("ridge"));assert(r.invalidations.includes("terrain-hydrology"));
  });
  test("failed second operation cannot partially mutate input",()=>{
    const s=fixture(),before=JSON.stringify(s);throws(()=>prepare(s,[move("e",2000,4000,100123),move("f",20000,4000)]),"OUTSIDE_COVERAGE");eq(JSON.stringify(s),before);
  });
  test("stale world, branch, proposal and dependency revisions rejected",()=>{
    for(const key of ["worldRevision","branchId","proposalRevision"]) {
      const s=fixture(),r=makeTerrainRequest(s,{requestId:"stale",operations:[move("e",2000,4000)]});s[key]=key==="branchId"?"other":99;
      throws(()=>prepareTerrainEdit(s,r,cap(s,["e"])),"STALE_READ");
    }
    const s=fixture(),r=makeTerrainRequest(s,{requestId:"stale",operations:[move("e",2000,4000)]});s.terrain.points[1].revision++;
    throws(()=>prepareTerrainEdit(s,r,cap(s,["e"])),"STALE_READ");
  });
  test("caller scope does not grant authority",()=>{
    const s=fixture(),r=makeTerrainRequest(s,{requestId:"scope",operations:[move("e",2000,4000)]});
    throws(()=>prepareTerrainEdit(s,r,cap(s,["f"])),"OUTSIDE_SCOPE");
  });
  test("frame mismatch, unknown datum, nonfinite and submillimetre inputs rejected",()=>{
    const s=fixture(),r=makeTerrainRequest(s,{requestId:"frame",operations:[move("e",2000,4000)]});r.frameId="OTHER";
    throws(()=>prepareTerrainEdit(s,r,cap(s,["e"])),"FRAME_MISMATCH");
    s.terrain.datum="";throws(()=>validateTerrain(s.terrain),"UNKNOWN_DATUM");
    for(const x of [NaN,Infinity,1.5]) {const f=fixture();f.terrain.points[4].x=x;throws(()=>validateTerrain(f.terrain),"INVALID_SOURCE");}
  });
  test("duplicate XY observations cannot silently merge",()=>throws(()=>prepare(fixture(),[move("f",2000,4000,123456)]),"SOURCE_CONFLICT"));
  test("self-intersecting boundary rejected",()=>{
    const s=fixture();s.terrain.features[0].pointIds=["a","c","b","d"];throws(()=>validateTerrain(s.terrain),"INVALID_TOPOLOGY");
  });
  test("dangling controls and unnormalised constraint touches rejected",()=>{
    throws(()=>prepare(fixture(),[{type:"point.delete",target:"e"}]),"INVALID_TOPOLOGY");
    const s=fixture();s.terrain.points.push(point("g",5000,4000));throws(()=>validateTerrain(s.terrain),"INVALID_TOPOLOGY");
    s.terrain.features[1].pointIds=["e","g","f"];eq(validateTerrain(s.terrain).status,"source-valid");
  });
  test("crossing breakline segments rejected",()=>{
    const s=fixture();s.terrain.points=s.terrain.points.slice(0,4).concat([point("e",2000,2000),point("f",8000,8000),point("g",2000,8000),point("h",8000,2000)]);
    s.terrain.features[1].pointIds=["e","f","g","h"];throws(()=>validateTerrain(s.terrain),"INVALID_TOPOLOGY");
  });
  test("concave boundary cannot admit an outside chord between boundary vertices",()=>{
    const s=fixture();s.terrain.points=[point("a",0,0),point("b",10000,0),point("c",10000,10000),point("d",7000,10000),point("e",7000,3000),point("f",3000,3000),point("g",3000,10000),point("h",0,10000)];
    s.terrain.features=[{id:"boundary",revision:0,kind:"boundary",pointIds:["a","b","c","d","e","f","g","h"]},{id:"ridge",revision:0,kind:"breakline",pointIds:["d","g"]}];
    throws(()=>validateTerrain(s.terrain),"OUTSIDE_COVERAGE");
  });
  test("undo is an inverse proposal with monotonic revisions",()=>{
    const s=fixture(),r=prepare(s,[move("e",2500,4500,100123)]),next={...s,worldRevision:5,terrain:r.candidate};
    const undo=prepare(next,r.inverseOperations);eq(undo.candidate.points[4].x,2000);eq(undo.candidate.points[4].z,100000);eq(undo.candidate.revision,2);eq(undo.candidate.points[4].revision,2);
  });
  test("multi-operation CRUD is reversible after dependency deletion",()=>{
    const s=fixture(),r=prepare(s,[{type:"breakline.delete",target:"ridge"},{type:"point.delete",target:"e"}]);
    const undo=prepare({...s,worldRevision:5,terrain:r.candidate},r.inverseOperations);
    eq(undo.candidate.features.find(f=>f.id==="ridge").pointIds,["e","f"]);assert(undo.candidate.points.some(p=>p.id==="e"));
  });
  test("rapid updates coalesce and stale sequence cannot overwrite latest",()=>{
    const s=fixture(),before=JSON.stringify(s),i=beginTerrainPointInteraction(s,"e","drag-1");
    for(let n=1;n<=10000;n++) i.update({x:2000,y:4000,z:100000+n},n);
    eq(i.update({x:0,y:0,z:0},1),false);eq(i.overlay().position.z,110000);eq(JSON.stringify(s),before);
    const r=i.release(s,cap(s,["e"]));eq(r.candidate.points[4].z,110000);eq(r.interaction.inputSequence,10000);
    throws(()=>i.update({x:0,y:0,z:0},10001),"SESSION_CLOSED");
  });
  test("cancelled and stale interactions cannot resolve",()=>{
    const s=fixture(),i=beginTerrainPointInteraction(s,"e","cancel");i.cancel();throws(()=>i.release(s,cap(s,["e"])),"SESSION_CLOSED");
    const j=beginTerrainPointInteraction(s,"e","stale");throws(()=>j.release({...s,worldRevision:5},cap(s,["e"])),"STALE_READ");
  });
  test("human interaction and typed proposal use identical resolver results",()=>{
    const s=fixture(),i=beginTerrainPointInteraction(s,"e","human");i.update({x:2100,y:4100,z:100150},1);
    eq(i.release(s,cap(s,["e"])).candidate,prepare(s,[move("e",2100,4100,100150)]).candidate);
  });
  test("request identity includes all guards and normalizes key order",()=>{
    eq(terrainRequestKey({a:1,b:2}),terrainRequestKey({b:2,a:1}));
    assert(terrainRequestKey({baseWorldRevision:4})!==terrainRequestKey({baseWorldRevision:5}));
  });
  test("resource cap bounds resolver workload",()=>{
    const s=fixture();s.terrain.points=Array.from({length:513},(_,n)=>point("p"+n,n,n));throws(()=>validateTerrain(s.terrain),"RESOURCE_LIMIT");
  });
  test("legacy adapter preserves all 247 observations and datum without mutating survey",()=>{
    const survey={schema:"site-survey/1",frame:"LOCAL-SITE-01",datum:"Synthetic local RL; not AHD",units:"mm",step:2000,nx:12,ny:18,points:Array.from({length:247},(_,n)=>({id:"ground-"+n%13+"-"+Math.floor(n/13),x:n%13*2000,y:Math.floor(n/13)*2000,z:100000+n%13*20+Math.floor(n/13)*110}))};
    const before=JSON.stringify(survey),t=terrainFromLegacySurvey(survey,{terrainId:"terrain-1",boundaryId:"boundary",source});
    eq(JSON.stringify(survey),before);eq(t.points.length,247);eq(t.features[0].pointIds.length,60);eq(t.datum,survey.datum);
    const s={branchId:"main",worldRevision:1,proposalRevision:null,terrain:t};
    const r=prepare(s,[{type:"breakline.create",target:"ridge",values:{pointIds:Array.from({length:15},(_,n)=>"ground-6-"+(n+2))}}]);
    eq(r.validation.status,"source-valid");eq(r.candidate.features.length,2);
  });
  test("near-coincident integer controls and large coordinates use exact predicates",()=>{
    const s=fixture();for(const p of s.terrain.points){p.x+=900000000;p.y+=900000000;}
    eq(validateTerrain(s.terrain).status,"source-valid");
    const t=fixture();t.terrain.points[5].x=2001;eq(validateTerrain(t.terrain).status,"source-valid");
  });
  return results;
}
