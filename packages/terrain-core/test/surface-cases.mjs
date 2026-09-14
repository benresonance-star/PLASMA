export function runSurfaceTests(core,api) {
 const {evaluateTerrainSurface:evaluate,validateTerrainSurface:validate}=api;
 const results=[],assert=(x,m="Assertion failed")=>{if(!x)throw Error(m);};
 const eq=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),"Different results");
 const reject=fn=>{let e;try{fn();}catch(x){e=x;}assert(e?.code,"Expected structured rejection");};
 const test=(name,fn)=>{try{fn();results.push({name,status:"pass"});}catch(e){results.push({name,status:"fail",error:e.message});}};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const p=(id,x,y,z=100000+x/10+y/5)=>({id,revision:0,x,y,z,evidenceRefs:["survey:fixture"]});
 const fixture=()=>({id:"terrain",kind:"terrain-controls",schema:"plasma-terrain-controls/1",surfaceRole:"design-ground",revision:0,
  frameId:"LOCAL-SITE-01",datum:"Synthetic local",units:"mm",source:{evidenceRef:"survey:fixture",contentDigest:"fixture",importerVersion:"test/1",registrationEvidenceRef:"registration:fixture"},
  points:[p("a",0,0),p("b",10000,0),p("c",10000,10000),p("d",0,10000),p("e",2000,3000),p("f",8000,7000)],
  features:[{id:"boundary",revision:0,kind:"boundary",pointIds:["a","b","c","d"]},{id:"ridge",revision:0,kind:"breakline",pointIds:["e","f"]}]});
 test("all controls and breakline survive validated realization",()=>{const t=fixture(),s=evaluate(t);eq(s.validation.status,"valid");eq(s.vertices.length,6);eq(s.triangles.length,6);eq(s.validation.twiceAreaMm2,"200000000");});
 test("constraint recovery changes a crossed unconstrained diagonal",()=>{
  const t=fixture();t.points=t.points.slice(0,4);t.features=t.features.slice(0,1);
  const initial=evaluate(t),edges=new Set(initial.triangles.flatMap(tr=>tr.map((a,i)=>[a,tr[(i+1)%3]].sort((a,b)=>a-b).join(":"))));
  const ids=edges.has("0:2")?["b","d"]:["a","c"];t.features.push({id:"ridge",revision:0,kind:"breakline",pointIds:ids});
  const s=evaluate(t);eq(s.validation.status,"valid");assert(s.constraints.some(c=>c.featureId==="ridge"));
 });
 test("concave site is covered without bridging its notch",()=>{
  const t=fixture();t.points=[p("a",0,0),p("b",10000,0),p("c",10000,3000),p("d",3000,3000),p("e",3000,10000),p("f",0,10000)];
  t.features=[{id:"boundary",revision:0,kind:"boundary",pointIds:["a","b","c","d","e","f"]}];
  eq(evaluate(t).validation.twiceAreaMm2,"102000000");
 });
 test("collinear boundary controls retained",()=>{
  const t=fixture();t.points.push(p("g",5000,0));t.features[0].pointIds=["a","g","b","c","d"];
  const s=evaluate(t);eq(s.vertices.length,7);eq(s.triangles.length,7);
 });
 test("point exactly on initial mesh edge splits both incident triangles",()=>{
  const t=fixture();t.points=t.points.slice(0,4).concat([p("e",5000,5000)]);t.features=t.features.slice(0,1);
  eq(evaluate(t).triangles.length,4);
 });
 test("multi-segment ridge retains each source segment",()=>{
  const t=fixture();t.points.push(p("g",5000,2000));t.features[1].pointIds=["e","g","f"];
  const s=evaluate(t);eq(s.constraints.filter(c=>c.kind==="breakline").length,2);
 });
 test("reordered source arrays reproduce identical mesh",()=>{
  const t=fixture(),s=evaluate(t);t.points.reverse();t.features.reverse();eq(evaluate(t),s);
 });
 test("clockwise boundary has same positive coverage",()=>{
  const t=fixture();t.features[0].pointIds.reverse();eq(evaluate(t).validation.twiceAreaMm2,"200000000");
 });
 test("moved control forces a new realization without changing prior surface",()=>{
  const t=fixture(),s=evaluate(t),before=JSON.stringify(s);t.points[4].z+=321;t.points[4].revision++;t.revision++;
  reject(()=>validate(t,s));const next=evaluate(t);eq(next.vertices[4].z,s.vertices[4].z+321);eq(JSON.stringify(s),before);
 });
 test("validator rejects tampered geometry, coverage, lineage and provenance",()=>{
  const t=fixture(),s=evaluate(t);
  for(const mutate of [
   x=>x.triangles.pop(),
   x=>x.triangles.push([...x.triangles[0]]),
   x=>x.triangles[0].reverse(),
   x=>x.vertices[0].z++,
   x=>x.constraints.pop(),
   x=>x.sourceKey="fake",
   x=>x.triangles[0][0]=999
  ]){const bad=clone(s);mutate(bad);reject(()=>validate(t,bad));}
 });
 test("missing boundary and invalid source cannot publish a mesh",()=>{
  const t=fixture();t.features=[];reject(()=>evaluate(t));const b=fixture();b.points[4].x=-10;reject(()=>evaluate(b));
 });
 test("large registered offsets preserve topology and exact area",()=>{
  const t=fixture(),s=evaluate(t);t.points.forEach(p=>{p.x+=900000000;p.y+=900000000;});
  const shifted=evaluate(t);eq(shifted.triangles,s.triangles);eq(shifted.validation.twiceAreaMm2,s.validation.twiceAreaMm2);
 });
 test("247-control legacy surface preserves boundary and 14 breakline edges",()=>{
  const survey={schema:"site-survey/1",frame:"LOCAL-SITE-01",datum:"Synthetic local RL; not AHD",units:"mm",step:2000,nx:12,ny:18,
   points:Array.from({length:247},(_,n)=>({id:"ground-"+n%13+"-"+Math.floor(n/13),x:n%13*2000,y:Math.floor(n/13)*2000,z:100000+n%13*20+Math.floor(n/13)*110}))};
  const t=core.terrainFromLegacySurvey(survey,{terrainId:"terrain",boundaryId:"boundary",source:fixture().source});
  t.features.push({id:"ridge",revision:0,kind:"breakline",pointIds:Array.from({length:15},(_,n)=>"ground-6-"+(n+2))});
  const s=evaluate(t);eq(s.triangles.length,432);eq(s.validation.twiceAreaMm2,"1728000000");eq(s.constraints.length,74);
 });
 test("deterministic generated interior sets preserve coverage and exact plane heights",()=>{
  let state=91827;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  for(let trial=0;trial<15;trial++){
   const t=fixture();t.points=t.points.slice(0,4);t.features=t.features.slice(0,1);
   const seen=new Set();
   for(let i=0;i<12;i++){let x,y,k;do{x=(1+random()%98)*100;y=(1+random()%98)*100;k=x+":"+y;}while(seen.has(k));seen.add(k);t.points.push(p("p"+i,x,y));}
   t.features.push({id:"ridge",revision:0,kind:"breakline",pointIds:["p0","p1"]});
   // Explicit source arrangements are required; random collinear controls are not silently split.
   try{core.validateTerrain(t);}catch(e){if(e.code==="INVALID_TOPOLOGY")continue;throw e;}
   const s=evaluate(t);eq(s.validation.twiceAreaMm2,"200000000");
   for(const v of s.vertices)eq(v.z,100000+v.x/10+v.y/5);
  }
 });
 return results;
}
