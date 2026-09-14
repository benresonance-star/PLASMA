export function runPresentationTests(core,surface,mapping,presentation) {
 const results=[],assert=(x,m="Assertion failed")=>{if(!x)throw Error(m);},eq=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),"Different values");
 const reject=(fn,code)=>{let e;try{fn();}catch(x){e=x;}assert(e?.code===code,"Expected "+code+", got "+e?.code);};
 const test=(name,fn)=>{try{fn();results.push({name,status:"pass"});}catch(e){results.push({name,status:"fail",error:e.message});}};
 const digest="sha256:"+"a".repeat(64);
 const local={sessionId:"drag",entityId:"p1",branchId:"main",worldRevision:3,proposalRevision:null,terrainRevision:2,inputSequence:4,phase:"active",position:{x:1,y:2,z:3}};
 const binding={localPin:{branchId:"main",worldRevision:3,proposalRevision:null,terrainRevision:2},worldRevisionRef:"world:R3",actorRef:"actor:human",entityRef:"entity:terrain",
  controlId:"p1",controlAnchorRef:"anchor:p1",modifiersRef:"modifiers:none",deltaSchemaRef:"terrain-delta/1",deltaArtifactRef:"artifact:delta",deltaPosition:{x:1,y:2,z:3},operationDigest:digest};
 const frame=()=>({protocol:"PLS-IPS-01/0.1.0",surfaceId:"view",generation:1,frameSequence:1,worldSnapshotRef:"snapshot:R3",viewContextRef:"camera:1",
  representations:[],overlay:mapping.mapTerrainOverlay(local,binding),anchorMapRef:"anchors:1",lensRef:"lens",selectionViewRef:"selection",toolViewRef:"tool",
  inputViewRef:"input",assessmentViewRefs:[],fieldResponseRefs:[],appearanceRecipeRef:"style",accessibilityViewRef:"accessibility",
  latencyClass:"reflex",performanceProfileRef:"profile",qualityPolicyRef:"quality"});
 const projection=f=>({surfaceId:f.surfaceId,generation:f.generation,frameSequence:f.frameSequence,worldSnapshotRef:f.worldSnapshotRef,viewContextRef:f.viewContextRef,
  anchorMapRef:f.anchorMapRef,hitMapRef:"hits:"+f.frameSequence,anchors:[{semanticAnchorRef:"anchor:p1",status:"exact",editable:true,screenX:10,screenY:20}]});
 function setup(options={}){const draws=[],released=[];const consumer=presentation.createPresentationConsumer({surfaceId:"view",generation:1,
  capabilities:{providerRef:"test",supportedFeatureRefs:[],resourcePolicyRef:"bounded",fallbackProviderRefs:[],accessibilityProfileRef:"text"},
  draw:(f,p)=>{draws.push([f,p]);return options.draw?options.draw(f,p):["visual:"+f.frameSequence];},
  resolveProjection:options.project??projection,releaseVisuals:v=>released.push(...v)});return {consumer,draws,released};}
 const hit=f=>({...f,hitMapRef:"hits:"+f.frameSequence,semanticAnchorRef:"anchor:p1",observationRef:"observation:1",inputSequence:5});
 test("host mapping preserves requested delta and no validity is invented",()=>{
  const o=mapping.mapTerrainOverlay(local,binding);eq(o.baseRevision,"world:R3");eq(o.targets[0].entityId,"entity:terrain");eq(o.assessment.status,"unknown");eq(o.speculativeGeometry,null);
  reject(()=>mapping.mapTerrainOverlay({...local,worldRevision:4},binding),"STALE_READ");
  reject(()=>mapping.mapTerrainOverlay(local,{...binding,deltaPosition:{x:99,y:2,z:3}}),"MAPPING_REQUIRED");
 });
 test("read-only draw receives detached nested data",()=>{
  let mutated=false;const s=setup({draw:f=>{try{f.overlay.targets[0].entityId="evil";}catch{}mutated=f.overlay.targets[0].entityId==="evil";return ["visual"];}});
  const f=frame();eq(s.consumer.present(f).status,"submitted");eq(mutated,false);eq(f.overlay.targets[0].entityId,"entity:terrain");
  f.overlay.targets[0].entityId="caller-change";eq(s.draws[0][0].overlay.targets[0].entityId,"entity:terrain");
 });
 test("accessors, functions, shared typed buffers and cycles rejected without evaluation",()=>{
  let called=false;const value={get secret(){called=true;return 1;}};
  reject(()=>presentation.immutablePresentationData(value),"INVALID_PRESENTATION");eq(called,false);
  for(const v of [()=>{},new Uint8Array(2)])reject(()=>presentation.immutablePresentationData(v),"INVALID_PRESENTATION");
  const loop={};loop.self=loop;reject(()=>presentation.immutablePresentationData(loop),"INVALID_PRESENTATION");
 });
 test("late frames and stale view hit maps cannot edit a new frame",()=>{
  const s=setup(),f=frame();s.consumer.present(f);reject(()=>s.consumer.present(f),"STALE_FRAME");
  const next={...f,frameSequence:2,viewContextRef:"camera:2"};s.consumer.present(next);
  reject(()=>s.consumer.observeHit(hit(f)),"STALE_HIT");
  eq(s.consumer.observeHit(hit(next)).semanticAnchorRef,"anchor:p1");
 });
 test("ambiguous, lost and unqualified reprojected anchors disable editing",()=>{
  for(const status of ["ambiguous","lost","reprojected"]){const s=setup({project:f=>({...projection(f),anchors:[{semanticAnchorRef:"anchor:p1",status,editable:false,screenX:1,screenY:2}]})});
   const f=frame();s.consumer.present(f);reject(()=>s.consumer.observeHit(hit(f)),"UNRESOLVED_ANCHOR");}
 });
 test("provider cannot label an ambiguous anchor editable",()=>{
  const s=setup({project:f=>({...projection(f),anchors:[{semanticAnchorRef:"anchor:p1",status:"ambiguous",editable:true,screenX:1,screenY:2}]})});
  reject(()=>s.consumer.present(frame()),"UNRESOLVED_ANCHOR");
 });
 test("hit emits only observation and has no mutation method",()=>{
  const s=setup(),f=frame();let event;s.consumer.observeInput(e=>event=e);s.consumer.present(f);s.consumer.observeHit(hit(f));
  eq(event.kind,"hit");eq(event.interactionSessionRef,"drag");assert(!("commit" in s.consumer));assert(!("operation" in event));
 });
 test("render failure makes picking unavailable",()=>{
  const s=setup({draw:()=>{throw Error("device lost");}}),f=frame();eq(s.consumer.present(f).status,"unavailable");
  reject(()=>s.consumer.observeHit(hit(f)),"STALE_HIT");
 });
 test("replacement and release dispose visual handles and revoke picks",()=>{
  const s=setup(),f=frame();s.consumer.present(f);s.consumer.present({...f,frameSequence:2});eq(s.released,["visual:1"]);
  s.consumer.release("view",1);eq(s.released,["visual:1","visual:2"]);
  reject(()=>s.consumer.present({...f,frameSequence:3}),"SURFACE_CLOSED");reject(()=>s.consumer.observeHit(hit(f)),"STALE_HIT");
 });
 test("payload and listener budgets are enforced",()=>{
  reject(()=>presentation.immutablePresentationData([1,2,3],2),"RESOURCE_LIMIT");
  const s=setup();for(let i=0;i<8;i++)s.consumer.observeInput(()=>{});reject(()=>s.consumer.observeInput(()=>{}),"RESOURCE_LIMIT");
 });
 test("surface mapping stays unknown without measured representation tolerances",()=>{
  const t={id:"terrain",kind:"terrain-controls",schema:"plasma-terrain-controls/1",surfaceRole:"design-ground",revision:0,frameId:"SITE",datum:"Synthetic",units:"mm",
   source:{evidenceRef:"source",contentDigest:"fixture",importerVersion:"test/1",registrationEvidenceRef:"reg"},
   points:[{id:"a",x:0,y:0},{id:"b",x:10,y:0},{id:"c",x:0,y:10}].map(p=>({...p,z:0,revision:0,evidenceRefs:[]})),
   features:[{id:"boundary",kind:"boundary",revision:0,pointIds:["a","b","c"]}]};
  const mesh=surface.evaluateTerrainSurface(t),request={schema:"plasma/RepresentationRequest/0.1.0",representation_kind:"interactive_mesh",required_for_commit:false,
   world_revision:"world:1",request_id:"repr:1",input_digest:digest};
  const registered={terrainId:t.id,terrainRevision:0,sourceKey:mesh.sourceKey,responseRef:"response:1",artifactRef:"artifact:mesh",worldRevisionRef:"world:1",artifactDigest:digest,
   provenance:{producer:{id:"terrain",version:"1",implementation_digest:digest,configuration_digest:digest},input_digests:[digest],evidence_refs:[],created_at:"2026-09-14T00:00:00Z"}};
  const r=mapping.mapTerrainSurface(t,mesh,request,registered);eq(r.status,"unknown");eq(r.achieved_tolerances,[]);eq(r.validation_results,[]);
  reject(()=>mapping.mapTerrainSurface(t,mesh,{...request,required_for_commit:true},registered),"MAPPING_REQUIRED");
 });
 test("invalidation hints cannot claim complete causal coverage",()=>{
  const h=mapping.terrainInvalidationHints({schema:"plasma-terrain-candidate/1",terrainId:"terrain",affectedIds:["terrain"],invalidations:["terrain-hydrology"]},"world:1");
  eq(h.impactCoverage,"unknown");eq(h.claims[0].status,"pending");assert(!("complete_for_evaluators" in h));
 });
 return results;
}
