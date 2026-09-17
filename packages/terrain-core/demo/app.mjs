import { prepareTerrainEdit, makeTerrainRequest } from "../src/index.mjs";
import { mapTerrainSurface } from "../src/common-contracts.mjs";
import { createPresentationConsumer } from "../src/presentation-consumer.mjs";
import { createSvgTerrainSink } from "../src/svg-terrain.mjs";
import { createTerrainWorkerEvaluator } from "../src/worker-client.mjs";
import { createTerrainInteractionAdapter } from "../src/interaction-adapter.mjs";
import { createInteractionSession } from "../../interaction-reflex/src/index.mjs";
import { operationDigest } from "./digest.mjs";
import { createTerrainCamera, attachTerrainNavigation } from "./navigation.mjs";
import { demoTerrain } from "./fixture.mjs";
import { createPersistenceClient } from "./persistence.mjs";

const $ = id => document.getElementById(id), registry = new Map(), surfaces = new Map();
let refNumber = 0, frameRefs = [];
const register = value => { const ref = "demo:" + ++refNumber; registry.set(ref, value); return ref; };
const savedMode = new URL(location.href).searchParams.get('durable') === '1';
const persistence = savedMode ? createPersistenceClient() : null;
let initial;
try { initial = persistence ? await persistence.load() : null; }
catch (error) { $('status').textContent = 'Saved terrain unavailable: ' + error.message; throw error; }
const baseline = initial?.terrain ?? demoTerrain;
let snapshot = initial ?? { branchId: "demo", worldRevision: 0, proposalRevision: null, terrain: baseline };
const camera = createTerrainCamera(baseline.points);
const snapshotRef = register(snapshot), sourceRef = register(baseline);
const anchorRefs = new Map(baseline.points.map(p => [p.id, register({ pointId: p.id, terrainId: baseline.id })]));
registry.set("SITE-DEMO", { units: "mm", datum: baseline.datum });
registry.set("demo-preview-only", { allow: ["read", "preview"], commit: false });
let selected = "p12", mode = "plan", frameSequence = 0, inputSequence = 0, projection = null;
let acceptedRef = null, previewRef = null, session = null, adapter = null, sessionStartRef = null, overlay = null;
let saving = false, undoRequest = null;
let busy = false, jobSequence = 0, disposed = false;
let coordinateTimer=null,coordinateVersion=0;
const digest = async text => "sha256:" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");
const implementationDigest = Promise.all(["../src/index.mjs", "../src/surface.mjs", "../src/surface-worker.mjs"].map(async path => {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw Error("Cannot identify evaluator source.");
  return path + "\n" + await response.text();
})).then(parts => digest(parts.join("\n")));
// Attach a handler immediately; startup evaluation reports any source-fetch failure.
implementationDigest.catch(() => {});
let worker;
try { worker = createTerrainWorkerEvaluator(new Worker(new URL("../src/surface-worker.mjs", import.meta.url), { type: "module" })); }
catch (error) { $("status").textContent = "Terrain worker unavailable: " + error.message; }
// Bound transport work across cancelled/replaced sessions as well as within a gesture.
let workerActive = false, workerPending = null;
async function runWorker(job) {
  workerActive = true;
  try { job.resolve(await worker.evaluate(job.source)); } catch (error) { job.reject(error); }
  finally { workerActive = false; if (workerPending) { const next = workerPending; workerPending = null; void runWorker(next); } }
}
function evaluateTerrain(source) {
  return new Promise((resolve, reject) => {
    const job = { source, resolve, reject };
    if (workerActive) { workerPending?.reject(Error("Preview superseded.")); workerPending = job; }
    else void runWorker(job);
  });
}
function retain(ref) { if (ref) surfaces.get(ref).references++; return ref; }
function release(ref) {
  const record = surfaces.get(ref);
  if (record && --record.references === 0) { for (const key of record.ownedRefs) registry.delete(key); surfaces.delete(ref); }
}
function setPreview(ref) { if (ref === previewRef) return; retain(ref); release(previewRef); previewRef = ref; }
function retainDraft() {
  if (!persistence || persistence.pending()) return;
  const source=surfaces.get(previewRef)?.source;
  if (!source) return;
  const operations=source.points.filter(p=>{
    const before=snapshot.terrain.points.find(q=>q.id===p.id);
    return before && ['x','y','z'].some(axis=>before[axis]!==p[axis]);
  }).map(p=>({type:'point.replace',target:p.id,values:{x:p.x,y:p.y,z:p.z,evidenceRefs:p.evidenceRefs}}));
  persistence.keepDraft(operations.length ? undoRequest ?? makeTerrainRequest(snapshot,{requestId:crypto.randomUUID(),operations,intent:'Accept terrain edits'}) : null,snapshot.worldRevision);
}
async function storeSurface(source, mesh) {
  const producerDigest = await implementationDigest, configurationDigest = await digest("terrain-flip/1:default");
  const artifactDigest = await digest(JSON.stringify(mesh));
  const candidateWorldRef = register({ kind: "uncommitted-fixture-candidate", base: snapshotRef, terrain: source });
  const request = { schema: "plasma/RepresentationRequest/0.1.0", request_id: register(null), world_revision: candidateWorldRef,
    subjects: [{ entity_id: sourceRef, semantic_reference: null }], purpose: "interactive_feedback", representation_kind: "interactive_mesh",
    semantic_lod: "terrain-controls/1", geometric_lod: "bounded-tin/1", coordinate_frame_ref: "SITE-DEMO", view_context_ref: null,
    tolerances: [{ metric: "surface_deviation", maximum: 1, unit: "mm", space: "world", scope_refs: [sourceRef] }],
    freshness: { mode: "exact_revision", maximum_age_ms: null }, latency_budget_ms: 50, required_for_commit: false,
    fallback_policy: "none", requester: { id: "demo-user", kind: "human", authority_ref: "demo-preview-only" },
    input_digest: null, cancellation_token_ref: null };
  request.input_digest = await digest(JSON.stringify({ request, sourceKey: mesh.sourceKey, producerDigest, configurationDigest }));
  const artifactRef = register(mesh), responseRef = register(null);
  const ownedRefs = [candidateWorldRef, request.request_id, artifactRef, responseRef];
  try {
    const response = mapTerrainSurface(source, mesh, request, { terrainId: source.id, terrainRevision: source.revision,
      sourceKey: mesh.sourceKey, responseRef, artifactRef, worldRevisionRef: candidateWorldRef, artifactDigest,
      provenance: { producer: { id: "demo-terrain", version: "1", implementation_digest: producerDigest, configuration_digest: configurationDigest },
        input_digests: [request.input_digest], evidence_refs: [], created_at: new Date().toISOString() } });
    registry.set(responseRef, response); registry.set(request.request_id, request);
    surfaces.set(artifactRef, { source, mesh, response, ownedRefs, references: 1 });
    return artifactRef;
  } catch (error) { for (const ref of ownedRefs) registry.delete(ref); throw error; }
}
function displayedRef() { return overlay?.currentness === "current" && overlay.speculativeGeometry?.artifactRef || previewRef; }
function currentSource() { return surfaces.get(displayedRef())?.source ?? baseline; }
function syncLevel() {
  clearTimeout(coordinateTimer);coordinateTimer=null;coordinateVersion++;
  const point=currentSource().points.find(p=>p.id===selected);
  $('coordinate-x').value=point.x;$('coordinate-y').value=point.y;$("level").value=point.z;
}
function project(p) {
  return mode === "plan" ? { x: 110 + p.x * .035, y: 600 - p.y * .035 } :
    camera.project(p);
}
function submitObservation(hit, observation) {
  const observationRef = register(observation);
  try { consumer.observeHit({ ...hit, kind: observation.kind.startsWith("pointer") ? "input" : "hit",
    observationRef, inputSequence: ++inputSequence }); }
  catch (error) { cancelGesture(); $("status").textContent = error.message; }
  finally { registry.delete(observationRef); }
}
const sink = createSvgTerrainSink($("view"), { onHit: (hit, event) => submitObservation(hit, { kind: event.type }), onPointer: submitObservation });
const consumer = createPresentationConsumer({ surfaceId: "terrain-demo", generation: 1,
  capabilities: { providerRef: "svg-terrain/1", supportedFeatureRefs: ["mesh-preview", "exact-control-selection", "pointer-drag"],
    resourcePolicyRef: "demo-bounded", fallbackProviderRefs: [], accessibilityProfileRef: "demo-keyboard-labels" },
  draw: sink.draw, releaseVisuals: sink.releaseVisuals, resolveProjection: () => projection });
function render(latencyClass = "local_preview") {
  if (!acceptedRef || disposed) return;
  const focusInView = $("view").contains(document.activeElement);
  for (const ref of frameRefs) registry.delete(ref); frameRefs = [];
  const frameRegister = value => { const ref = register(value); frameRefs.push(ref); return ref; };
  const shown = surfaces.get(displayedRef()), base = surfaces.get(acceptedRef);
  const context = { surfaceId: "terrain-demo", generation: 1, frameSequence: ++frameSequence,
    worldSnapshotRef: snapshotRef, viewContextRef: frameRegister({ mode, camera: mode === "axon" ? camera.state() : null, viewBox: [0,0,800,640] }) };
  const anchorMapRef = frameRegister({ sourceKey: shown.mesh.sourceKey });
  const dragging = overlay && !["cancelled", "closed"].includes(overlay.lifecycle);
  const delta = dragging && registry.get(overlay.deltas[0].payloadRef);
  const savedPoints = new Map(base.source.points.map(p=>[p.id,p]));
  const anchors = shown.source.points.map(p => {
    const position = delta?.target === p.id ? delta.values : p, screen = project(position);
    const saved=savedPoints.get(p.id), edited=!saved||['x','y','z'].some(axis=>position[axis]!==saved[axis]);
    return { semanticAnchorRef: anchorRefs.get(p.id), status: "exact", editable: true,
      screenX: screen.x, screenY: screen.y, label: p.id + " · level " + position.z + " millimetres" + (edited ? ' · edited from saved terrain' : ''),
      edited, pointLabel:p.id, selected: p.id === selected };
  });
  const editedCount=anchors.filter(a=>a.edited).length;
  $('edited-count').textContent=editedCount+' edited '+(editedCount===1?'node':'nodes');
  updateEditedReview(shown.source,savedPoints,delta);
  const records = [{ record: base, role: "accepted" }];
  if (shown !== base) records.push({ record: shown, role: "candidate" });
  projection = { ...context, anchorMapRef, hitMapRef: frameRegister({ frameSequence, anchorMapRef }), anchors,
    allowDrag: mode === "plan" && !busy && !saving && !persistence?.pending(), ghost: delta ? project(delta.values) : null,
    surfaces: records.map(({ record, role }) => ({ responseRef: record.response.response_id, role,
      opacity: role === "candidate" ? Number($("proposal-opacity").value)/100 : .75,
      vertices: record.mesh.vertices.map(p => ({ ...project(p), height: p.z - 100000 })),
      triangles: mode === "axon" ? [...record.mesh.triangles].sort((a,b) => a.reduce((sum,i)=>sum+camera.project(record.mesh.vertices[i]).depth,0)-b.reduce((sum,i)=>sum+camera.project(record.mesh.vertices[i]).depth,0)) : record.mesh.triangles, segments: record.mesh.constraints })) };
  const frame = { protocol: "PLS-IPS-01/0.1.0", ...context,
    representations: records.map(({ record, role }) => ({ responseRef: record.response.response_id, role })), overlay,
    anchorMapRef, lensRef: frameRegister("terrain"), selectionViewRef: frameRegister(selected),
    toolViewRef: frameRegister("terrain.control.move"), inputViewRef: frameRegister({ inputSequence }),
    assessmentViewRefs: [frameRegister({ status: "unknown", scope: "representation-tolerance" })], fieldResponseRefs: [],
    appearanceRecipeRef: frameRegister("height-tint"), accessibilityViewRef: frameRegister("labelled-controls"), latencyClass,
    performanceProfileRef: frameRegister("unqualified-demo"), qualityPolicyRef: frameRegister("labelled-unqualified-preview") };
  const receipt = consumer.present(frame);
  if (focusInView) $("view").querySelector("[data-selected=true]")?.focus();
  if (receipt.status !== "submitted") throw Error("Presentation unavailable; no project state changed.");
  $("view").dataset.lifecycle = overlay?.lifecycle ?? "idle";
  $("view").dataset.currentness = overlay?.currentness ?? "current";
  $("view").dataset.inputSequence = String(overlay?.inputSequence ?? 0);
  $("cancel").disabled = !dragging || saving;
  updateHistoryControls();
  updatePendingReview();
  const draftHistory=persistence?.history();
  const draftLocked=busy||saving||coordinateTimer!==null||!!persistence?.pending()||!!session?.state().activeJobs||overlay?.lifecycle==='active'||draftHistory?.baseRevision!==snapshot.worldRevision;
  $('draft-undo').disabled=draftLocked||!draftHistory||draftHistory.index===0;
  $('draft-redo').disabled=draftLocked||!draftHistory||draftHistory.index>=draftHistory.entries.length-1;
  $("undo").disabled = !savedMode || busy || saving || snapshot.worldRevision === 0 || !!persistence?.pending() || previewRef !== acceptedRef;
  $('rebase').disabled = !savedMode || busy || saving || !persistence?.pending();
  $("accept").disabled = !savedMode || saving || busy || coordinateTimer!==null || (dragging && overlay.lifecycle !== "awaiting_acceptance") || (!persistence.pending() && previewRef === acceptedRef);
  $("revision").textContent = savedMode ? "Saved revision " + snapshot.worldRevision : "Temporary preview";
  $("proposal-opacity").disabled = shown === base;
  $("proposal-opacity-value").textContent = $("proposal-opacity").value + "%";
  $("comparison-help").textContent = shown === base ? "Create a preview to compare it with the saved base." : "Lower opacity reveals the saved base. Control points still belong to the proposal.";
}
function disposeGesture(keepPointer = false) {
  if (!keepPointer) sink.cancelPointer();
  session?.close(); adapter?.cancel(); session = null; adapter = null; overlay = null;
  release(sessionStartRef); sessionStartRef = null;
}
function cancelGesture() { session?.cancel(); adapter?.cancel(); sink.cancelPointer(); }
function updateEditedReview(source,savedPoints,delta) {
  const body=$('edited-rows'),focus=document.activeElement;
  const focusedId=body.contains(focus)?focus.dataset.point:null,focusedAction=focus?.dataset.action;
  body.replaceChildren();
  const blocked=busy||saving||!!persistence?.pending()||!!session?.state().activeJobs||overlay?.lifecycle==='active';
  for(const point of source.points){
    const saved=savedPoints.get(point.id),proposed=delta?.target===point.id?delta.values:point;
    if(!saved||!['x','y','z'].some(axis=>proposed[axis]!==saved[axis]))continue;
    const row=document.createElement('tr');row.dataset.point=point.id;
    const values=p=>['x','y','z'].map(axis=>p[axis]).join(', ');
    const differences=['x','y','z'].map(axis=>{const n=proposed[axis]-saved[axis];return n>0?'+'+n:String(n);}).join(', ');
    for(const text of [point.id,values(saved),values(proposed),differences]){const cell=document.createElement('td');cell.textContent=text;row.appendChild(cell);}
    const actions=document.createElement('td');
    for(const [action,label] of [['select','Select'],['revert','Revert point']]){
      const button=document.createElement('button');button.textContent=label;button.dataset.point=point.id;button.dataset.action=action;
      button.setAttribute('aria-label',label+' '+point.id);button.disabled=blocked;
      button.onclick=()=>{
        if(action==='revert'){void revertPoint(point.id);return;}
        selected=point.id;$('point').value=selected;syncLevel();render();
        $('view').querySelector('[data-selected=true]')?.focus();
      };
      actions.appendChild(button);
    }
    row.appendChild(actions);body.appendChild(row);
  }
  $('edited-review').hidden=body.children.length===0;
  $('edited-help').textContent=persistence?.pending()?'A save is pending. Retry or reconcile it with Reload saved before changing individual points.':
    blocked?'Finish the current operation before reverting a point.':'Revert point restores its saved coordinates while keeping your other edits. Changes remain unsaved.';
  if(focusedId)for(const button of body.querySelectorAll('button'))if(button.dataset.point===focusedId&&button.dataset.action===focusedAction&&!button.disabled)button.focus();
}
async function revertPoint(id) {
  if(busy||saving||persistence?.pending()||session?.state().activeJobs||overlay?.lifecycle==='active')return;
  try {
    const source=currentSource(),saved=snapshot.terrain.points.find(p=>p.id===id);
    if(!saved)throw Error('Saved point unavailable');
    const local={...snapshot,terrain:source};
    const request=makeTerrainRequest(local,{requestId:crypto.randomUUID(),operations:[{type:'point.replace',target:id,
      values:{x:saved.x,y:saved.y,z:saved.z,evidenceRefs:saved.evidenceRefs}}]});
    const candidate=prepareTerrainEdit(local,request,{terrainId:source.id,allowedFeatureIds:[id]}).candidate;
    undoRequest=null;disposeGesture();
    const unchanged=candidate.points.every(p=>{const old=snapshot.terrain.points.find(q=>q.id===p.id);return old&&['x','y','z'].every(axis=>old[axis]===p[axis]);});
    if(unchanged){setPreview(acceptedRef);retainDraft();syncLevel();render();$('status').textContent='All point edits reverted. Saved terrain is unchanged.';}
    else await evaluate(candidate);
  }catch(error){$('status').textContent='Cannot revert point: '+error.message;}
}
function beginGesture(event, observation) {
  if (busy || saving || persistence?.pending() || mode !== "plan") { sink.cancelPointer(); return; }
  undoRequest = null;
  disposeGesture(true);
  sessionStartRef = retain(previewRef);
  const record = surfaces.get(sessionStartRef), sessionId = "drag-" + ++jobSequence;
  const identity = { sessionId, baseRevision: record.response.world_revision, semanticAnchorRef: event.semanticAnchorRef };
  adapter = createTerrainInteractionAdapter({ snapshot: { ...snapshot, terrain: record.source }, pointId: selected, sessionId,
    binding: { worldRevisionRef: identity.baseRevision, actorRef: "demo-user", entityRef: sourceRef,
      controlAnchorRef: identity.semanticAnchorRef, modifiersRef: "demo-plan-xy", deltaSchemaRef: "terrain-point-replace/1" },
    start: observation, planTransform: { scaleX: .035, scaleY: -.035 }, register,
    resolve: ref => registry.get(ref), remove: ref => registry.delete(ref), digest: operationDigest,
    evaluate: evaluateTerrain, storeSurface });
  session = createInteractionSession({ identity, policy: { id: "demo-one-active-one-pending", maximumInFlightRequests: 1,
      maximumQueuedRequests: 1, representationContractRef: "plasma/RepresentationResponse/0.1.0" },
    createOverlay: adapter.createOverlay, requestPreview: adapter.requestPreview, releaseOverlay: adapter.releaseOverlay,
    releasePreview: response => release(response.artifactRef),
    publishFrame: (next, latencyClass) => {
      overlay = next;
      if (next.lifecycle === "awaiting_acceptance") {setPreview(next.speculativeGeometry.artifactRef);retainDraft();}
      if (next.lifecycle === "cancelled") {setPreview(sessionStartRef);retainDraft();}
      render(latencyClass); syncLevel();
      $("status").textContent = next.assessment.status === "failed" ? "Preview failed validation or evaluation. Adjust the control or cancel; the original terrain is unchanged." :
        next.lifecycle === "cancelled" ? "Drag cancelled. Previous terrain preview restored." :
        next.lifecycle === "awaiting_acceptance" ? "Drag resolved · temporary preview only. Representation tolerance remains unknown." :
        "Control " + selected + " · " + next.lifecycle + " · " + next.currentness + " · sequence " + next.inputSequence;
    } });
  session.begin({ ...observation, ...identity });
}
consumer.observeInput(event => {
  const observation = registry.get(event.observationRef), pointId = registry.get(event.semanticAnchorRef)?.pointId;
  if (!pointId) throw Error("Unknown semantic control anchor.");
  if (observation.kind === "pointerdown") { selected = pointId; $("point").value = selected; beginGesture(event, observation); }
  else if (observation.kind.startsWith("pointer") && session) {
    const input = { ...observation, semanticAnchorRef: event.semanticAnchorRef, baseRevision: session.state().overlay.baseRevision };
    if (observation.kind === "pointermove") session.update(input);
    else if (observation.kind === "pointerup") session.release(input);
    else if (observation.kind === "pointercancel") cancelGesture();
  } else { selected = pointId; $("point").value = selected; syncLevel(); render(); }
});
async function evaluate(source,editedVersion=null) {
  if (!worker || busy || saving) return;
  busy = true; $("preview").disabled = true; $("reset").disabled = true;
  try {
    const ref = await storeSurface(source, await evaluateTerrain(source));
    if (disposed) { release(ref); return; }
    if (!acceptedRef) acceptedRef = retain(ref);
    setPreview(ref); release(ref); if(previewRef!==acceptedRef)retainDraft();
    if(editedVersion===null||editedVersion===coordinateVersion)syncLevel();
    render();
    $("status").textContent = savedMode ? "Saved revision " + snapshot.worldRevision + ". Edits remain previews until accepted." : "25 controls · 32 triangles · drag a control in Plan. Escape cancels. Changes are temporary.";
  } catch (error) { $("status").textContent = "Preview unavailable: " + error.message; }
  finally { busy = false; $("preview").disabled = !!persistence?.pending(); $("reset").disabled = false; if (!disposed && acceptedRef) render(); }
}
for (const p of baseline.points) { const o = document.createElement("option"); o.value = p.id; o.textContent = p.id; $("point").appendChild(o); }
$("point").value = selected;
$("point").onchange = () => { selected = $("point").value; syncLevel(); render(); };
$("preview").onclick = () => {
  clearTimeout(coordinateTimer);coordinateTimer=null;
  try {
    const values={};
    for(const [axis,id] of [['x','coordinate-x'],['y','coordinate-y'],['z','level']]){
      const raw=$(id).value,value=Number(raw);
      if(!raw.trim()||!Number.isSafeInteger(value)||Math.abs(value)>1000000000)throw Error('Enter '+axis.toUpperCase()+' as an integer in millimetres between -1000000000 and 1000000000.');
      values[axis]=value;
    }
    if(busy)return;
    if (saving || persistence?.pending()) throw Error("Retry the pending save or reset the preview first.");
    if (session?.state().activeJobs) throw Error("Let the current terrain preview finish first.");
    const source = currentSource(), point = source.points.find(p => p.id === selected), local = { ...snapshot, terrain: source };
    const request = makeTerrainRequest(local, { requestId: "level-" + ++jobSequence,
      operations: [{ type: "point.replace", target: selected, values: { ...values, evidenceRefs: point.evidenceRefs } }] });
    const candidate=prepareTerrainEdit(local, request, { terrainId: "terrain", allowedFeatureIds: [selected] }).candidate;
    undoRequest = null; disposeGesture();
    void evaluate(candidate,coordinateVersion);
  } catch (error) { $("status").textContent = error.message; }
  finally {render();}
};
function scheduleCoordinatePreview() {
  clearTimeout(coordinateTimer);
  coordinateTimer=setTimeout(()=>{
    coordinateTimer=null;
    if(disposed)return;
    if(saving||persistence?.pending()){render();return;}
    if(busy||session?.state().activeJobs){scheduleCoordinatePreview();return;}
    $('preview').onclick();
  },350);
}
for(const id of ['coordinate-x','coordinate-y','level'])$(id).addEventListener('input',()=>{
  coordinateVersion++;scheduleCoordinatePreview();$('accept').disabled=true;
});
const navigation = attachTerrainNavigation($("view"), {camera, enabled:()=>mode === "axon", onChange:()=>render()});
$("proposal-opacity").oninput = () => render();
$("fit").onclick = () => { navigation.cancel(); camera.reset(); render(); };
for (const view of ["plan", "axon"]) $(view).onclick = () => {
  if (session?.state().overlay?.lifecycle === "active") cancelGesture();
  navigation.cancel(); mode = view; $("fit").hidden = view !== "axon"; $("navigation-help").hidden = view !== "axon"; for (const id of ["plan", "axon"]) $(id).setAttribute("aria-pressed", String(id === view)); render();
};
$("cancel").onclick = cancelGesture;
window.addEventListener("keydown", event => { if (event.key === "Escape") cancelGesture(); });
window.addEventListener("resize", () => { if (session?.state().overlay?.lifecycle === "active") cancelGesture(); });
$("reset").onclick = () => { if (saving || busy) return; undoRequest = null; persistence?.discard(); $("preview").disabled = busy; $("accept").textContent = "Accept changes"; disposeGesture(); setPreview(acceptedRef); persistence?.discard(); retainDraft(); syncLevel(); render(); $("status").textContent = savedMode ? "Last loaded saved terrain restored. Reload saved to check for newer edits." : "Original fixture restored."; };
window.addEventListener("pagehide", () => {
  clearTimeout(coordinateTimer);
  disposed = true; navigation.dispose(); disposeGesture(); consumer.release("terrain-demo", 1); sink.dispose(); worker?.dispose();
  workerPending?.reject(Error("Preview closed.")); workerPending = null;
  release(previewRef); release(acceptedRef); for (const ref of frameRefs) registry.delete(ref);
});
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
$('accept').hidden = !savedMode; $('reload').hidden = !savedMode;
$('rebase').hidden = !savedMode;
$('draft-undo').hidden = !savedMode;$('draft-redo').hidden = !savedMode;
async function moveDraftHistory(direction){
  const button=$(direction<0?'draft-undo':'draft-redo');if(button.disabled)return;
  const history=persistence.history(),index=history.index+direction,request=history.entries[index];
  busy=true;render();let ref=null;
  try{
    if(request){
      const candidate=prepareTerrainEdit(snapshot,request,{terrainId:snapshot.terrain.id,allowedFeatureIds:baseline.points.map(p=>p.id)}).candidate;
      ref=await storeSurface(candidate,await evaluateTerrain(candidate));
    }
    persistence.moveHistory(index);disposeGesture();undoRequest=request;
    setPreview(ref??acceptedRef);syncLevel();
    $('status').textContent=(direction<0?'Undid':'Redid')+' preview edit. Saved revision '+snapshot.worldRevision+' is unchanged.';
  }catch(error){$('status').textContent='Draft history unavailable: '+error.message;}
  finally{release(ref);busy=false;$('preview').disabled=!!persistence.pending();render();}
}
$('draft-undo').onclick=()=>void moveDraftHistory(-1);
$('draft-redo').onclick=()=>void moveDraftHistory(1);
window.addEventListener('keydown',event=>{
  if(!savedMode||!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest?.('input,textarea,[contenteditable="true"]'))return;
  const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;
  event.preventDefault();void moveDraftHistory(key==='y'||event.shiftKey?1:-1);
});
$('history').hidden = !savedMode;
let historyCursor=null,historyLoading=false,historyLoaded=false,historyError=false;
function updateHistoryControls() {
  const activeGesture=overlay && !['awaiting_acceptance','cancelled','closed'].includes(overlay.lifecycle);
  const reason = saving ? 'Wait for the save to finish.' : busy ? 'Wait for the terrain preview to finish.' :
    persistence?.pending() ? 'A save is pending. Retry save, or Reset preview to discard it, before previewing history.' :
    activeGesture ? 'Finish or cancel the current drag before previewing history.' :
    previewRef !== acceptedRef ? 'You have unsaved changes. Accept changes to keep them, or Reset preview to discard them, before previewing a saved revision.' :
    historyLoading ? 'Loading saved history…' : historyError ? 'History could not be refreshed. Use Refresh history to try again.' :
    !$('history-revision').value ? 'Load history and choose an earlier saved revision.' :
    Number($('history-revision').value) >= snapshot.worldRevision ? 'Choose a revision earlier than the current saved base (revision '+snapshot.worldRevision+').' : '';
  $('history-preview').disabled=!savedMode||!!reason;
  const message=reason||'Ready to preview revision '+$('history-revision').value+'. Your saved terrain will remain unchanged until you accept.';
  if($('history-preview-help').textContent!==message)$('history-preview-help').textContent=message;
  $('history-preview').title=reason;
  $('history-older').disabled=historyLoading||historyError||!historyLoaded||historyCursor===null;
  $('history-older').textContent=historyLoading?'Loading…':!historyError&&historyLoaded&&historyCursor===null?'All revisions loaded':'Load older';
  $('history-older-help').textContent=historyLoading?'Loading a page of saved revisions.':historyError?'Use Refresh history to check for older revisions.':historyLoaded&&historyCursor===null?'All '+$('history-revision').options.length+' saved revisions are listed. There are no older entries to load.':historyLoaded?'More revisions are available. Load older adds up to 20 entries.':'History has not loaded yet.';
  $('history-refresh').disabled=historyLoading;
}

async function loadHistory(append=false) {
  if(historyLoading)return;historyLoading=true;historyError=false;updateHistoryControls();
  try {
    const result=await persistence.history(append?historyCursor:null);
    if(!append)$('history-revision').replaceChildren();
    for(const entry of result.entries){const option=document.createElement('option');option.value=String(entry.revision);option.textContent='Revision '+entry.revision+' · '+(entry.intent||'Terrain edit');$('history-revision').appendChild(option);}
    historyCursor=result.nextRevision;historyLoaded=true;
    $('history-summary').textContent='History read at saved revision '+result.head+'. Select an earlier revision to compare.';
  } catch(error){historyError=true;$('history-summary').textContent='History unavailable: '+error.message;}
  finally {historyLoading=false;$('history-older').disabled=historyCursor===null;render();}
}
$('history').onclick=()=>{const open=$('history-panel').hidden;$('history-panel').hidden=!open;$('history').setAttribute('aria-expanded',String(open));if(open)void loadHistory();};
$('history-refresh').onclick=()=>void loadHistory();
$('history-older').onclick=()=>{if(historyCursor!==null)void loadHistory(true);};
$('history-revision').onchange=()=>render();
$('history-preview').onclick=()=>{if($('history-preview').disabled)return;const revision=Number($('history-revision').value);void previewSavedRevision(()=>persistence.restore(snapshot.worldRevision,revision),'Revision '+revision+' preview');};
$('backup').hidden = !savedMode;
$('undo').hidden = !savedMode;
$('undo').onclick = () => previewSavedRevision(()=>persistence.undo(snapshot.worldRevision),'Undo preview for saved revision '+snapshot.worldRevision);
async function previewSavedRevision(fetchProposal,label) {
  if (busy || saving || persistence.pending() || previewRef !== acceptedRef) return;
  busy=true; $('preview').disabled=true; $('reset').disabled=true; $('reload').disabled=true; render();
  try {
    const request=await fetchProposal();
    const candidate=prepareTerrainEdit(snapshot,request,{terrainId:snapshot.terrain.id,allowedFeatureIds:request.operations.map(op=>op.target)}).candidate;
    disposeGesture(); undoRequest=request; busy=false;
    await evaluate(candidate);
    if (previewRef !== acceptedRef) $('status').textContent=label+'. Accept changes to save this as a new revision, or Reset preview to discard.';
    else undoRequest=null;
  } catch(error) { undoRequest=null; $('status').textContent=error.message==='NO_TERRAIN_CHANGE' ? 'That revision has the same terrain controls as the current saved base.' : error.message==='STALE_READ' ? 'Saved terrain has changed. Reload saved, then choose the revision again.' : 'Revision preview unavailable: '+error.message; }
  finally {busy=false; $('preview').disabled=!!persistence.pending(); $('reset').disabled=false; $('reload').disabled=false; render();}
}
$('backup').onclick = async () => {
  if (saving) return;
  $('backup').disabled = true;
  try { const copy = await persistence.backup(); $('status').textContent = 'Recovery copy verified for saved revision ' + copy.revision + '. Unsaved previews are not included.'; }
  catch (error) { $('status').textContent = 'Recovery copy unavailable: ' + error.message; }
  finally { $('backup').disabled = false; }
};
if (savedMode) $('persistence-note').textContent = 'Local saved fixture. Accept changes to save; Reset preview discards unsaved edits. Representation accuracy remains unqualified.';
if (savedMode) $('mode-note').textContent = 'Terrain · local saved fixture';
async function installSaved(next) {
  undoRequest = null;
  disposeGesture();
  const ref = await storeSurface(next.terrain, await evaluateTerrain(next.terrain));
  snapshot = next; if (!$("history-panel").hidden) void loadHistory(); registry.set(snapshotRef, snapshot); registry.set(sourceRef, next.terrain);
  release(acceptedRef); acceptedRef = retain(ref); setPreview(ref); release(ref); syncLevel(); render();
}
function updatePendingReview() {
  const pending=persistence?.pending();
  $('pending-review').hidden=!pending;
  $('pending-operations').replaceChildren();
  if (!pending) return;
  $('pending-summary').textContent='Pending edits from revision '+pending.baseWorldRevision+' · loaded saved revision '+snapshot.worldRevision+'. Coordinates are in millimetres. Reload saved checks whether an interrupted save already succeeded.';
  for (const operation of pending.operations) {
    const item=document.createElement('li'),point=snapshot.terrain.points.find(p=>p.id===operation.target);
    const coordinates=p=>p ? ['x','y','z'].map(axis=>axis.toUpperCase()+' '+p[axis]).join(', ') : 'unavailable';
    item.textContent=operation.target+' · requested: '+coordinates(operation.values)+' · loaded saved: '+coordinates(point);
    $('pending-operations').appendChild(item);
  }
}
async function recoverPendingPreview() {
  const request=persistence?.pending();
  if (!request) return '';
  if (request.baseWorldRevision!==snapshot.worldRevision)
    return 'Pending edits retained from revision '+request.baseWorldRevision+'. The view shows saved terrain. Review the pending coordinates below; use Reapply pending edits to check them against the latest saved terrain.';
  let ref=null;
  try {
    const candidate=prepareTerrainEdit(snapshot,request,{terrainId:snapshot.terrain.id,allowedFeatureIds:baseline.points.map(p=>p.id)}).candidate;
    ref=await storeSurface(candidate,await evaluateTerrain(candidate));
    disposeGesture(); setPreview(ref); syncLevel();
    return 'Pending preview restored for saved revision '+snapshot.worldRevision+'. Review the amber proposal, then Retry save or Reset preview. Nothing has been saved.';
  } catch(error) {
    return 'Pending edits retained, but their preview is unavailable: '+error.message+'. Review the pending coordinates below or Reset preview.';
  } finally {release(ref);render();}
}
async function recoverDraftPreview() {
  if(persistence?.pending())return recoverPendingPreview();
  const request=persistence?.draft();if(!request)return '';
  if(request.baseWorldRevision!==snapshot.worldRevision){
    persistence.replacePending(null,request);
    return recoverPendingPreview();
  }
  let ref=null;
  try {
    const candidate=prepareTerrainEdit(snapshot,request,{terrainId:snapshot.terrain.id,allowedFeatureIds:baseline.points.map(p=>p.id)}).candidate;
    ref=await storeSurface(candidate,await evaluateTerrain(candidate));
    disposeGesture();undoRequest=request;setPreview(ref);syncLevel();
    return 'Draft preview restored. Continue editing, Accept changes to save, or Reset preview to discard.';
  } catch(error){return 'Draft retained but preview unavailable: '+error.message;}
  finally{release(ref);render();}
}
$('accept').onclick = async () => {
  if (saving || busy || coordinateTimer!==null) return;
  saving = true; $('preview').disabled = true; $('reset').disabled = true; $('reload').disabled = true; render();
  try {
    const source = currentSource();
    const operations = source.points.filter(p => {
      const before = snapshot.terrain.points.find(q => q.id === p.id);
      return before.x !== p.x || before.y !== p.y || before.z !== p.z;
    }).map(p => ({type:'point.replace',target:p.id,values:{x:p.x,y:p.y,z:p.z,evidenceRefs:p.evidenceRefs}}));
    const request = persistence.pending() ?? undoRequest ?? makeTerrainRequest(snapshot,{requestId:crypto.randomUUID(),operations,intent:'Accept terrain edits'});
    const next = await persistence.save(request);
    await installSaved(next);
    $('status').textContent = 'Saved revision ' + snapshot.worldRevision + '. Changes will remain after restart.';
  } catch (error) { $('status').textContent = error.message + ' Your preview is retained. Retry save, or reload saved terrain to reconcile.'; }
  finally { saving = false; $('preview').disabled = !!persistence.pending(); $('reset').disabled = false; $('reload').disabled = false; $('accept').textContent = persistence.pending() ? 'Retry save' : 'Accept changes'; render(); }
};
$('reload').onclick = async () => {
  if (saving || busy) return; saving = true; render();
  try { await installSaved(await persistence.load()); $('status').textContent = await recoverDraftPreview() || 'Loaded saved revision ' + snapshot.worldRevision + '.'; }
  catch (error) { $('status').textContent = error.message; }
  finally { saving=false; $('preview').disabled=!!persistence.pending(); $('accept').textContent=persistence.pending()?'Retry save':'Accept changes'; render(); }
};
$('rebase').onclick = async () => {
  if (saving || busy || !persistence.pending()) return;
  const previous=persistence.pending();
  saving=true; $('preview').disabled=true; $('reset').disabled=true; $('reload').disabled=true; render();
  let baseRef=null,proposalRef=null;
  try {
    const result=await persistence.rebase();
    const candidate=prepareTerrainEdit(result.snapshot,result.request,{terrainId:result.snapshot.terrain.id,allowedFeatureIds:result.request.operations.map(op=>op.target)}).candidate;
    baseRef=await storeSurface(result.snapshot.terrain,await evaluateTerrain(result.snapshot.terrain));
    proposalRef=await storeSurface(candidate,await evaluateTerrain(candidate));
    // Keep the original retry intact until both replacement surfaces are ready.
    persistence.replacePending(previous,result.request);
    disposeGesture(); undoRequest=null; snapshot=result.snapshot;
    registry.set(snapshotRef,snapshot); registry.set(sourceRef,snapshot.terrain);
    release(acceptedRef); acceptedRef=retain(baseRef); setPreview(proposalRef); syncLevel();
    $('accept').textContent='Accept changes';
    $('status').textContent='Reapplied preview against saved revision '+snapshot.worldRevision+'. Review the amber proposal, then Accept changes or Reset preview. Nothing has been saved.';
    if (!$('history-panel').hidden) void loadHistory();
  } catch(error) {
    $('status').textContent=error.message==='REBASE_CONFLICT' ? 'Cannot reapply: controls '+error.conflicts.join(', ')+' changed in saved terrain. Your pending edit is retained. Reset preview and Reload saved to resolve manually.' :
      error.message==='ALREADY_SAVED' ? 'This edit is already saved. Use Reload saved to reconcile it.' :
      error.message==='REBASE_NOT_STALE' ? 'This edit already uses the latest saved revision. Review it and retry saving.' :
      'Cannot reapply: '+error.message+'. Your pending edit is retained.';
  } finally {
    release(baseRef); release(proposalRef); saving=false; $('preview').disabled=!!persistence.pending(); $('reset').disabled=false; $('reload').disabled=false; render();
  }
};
$('accept').textContent = persistence?.pending() ? 'Retry save' : 'Accept changes';
syncLevel();
async function initializePreview() {
  await evaluate(structuredClone(baseline));
  if (!acceptedRef || (!persistence?.pending()&&!persistence?.draft())) return;
  busy=true; $('reset').disabled=true; $('reload').disabled=true; render();
  try {$('status').textContent=await recoverDraftPreview();}
  finally {busy=false; $('reset').disabled=false; $('reload').disabled=false; render();}
}
void initializePreview();
