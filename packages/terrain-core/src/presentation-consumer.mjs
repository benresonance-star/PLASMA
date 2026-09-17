import { TerrainError } from "./index.mjs";
const fail=(code,message)=>{throw new TerrainError(code,message);};
const ref=x=>typeof x==="string"&&x.length>0&&x.length<=2048;
const key=f=>JSON.stringify([f.surfaceId,f.generation,f.frameSequence,f.worldSnapshotRef,f.viewContextRef]);
/** Detached, deeply frozen plain data. Accessors/functions/shared buffers rejected.
 * This is defensive ownership, not a sandbox for hostile same-realm JavaScript.
 */
export function immutablePresentationData(value,limit=20000) {
  let count=0;const path=new Set();
  function visit(x) {
    if(++count>limit)fail("RESOURCE_LIMIT","Presentation payload exceeds node budget.");
    if(x===null||typeof x==="boolean"||typeof x==="string")return x;
    if(typeof x==="number"&&Number.isFinite(x))return x;
    if(typeof x!=="object"||path.has(x))fail("INVALID_PRESENTATION","Plain acyclic data required.");
    const proto=Object.getPrototypeOf(x);
    if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)fail("INVALID_PRESENTATION","Mutable host objects/buffers are forbidden.");
    if(Object.getOwnPropertySymbols(x).length)fail("INVALID_PRESENTATION","Symbol properties are unsupported.");
    path.add(x);const result=Array.isArray(x)?[]:{};
    for(const [name,d] of Object.entries(Object.getOwnPropertyDescriptors(x))) {
      if(Array.isArray(x)&&name==="length")continue;
      if(!("value" in d))fail("INVALID_PRESENTATION","Accessors are forbidden.");
      Object.defineProperty(result,name,{value:visit(d.value),enumerable:true,writable:false,configurable:false});
    }
    path.delete(x);return Object.freeze(result);
  }
  return visit(value);
}
/** One mounted surface generation. draw is a trusted render-only sink.
 * Host resolves bindings before present; no world-store/commit port is accepted.
 */
export function createPresentationConsumer({surfaceId,generation,capabilities,draw,resolveProjection,releaseVisuals}) {
  if(!ref(surfaceId)||!Number.isSafeInteger(generation)||generation<0||typeof draw!=="function"||typeof resolveProjection!=="function"||typeof releaseVisuals!=="function")
    fail("INVALID_PRESENTATION","Mount identity and render-only sink required.");
  let latest=null,closed=false,sequence=-1,visuals=[];const listeners=new Set();
  const caps=immutablePresentationData(capabilities);
  return Object.freeze({
    capabilities:caps,
    present(input) {
      if(closed)fail("SURFACE_CLOSED","Mount a new generation.");
      const f=immutablePresentationData(input),p=immutablePresentationData(resolveProjection(f));
      if(f.protocol!=="PLS-IPS-01/0.1.0"||f.surfaceId!==surfaceId||f.generation!==generation||
         !Number.isSafeInteger(f.frameSequence)||f.frameSequence<=sequence)
        fail("STALE_FRAME","Invalid or superseded frame.");
      for(const name of ["worldSnapshotRef","viewContextRef","anchorMapRef","lensRef","selectionViewRef","toolViewRef","inputViewRef","appearanceRecipeRef","accessibilityViewRef","performanceProfileRef","qualityPolicyRef"])
        if(!ref(f[name]))fail("INVALID_PRESENTATION","Missing frame reference: "+name);
      if(!["reflex","local_preview","accepted_refresh","background"].includes(f.latencyClass)||
         !Array.isArray(f.representations)||!Array.isArray(f.assessmentViewRefs)||!Array.isArray(f.fieldResponseRefs))
        fail("INVALID_PRESENTATION","Invalid frame lists or latency class.");
      if(key(f)!==key(p)||p.anchorMapRef!==f.anchorMapRef||!ref(p.hitMapRef)||!Array.isArray(p.anchors)||p.anchors.length>512)
        fail("STALE_ANCHORS","Projection must bind the exact frame and anchor map.");
      const ids=new Set();
      for(const a of p.anchors){
        if(!ref(a.semanticAnchorRef)||ids.has(a.semanticAnchorRef)||!["exact","reprojected","ambiguous","lost"].includes(a.status)||
           !Number.isFinite(a.screenX)||!Number.isFinite(a.screenY)||typeof a.editable!=="boolean")
          fail("INVALID_PRESENTATION","Invalid anchor projection.");
        if(a.editable&&a.status!=="exact")fail("UNRESOLVED_ANCHOR","Only exact anchors are editable in this first profile.");
        ids.add(a.semanticAnchorRef);
      }
      if(f.overlay && (!ref(f.overlay.sessionId)||!Number.isSafeInteger(f.overlay.inputSequence)||
         f.overlay.inputSequence<0||f.overlay.schemaVersion!=="PLS-INT-01/0.1.0"))
        fail("INVALID_PRESENTATION","Invalid canonical overlay.");
      if(f.representations.some(r=>!ref(r.responseRef)||!["accepted","candidate","labelled_stale"].includes(r.role)))
        fail("INVALID_PRESENTATION","Invalid representation binding.");
      sequence=f.frameSequence;latest=null; // Invalidate old picking before attempting a new draw.
      const context={surfaceId,generation,frameSequence:f.frameSequence,worldSnapshotRef:f.worldSnapshotRef,viewContextRef:f.viewContextRef};
      try {
        const handles=immutablePresentationData(draw(f,p));
        if(!Array.isArray(handles)||!handles.every(ref))fail("INVALID_PRESENTATION","Draw must return transient visual handles.");
        releaseVisuals(visuals);visuals=[...handles];latest={frame:f,projection:p};
        return immutablePresentationData({...context,status:"submitted",visualHandleRefs:handles,hitMapRef:p.hitMapRef,
          anchorMapRef:f.anchorMapRef,demandHintRefs:[],diagnosticRefs:[],submissionTimingRef:null});
      } catch(error) {
        releaseVisuals(visuals);visuals=[];
        return immutablePresentationData({...context,status:"unavailable",visualHandleRefs:[],hitMapRef:null,
          anchorMapRef:f.anchorMapRef,demandHintRefs:[],diagnosticRefs:[],submissionTimingRef:null});
      }
    },
    observeInput(listener) {
      if(closed)fail("SURFACE_CLOSED","Surface released.");
      if(typeof listener!=="function")fail("INVALID_PRESENTATION","Listener required.");
      if(listeners.size>=8)fail("RESOURCE_LIMIT","Listener budget exceeded.");
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    observeHit(observation) {
      if(closed||!latest)fail("STALE_HIT","No current displayed frame.");
      const h=immutablePresentationData(observation),f=latest.frame,p=latest.projection;
      if(key(h)!==key(f)||h.hitMapRef!==p.hitMapRef||!ref(h.observationRef)||
         !Number.isSafeInteger(h.inputSequence)||h.inputSequence<0||h.inputSequence<(f.overlay?.inputSequence??0))
        fail("STALE_HIT","Hit was produced by another view/frame.");
      const a=p.anchors.find(x=>x.semanticAnchorRef===h.semanticAnchorRef);
      if(!a||!a.editable||a.status!=="exact")fail("UNRESOLVED_ANCHOR","Hit has no editable exact mapping.");
      const event=immutablePresentationData({surfaceId,generation,frameSequence:f.frameSequence,
        worldSnapshotRef:f.worldSnapshotRef,viewContextRef:f.viewContextRef,kind:h.kind==="input"?"input":"hit",semanticAnchorRef:a.semanticAnchorRef,
        hitMapRef:p.hitMapRef,observationRef:h.observationRef,interactionSessionRef:f.overlay?.sessionId??null,inputSequence:h.inputSequence});
      for(const listener of listeners)listener(event);
      return event; // Runtime still revalidates operation meaning and authorization.
    },
    release(id,gen) {
      if(id!==surfaceId||gen!==generation)fail("STALE_FRAME","Wrong mount identity.");
      closed=true;latest=null;listeners.clear();releaseVisuals(visuals);visuals=[];
      // Host owns render sink disposal and must release its transient visual handles.
    }
  });
}
