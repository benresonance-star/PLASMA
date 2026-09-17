const copy = value => structuredClone(value);
const matches = (a, b) => ["sessionId", "baseRevision", "inputSequence", "operationDigest"].every(k => a[k] === b[k]);

/** One gesture, one running preview and one replaceable pending preview.
 * Callbacks belong to the trusted runtime. No domain or transaction authority lives here.
 * createOverlay and publishFrame must be synchronous and bounded.
 */
export function createInteractionSession({ identity, policy, createOverlay, requestPreview, publishFrame,
  releaseOverlay = () => {}, releasePreview = () => {} }) {
  if (!identity?.sessionId || !identity.baseRevision || !identity.semanticAnchorRef ||
      policy?.maximumInFlightRequests !== 1 || policy.maximumQueuedRequests !== 1 ||
      !policy.id || !policy.representationContractRef ||
      ![createOverlay, requestPreview, publishFrame].every(f => typeof f === "function"))
    throw Error("A pinned identity, bounded policy and runtime callbacks are required.");
  identity = copy(identity); policy = copy(policy);
  const byteLimit = policy.maximumTransientBytes ?? 65536;
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1024 || byteLimit > 1048576)
    throw Error("A bounded transient byte budget is required.");
  const checkSize = value => {
    if (new TextEncoder().encode(JSON.stringify(value)).length > byteLimit)
      throw Error("Transient payload byte budget exceeded.");
  };
  let overlay = null, sequence = 0, settledSequence = 0, active = null, pending = null, released = false, closed = false, ready = null;
  const publish = latencyClass => publishFrame(copy(overlay), latencyClass);
  const clearReady = () => { if (ready) releasePreview(ready); ready = null; };
  function applyPreview(response) {
    if (closed || !overlay || !matches(overlay, response)) { releasePreview(response); return false; }
    if (settledSequence === sequence) {
      if (response.artifactRef !== ready?.artifactRef) releasePreview(response);
      return false;
    }
    checkSize(response);
    if (!["ready", "pending", "failed", "unsupported", "cancelled"].includes(response.status) ||
        !["unknown", "pending", "locally_valid", "conflicted", "failed"].includes(response.assessment?.status))
      throw Error("Invalid canonical preview response.");
    if (response.status !== "pending") settledSequence = sequence;
    if (response.status === "ready" && response.artifactRef) {
      clearReady(); ready = copy(response);
      overlay.speculativeGeometry = { artifactRef: response.artifactRef, transientRenderHandle: null,
        representationContractRef: policy.representationContractRef, fidelity: "approximate",
        sourceRevision: identity.baseRevision, sourceInputSequence: sequence };
      overlay.assessment = copy(response.assessment);
      overlay.currentness = "current";
      overlay.lifecycle = released ? "awaiting_acceptance" : "active";
    } else {
      clearReady(); overlay.speculativeGeometry = null;
      overlay.assessment = copy(response.assessment);
      overlay.currentness = response.status === "pending" ? "pending" : "unavailable";
      overlay.lifecycle = released ? (response.status === "pending" ? "resolving" : "failed") : "active";
      releasePreview(response);
    }
    publish("local_preview"); return true;
  }
  async function run(request) {
    active = request;
    try { applyPreview(await requestPreview(copy(request))); }
    catch (error) {
      applyPreview({ ...request, producerRef: "interaction-preview", status: "failed", artifactRef: null,
        assessment: { status: "failed", evaluatorRefs: [], ruleRevisionRefs: [], evidenceRefs: [], diagnosticsRefs: [] },
        achievedErrorEvidenceRefs: [] });
    } finally {
      active = null;
      if (!closed && pending) { const next = pending; pending = null; void run(next); }
    }
  }
  function update(observation) {
    if (closed || released) throw Error("Gesture is no longer active.");
    checkSize(observation);
    if (observation.semanticAnchorRef !== identity.semanticAnchorRef || observation.baseRevision !== identity.baseRevision)
      throw Error("Input does not match the pinned gesture.");
    const next = createOverlay(copy(observation), sequence + 1);
    try { checkSize(next); } catch (error) { releaseOverlay(next); throw error; }
    if (next.schemaVersion !== "PLS-INT-01/0.1.0" || next.sessionId !== identity.sessionId ||
        next.baseRevision !== identity.baseRevision || next.inputSequence !== sequence + 1 ||
        !next.targets.some(t => t.semanticReference === identity.semanticAnchorRef))
      throw Error("Domain overlay does not match the pinned gesture.");
    const previous = overlay;
    overlay = copy(next); sequence++;
    clearReady();
    const request = { sessionId: overlay.sessionId, baseRevision: overlay.baseRevision, inputSequence: sequence,
      operationDigest: overlay.operationDigest, targets: copy(overlay.targets), deltaArtifactRef: overlay.deltas[0].payloadRef,
      representationContractRef: policy.representationContractRef, policyRef: policy.id };
    // Publish feedback before starting any domain evaluation.
    publish("reflex");
    if (active) pending = request; else void run(request);
    if (previous) releaseOverlay(previous);
    return copy(overlay);
  }
  return Object.freeze({
    begin(observation) { if (overlay) throw Error("Gesture already begun."); return update(observation); },
    update(observation) { if (!overlay) throw Error("Begin the gesture first."); return update(observation); },
    release(observation) {
      if (closed || released || !overlay) throw Error("Gesture is no longer active.");
      if (observation) update(observation); // Pointer-up is a meaningful final sample.
      released = true; overlay.lifecycle = "released"; publish("reflex");
      overlay.lifecycle = overlay.currentness === "current" ? "awaiting_acceptance" :
        overlay.assessment.status === "failed" ? "failed" : "resolving";
      publish("local_preview");
    },
    applyPreview,
    cancel() {
      if (closed) return;
      closed = true; pending = null; clearReady();
      if (overlay) { overlay.lifecycle = "cancelled"; overlay.currentness = "unavailable";
        overlay.speculativeGeometry = null; publish("reflex"); releaseOverlay(overlay); }
    },
    close() {
      if (!closed) { closed = true; pending = null; clearReady();
        if (overlay) { overlay.lifecycle = "closed"; overlay.speculativeGeometry = null;
          overlay.currentness = "unavailable"; publish("reflex"); releaseOverlay(overlay); } }
    },
    state: () => ({ overlay: copy(overlay), activeJobs: active ? 1 : 0, pendingJobs: pending ? 1 : 0, closed })
  });
}
