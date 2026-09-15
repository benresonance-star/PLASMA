import { prepareTerrainEdit, makeTerrainRequest } from "../src/index.mjs";
import { mapTerrainSurface } from "../src/common-contracts.mjs";
import { createPresentationConsumer } from "../src/presentation-consumer.mjs";
import { createSvgTerrainSink } from "../src/svg-terrain.mjs";
import { createTerrainWorkerEvaluator } from "../src/worker-client.mjs";
import { createTerrainInteractionAdapter } from "../src/interaction-adapter.mjs";
import { createInteractionSession } from "../../interaction-reflex/src/index.mjs";
import { operationDigest } from "./digest.mjs";

const $ = id => document.getElementById(id), registry = new Map(), surfaces = new Map();
let refNumber = 0, frameRefs = [];
const register = value => { const ref = "demo:" + ++refNumber; registry.set(ref, value); return ref; };
const baseline = { id: "terrain", kind: "terrain-controls", schema: "plasma-terrain-controls/1", surfaceRole: "design-ground",
  revision: 0, frameId: "SITE-DEMO", datum: "Synthetic local datum", units: "mm",
  source: { evidenceRef: "synthetic-fixture", contentDigest: "demo-fixture-v1", importerVersion: "demo/1", registrationEvidenceRef: "local-frame-demo" },
  points: Array.from({ length: 25 }, (_, i) => ({ id: "p" + i, revision: 0, x: (i % 5) * 4000, y: Math.floor(i / 5) * 4000,
    z: 100000 + (i % 5) * 80 + Math.floor(i / 5) * 150, evidenceRefs: ["synthetic-fixture"] })),
  features: [{ id: "boundary", revision: 0, kind: "boundary", pointIds: [0,1,2,3,4,9,14,19,24,23,22,21,20,15,10,5].map(i => "p" + i) },
    { id: "ridge", revision: 0, kind: "breakline", pointIds: ["p7", "p12", "p17"] }] };
const snapshot = { branchId: "demo", worldRevision: 0, proposalRevision: null, terrain: baseline };
const snapshotRef = register(snapshot), sourceRef = register(baseline);
const anchorRefs = new Map(baseline.points.map(p => [p.id, register({ pointId: p.id, terrainId: baseline.id })]));
registry.set("SITE-DEMO", { units: "mm", datum: baseline.datum });
registry.set("demo-preview-only", { allow: ["read", "preview"], commit: false });
let selected = "p12", mode = "plan", frameSequence = 0, inputSequence = 0, projection = null;
let acceptedRef = null, previewRef = null, session = null, adapter = null, sessionStartRef = null, overlay = null;
let busy = false, jobSequence = 0, disposed = false;
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
function syncLevel() { $("level").value = currentSource().points.find(p => p.id === selected).z; }
function project(p) {
  return mode === "plan" ? { x: 110 + p.x * .035, y: 600 - p.y * .035 } :
    { x: 400 + (p.x - p.y) * .020, y: 145 + (p.x + p.y) * .011 - (p.z - 100000) * .055 };
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
    worldSnapshotRef: snapshotRef, viewContextRef: frameRegister({ mode, viewBox: [0,0,800,640] }) };
  const anchorMapRef = frameRegister({ sourceKey: shown.mesh.sourceKey });
  const dragging = overlay && !["cancelled", "closed"].includes(overlay.lifecycle);
  const delta = dragging && registry.get(overlay.deltas[0].payloadRef);
  const anchors = shown.source.points.map(p => {
    const position = delta?.target === p.id ? delta.values : p, screen = project(position);
    return { semanticAnchorRef: anchorRefs.get(p.id), status: "exact", editable: true,
      screenX: screen.x, screenY: screen.y, label: p.id + " · level " + p.z + " millimetres", selected: p.id === selected };
  });
  const records = [{ record: base, role: "accepted" }];
  if (shown !== base) records.push({ record: shown, role: "candidate" });
  projection = { ...context, anchorMapRef, hitMapRef: frameRegister({ frameSequence, anchorMapRef }), anchors,
    allowDrag: mode === "plan" && !busy, ghost: delta ? project(delta.values) : null,
    surfaces: records.map(({ record, role }) => ({ responseRef: record.response.response_id, role,
      vertices: record.mesh.vertices.map(p => ({ ...project(p), height: p.z - 100000 })),
      triangles: record.mesh.triangles, segments: record.mesh.constraints })) };
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
  $("cancel").disabled = !dragging;
}
function disposeGesture(keepPointer = false) {
  if (!keepPointer) sink.cancelPointer();
  session?.close(); adapter?.cancel(); session = null; adapter = null; overlay = null;
  release(sessionStartRef); sessionStartRef = null;
}
function cancelGesture() { session?.cancel(); adapter?.cancel(); sink.cancelPointer(); }
function beginGesture(event, observation) {
  if (busy || mode !== "plan") { sink.cancelPointer(); return; }
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
      if (next.lifecycle === "awaiting_acceptance") setPreview(next.speculativeGeometry.artifactRef);
      if (next.lifecycle === "cancelled") setPreview(sessionStartRef);
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
async function evaluate(source) {
  if (!worker || busy) return;
  busy = true; $("preview").disabled = true; $("reset").disabled = true;
  try {
    const ref = await storeSurface(source, await evaluateTerrain(source));
    if (disposed) { release(ref); return; }
    if (!acceptedRef) acceptedRef = retain(ref);
    setPreview(ref); release(ref); syncLevel(); render();
    $("status").textContent = "25 controls · 32 triangles · drag a control in Plan. Escape cancels. Changes are temporary.";
  } catch (error) { $("status").textContent = "Preview unavailable: " + error.message; }
  finally { busy = false; $("preview").disabled = false; $("reset").disabled = false; if (!disposed && acceptedRef) render(); }
}
for (const p of baseline.points) { const o = document.createElement("option"); o.value = p.id; o.textContent = p.id; $("point").appendChild(o); }
$("point").value = selected;
$("point").onchange = () => { selected = $("point").value; syncLevel(); render(); };
$("preview").onclick = () => {
  try {
    const z = Number($("level").value);
    if (!$("level").value.trim() || !Number.isSafeInteger(z)) throw Error("Enter an integer level in millimetres.");
    if (session?.state().activeJobs) throw Error("Let the current terrain preview finish first.");
    disposeGesture();
    const source = currentSource(), point = source.points.find(p => p.id === selected), local = { ...snapshot, terrain: source };
    const request = makeTerrainRequest(local, { requestId: "level-" + ++jobSequence,
      operations: [{ type: "point.replace", target: selected, values: { x: point.x, y: point.y, z, evidenceRefs: point.evidenceRefs } }] });
    void evaluate(prepareTerrainEdit(local, request, { terrainId: "terrain", allowedFeatureIds: [selected] }).candidate);
  } catch (error) { $("status").textContent = error.message; }
};
for (const view of ["plan", "axon"]) $(view).onclick = () => {
  if (session?.state().overlay?.lifecycle === "active") cancelGesture();
  mode = view; for (const id of ["plan", "axon"]) $(id).setAttribute("aria-pressed", String(id === view)); render();
};
$("cancel").onclick = cancelGesture;
window.addEventListener("keydown", event => { if (event.key === "Escape") cancelGesture(); });
window.addEventListener("resize", () => { if (session?.state().overlay?.lifecycle === "active") cancelGesture(); });
$("reset").onclick = () => { cancelGesture(); disposeGesture(); setPreview(acceptedRef); syncLevel(); render(); $("status").textContent = "Original fixture restored."; };
window.addEventListener("pagehide", () => {
  disposed = true; disposeGesture(); consumer.release("terrain-demo", 1); sink.dispose(); worker?.dispose();
  workerPending?.reject(Error("Preview closed.")); workerPending = null;
  release(previewRef); release(acceptedRef); for (const ref of frameRefs) registry.delete(ref);
});
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
syncLevel(); void evaluate(structuredClone(baseline));
