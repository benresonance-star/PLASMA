import { makeTerrainRequest, beginTerrainPointInteraction, terrainRequestKey } from "./index.mjs";
import { mapTerrainOverlay } from "./common-contracts.mjs";
import { createTerrainBridge } from "./bridge.mjs";

/** Domain side of a single XY drag. The projection is pinned at pointer-down.
 * Register/digest are trusted host services, never passed to the presentation sink.
 */
export function createTerrainInteractionAdapter({ snapshot, pointId, sessionId, binding, start,
  planTransform, register, resolve, remove, digest, evaluate, storeSurface }) {
  snapshot = structuredClone(snapshot); binding = structuredClone(binding);
  start = { ...start }; planTransform = { ...planTransform };
  if (![planTransform.scaleX, planTransform.scaleY].every(n => Number.isFinite(n) && n !== 0))
    throw Error("An invertible plan projection is required.");
  const point = snapshot.terrain.points.find(p => p.id === pointId);
  if (!point) throw Error("Unknown terrain control.");
  const interaction = beginTerrainPointInteraction(snapshot, pointId, sessionId);
  const capability = { terrainId: snapshot.terrain.id, allowedFeatureIds: [pointId] };
  const bridge = createTerrainBridge({ sessionId, actor: { id: binding.actorRef, kind: "human" }, evaluate,
    host: { readSnapshot: () => snapshot, authorize: (_actor, _request, purpose) => {
      if (purpose !== "preview") throw Error("This fixture has no commit authority.");
      return capability;
    }, withWorldTransaction: () => { throw Error("No authoritative host is installed."); } } });
  return Object.freeze({
    createOverlay(observation, inputSequence) {
      const position = { x: point.x + Math.round((observation.x - start.x) / planTransform.scaleX),
        y: point.y + Math.round((observation.y - start.y) / planTransform.scaleY), z: point.z };
      const payload = { type: "point.replace", target: pointId, values: { ...position, evidenceRefs: point.evidenceRefs } };
      const operationDigest = digest(terrainRequestKey({ baseRevision: binding.worldRevisionRef,
        actorRef: binding.actorRef, target: binding.controlAnchorRef, modifiersRef: binding.modifiersRef, payload }));
      interaction.update(position, inputSequence);
      return mapTerrainOverlay(interaction.overlay(), { ...binding, controlId: pointId,
        localPin: interaction.overlay(), operationDigest, deltaPosition: position, deltaArtifactRef: register(payload) });
    },
    async requestPreview(request) {
      // Capture the immutable delta before awaiting; superseded overlay refs can then expire.
      const operation = structuredClone(resolve(request.deltaArtifactRef));
      const terrainRequest = makeTerrainRequest(snapshot, { requestId: sessionId + ":" + request.inputSequence,
        operations: [operation], intent: "Move terrain control in plan XY" });
      const result = await bridge.preview(terrainRequest, request.inputSequence);
      if (result.status !== "ready") return { ...request, status: "cancelled", artifactRef: null,
        assessment: { status: "unknown", evaluatorRefs: [], ruleRevisionRefs: [], evidenceRefs: [], diagnosticsRefs: [] } };
      const artifactRef = await storeSurface(result.candidate.candidate, result.surface);
      return { sessionId: request.sessionId, baseRevision: request.baseRevision, inputSequence: request.inputSequence,
        operationDigest: request.operationDigest, producerRef: "terrain-worker/1", status: "ready", artifactRef,
        assessment: { status: "locally_valid", evaluatorRefs: ["terrain-topology/1"], ruleRevisionRefs: [], evidenceRefs: [], diagnosticsRefs: [] },
        achievedErrorEvidenceRefs: [] };
    },
    releaseOverlay: overlay => remove(overlay.deltas[0].payloadRef),
    cancel: () => { interaction.cancel(); bridge.cancel(); }
  });
}
