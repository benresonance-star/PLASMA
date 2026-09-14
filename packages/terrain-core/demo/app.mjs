import { prepareTerrainEdit, makeTerrainRequest } from "../src/index.mjs";
import { mapTerrainSurface } from "../src/common-contracts.mjs";
import { createPresentationConsumer } from "../src/presentation-consumer.mjs";
import { createSvgTerrainSink } from "../src/svg-terrain.mjs";
import { createTerrainWorkerEvaluator } from "../src/worker-client.mjs";

const $=id=>document.getElementById(id),registry=new Map();
let refNumber=0,frameRefs=[];
const register=value=>{const ref="demo:"+ ++refNumber;registry.set(ref,value);return ref;};
const baseline={id:"terrain",kind:"terrain-controls",schema:"plasma-terrain-controls/1",surfaceRole:"design-ground",
 revision:0,frameId:"SITE-DEMO",datum:"Synthetic local datum",units:"mm",
 source:{evidenceRef:"synthetic-fixture",contentDigest:"demo-fixture-v1",importerVersion:"demo/1",registrationEvidenceRef:"local-frame-demo"},
 points:Array.from({length:25},(_,i)=>({id:"p"+i,revision:0,x:(i%5)*4000,y:Math.floor(i/5)*4000,
 z:100000+(i%5)*80+Math.floor(i/5)*150,evidenceRefs:["synthetic-fixture"]})),
 features:[{id:"boundary",revision:0,kind:"boundary",pointIds:[0,1,2,3,4,9,14,19,24,23,22,21,20,15,10,5].map(i=>"p"+i)},
 {id:"ridge",revision:0,kind:"breakline",pointIds:["p7","p12","p17"]}]};
const snapshot={branchId:"demo",worldRevision:0,proposalRevision:null,terrain:baseline};
const worldRef=register(snapshot),snapshotRef=register({kind:"preview-fixture",snapshot}),sourceRef=register(baseline);
registry.set("SITE-DEMO",{units:"mm",datum:baseline.datum});
registry.set("demo-preview-only",{allow:["read","preview"],commit:false});
let selected="p12",mode="plan",frameSequence=0,inputSequence=0,activeSurface=null,projection=null,busy=false;
let pendingJob=0,currentSource=baseline;
let worker=null;
try{worker=createTerrainWorkerEvaluator(new Worker(new URL("../src/surface-worker.mjs",import.meta.url),{type:"module"}));}
catch(error){$("status").textContent="Terrain worker unavailable: "+error.message;}
const digest=async text=>"sha256:"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,"0")).join("");
const sink=createSvgTerrainSink($("view"),{onHit:(hit,event)=>{
 try{const observationRef=register({kind:event.type,anchor:hit.semanticAnchorRef});
 try{consumer.observeHit({...hit,observationRef,inputSequence:++inputSequence});}finally{registry.delete(observationRef);}}catch(e){$("status").textContent=e.message;}
}});
const consumer=createPresentationConsumer({surfaceId:"terrain-demo",generation:1,
 capabilities:{providerRef:"svg-terrain/1",supportedFeatureRefs:["mesh-preview","exact-control-selection"],resourcePolicyRef:"demo-bounded",
 fallbackProviderRefs:[],accessibilityProfileRef:"demo-keyboard-labels"},
 draw:sink.draw,releaseVisuals:sink.releaseVisuals,resolveProjection:()=>projection});
consumer.observeInput(event=>{
 selected=registry.get(event.semanticAnchorRef).pointId;$("point").value=selected;syncLevel();render();
});
function syncLevel(){$("level").value=currentSource.points.find(p=>p.id===selected).z;}
function project(p) {
 return mode==="plan"?{x:110+p.x*.035,y:600-p.y*.035}:
 {x:400+(p.x-p.y)*.020,y:145+(p.x+p.y)*.011-(p.z-100000)*.055};
}
function render(){
 if(!activeSurface)return;
 const restoreFocus=$("view").contains(document.activeElement);
 // Frame references expire; candidate artifact identity survives camera/selection changes.
 for(const ref of frameRefs)registry.delete(ref);frameRefs=[];
 const frameRegister=value=>{const ref=register(value);frameRefs.push(ref);return ref;};
 const surface=activeSurface.surface,responseRef=activeSurface.response.response_id;
 const context={surfaceId:"terrain-demo",generation:1,frameSequence:++frameSequence,
 worldSnapshotRef:snapshotRef,viewContextRef:frameRegister({mode,viewBox:[0,0,800,640]})};
 const anchorMapRef=frameRegister({sourceKey:surface.sourceKey});
 const anchors=surface.vertices.map(p=>{const screen=project(p);return {semanticAnchorRef:frameRegister({pointId:p.id,sourceKey:surface.sourceKey}),
 status:"exact",editable:true,screenX:screen.x,screenY:screen.y,label:p.id+" · level "+p.z+" millimetres",selected:p.id===selected};});
 projection={...context,anchorMapRef,hitMapRef:frameRegister({frameSequence,anchorMapRef}),anchors,
 surfaces:[{responseRef,role:"candidate",vertices:surface.vertices.map(p=>({...project(p),height:p.z-100000})),
 triangles:surface.triangles,segments:surface.constraints}]};
 const frame={protocol:"PLS-IPS-01/0.1.0",...context,representations:[{responseRef,role:"candidate"}],overlay:null,
 anchorMapRef,lensRef:frameRegister("terrain"),selectionViewRef:frameRegister(selected),toolViewRef:frameRegister("level-preview"),
 inputViewRef:frameRegister({inputSequence}),assessmentViewRefs:[frameRegister({status:"unknown",scope:"representation-tolerance"})],fieldResponseRefs:[],
 appearanceRecipeRef:frameRegister("height-tint"),accessibilityViewRef:frameRegister("labelled-controls"),latencyClass:"local_preview",
 performanceProfileRef:frameRegister("unqualified-demo"),qualityPolicyRef:frameRegister("labelled-unqualified-preview")};
 const receipt=consumer.present(frame);
 if(restoreFocus)$("view").querySelector("[data-selected=true]")?.focus();
 if(receipt.status!=="submitted")$("status").textContent="Presentation unavailable. Use the control selector; no project state changed.";
 return receipt.status==="submitted";
}
async function evaluate(source) {
 if(!worker){$("status").textContent="Terrain worker unavailable. Serve this folder over localhost or HTTPS in a browser with module workers.";return;}
 if(busy)return;
 busy=true;$("preview").disabled=true;$("reset").disabled=true;const job=++pendingJob;
 $("status").textContent="Resolving temporary surface… View switching and point selection remain available.";
 try {
 const mesh=await worker.evaluate(source),implementationDigest=await digest(await Promise.all(["../src/index.mjs","../src/surface.mjs","../src/surface-worker.mjs"].map(async path=>{
 const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw Error("Cannot identify evaluator source.");return path+"\n"+await r.text();
 })).then(parts=>parts.join("\n"))),configurationDigest=await digest("terrain-flip/1:default"),artifactDigest=await digest(JSON.stringify(mesh));
 if(job!==pendingJob)return;
 const candidateWorldRef=register({kind:"uncommitted-fixture-candidate",base:worldRef,terrain:source});
 const request={schema:"plasma/RepresentationRequest/0.1.0",request_id:"demo-request:"+job,world_revision:candidateWorldRef,
 subjects:[{entity_id:sourceRef,semantic_reference:null}],purpose:"interactive_feedback",representation_kind:"interactive_mesh",
 semantic_lod:"terrain-controls/1",geometric_lod:"bounded-tin/1",coordinate_frame_ref:"SITE-DEMO",view_context_ref:null,
 tolerances:[{metric:"surface_deviation",maximum:1,unit:"mm",space:"world",scope_refs:[sourceRef]}],
 freshness:{mode:"exact_revision",maximum_age_ms:null},latency_budget_ms:50,required_for_commit:false,
 fallback_policy:"none",requester:{id:"demo-user",kind:"human",authority_ref:"demo-preview-only"},input_digest:null,cancellation_token_ref:null};
 const inputDigest=await digest(JSON.stringify({request,sourceKey:mesh.sourceKey,implementationDigest,configurationDigest}));
 request.input_digest=inputDigest;registry.set(request.request_id,request);
 // Full request envelope; requested tolerance remains unknown.
 // This reference registry is a temporary preview harness, not production World State.
 const response=mapTerrainSurface(source,mesh,request,{terrainId:source.id,terrainRevision:source.revision,sourceKey:mesh.sourceKey,
 responseRef:register({job}),artifactRef:register(mesh),worldRevisionRef:candidateWorldRef,artifactDigest,
 provenance:{producer:{id:"demo-terrain",version:"1",implementation_digest:implementationDigest,configuration_digest:configurationDigest},
 input_digests:[inputDigest],evidence_refs:[],created_at:new Date().toISOString()}});
 if(activeSurface)for(const ref of activeSurface.ownedRefs)registry.delete(ref);
 registry.set(response.response_id,response);
 currentSource=source;activeSurface={surface:mesh,response,ownedRefs:[candidateWorldRef,request.request_id,response.response_id,response.artifact_ref]};syncLevel();const drawn=render();
 if(drawn)$("status").textContent=mesh.vertices.length+" controls · "+mesh.triangles.length+" triangles · temporary preview; topology checked, representation tolerance unknown.";
 }catch(error){$("status").textContent=error.code+": "+error.message+" Previous preview retained; no project state changed.";}
 finally{busy=false;$("preview").disabled=false;$("reset").disabled=false;}
}
for(const p of baseline.points){const o=document.createElement("option");o.value=p.id;o.textContent=p.id;$("point").appendChild(o);}
$("point").value=selected;$("point").onchange=()=>{selected=$("point").value;syncLevel();render();};
$("preview").onclick=()=>{
 try {
 const z=Number($("level").value);if(!$("level").value.trim()||!Number.isSafeInteger(z))throw Error("Enter an integer level in millimetres.");
 const point=currentSource.points.find(p=>p.id===selected);
 const local={...snapshot,terrain:currentSource};
 const request=makeTerrainRequest(local,{requestId:"preview-"+(pendingJob+1),operations:[{type:"point.replace",target:selected,values:{x:point.x,y:point.y,z,evidenceRefs:point.evidenceRefs}}]});
 const candidate=prepareTerrainEdit(local,request,{terrainId:"terrain",allowedFeatureIds:[selected]});
 void evaluate(candidate.candidate);
 }catch(e){$("status").textContent=e.message;}
};
for(const view of ["plan","axon"])$(view).onclick=()=>{mode=view;for(const id of ["plan","axon"])$(id).setAttribute("aria-pressed",String(id===view));render();};
$("reset").onclick=()=>{void evaluate(structuredClone(baseline));};
window.addEventListener("pagehide",()=>{pendingJob++;consumer.release("terrain-demo",1);sink.dispose();worker?.dispose();});
window.addEventListener("pageshow",event=>{if(event.persisted)location.reload();});
syncLevel();void evaluate(structuredClone(baseline));
