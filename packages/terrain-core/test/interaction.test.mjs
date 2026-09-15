import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createTerrainInteractionAdapter } from "../src/interaction-adapter.mjs";
import { evaluateTerrainSurface } from "../src/surface.mjs";
import { operationDigest } from "../demo/digest.mjs";

function setup() {
  const point = (id, x, y) => ({ id, revision: 0, x, y, z: 1000, evidenceRefs: ["survey"] });
  const snapshot = { branchId: "demo", worldRevision: 0, proposalRevision: null, terrain: {
    id: "terrain", kind: "terrain-controls", schema: "plasma-terrain-controls/1", surfaceRole: "design-ground", revision: 0,
    frameId: "site", datum: "local", units: "mm", source: { evidenceRef: "survey", contentDigest: "fixture", importerVersion: "test/1", registrationEvidenceRef: "site" },
    points: [point("a",0,0),point("b",10000,0),point("c",10000,10000),point("d",0,10000),point("e",5000,5000)],
    features: [{ id: "boundary", kind: "boundary", revision: 0, pointIds: ["a","b","c","d"] }] } };
  const registry = new Map(); let count = 0;
  const register = value => { const ref = "ref:" + ++count; registry.set(ref, value); return ref; };
  const start = { x: 100, y: 100 }, planTransform = { scaleX: .1, scaleY: -.1 };
  const adapter = createTerrainInteractionAdapter({ snapshot, pointId: "e", sessionId: "session", start, planTransform,
    binding: { worldRevisionRef: "world", actorRef: "human", entityRef: "terrain", controlAnchorRef: "anchor:e",
      modifiersRef: "xy", deltaSchemaRef: "point.replace" }, register, resolve: ref => registry.get(ref), remove: ref => registry.delete(ref),
    digest: operationDigest, evaluate: source => evaluateTerrainSurface(source), storeSurface: async (source, mesh) => register({ source, mesh }) });
  return { snapshot, registry, adapter, start, planTransform };
}
test("XY adapter keeps Z, pins projection and leaves source unchanged through worker preview", async () => {
  const s = setup(), before = JSON.stringify(s.snapshot);
  s.start.x = 900; s.planTransform.scaleX = 10; // Caller changes cannot redirect the gesture.
  const overlay = s.adapter.createOverlay({ x: 150, y: 80 }, 1);
  const operation = s.registry.get(overlay.deltas[0].payloadRef);
  assert.deepEqual(operation.values, { x: 5500, y: 5200, z: 1000, evidenceRefs: ["survey"] });
  const response = await s.adapter.requestPreview({ sessionId: overlay.sessionId, baseRevision: overlay.baseRevision,
    inputSequence: 1, operationDigest: overlay.operationDigest, deltaArtifactRef: overlay.deltas[0].payloadRef });
  assert.equal(response.status, "ready"); assert.equal(response.assessment.status, "locally_valid");
  assert.equal(JSON.stringify(s.snapshot), before); assert.equal(s.registry.get(response.artifactRef).mesh.vertices.length, 5);
});
test("invalid movement still produces a ghost delta but cannot become a valid surface", async () => {
  const s = setup(), overlay = s.adapter.createOverlay({ x: 5000, y: 100 }, 1);
  assert.equal(overlay.currentness, "pending");
  await assert.rejects(s.adapter.requestPreview({ sessionId: "session", baseRevision: "world", inputSequence: 1,
    operationDigest: overlay.operationDigest, deltaArtifactRef: overlay.deltas[0].payloadRef }), /outside/i);
});
test("bounded synchronous digest matches native SHA-256 across block and Unicode boundaries", () => {
  for (const text of ["", "abc", "Plasma → terrain", ...[55,56,63,64,65,1000,8192].map(n => "a".repeat(n))])
    assert.equal(operationDigest(text), "sha256:" + createHash("sha256").update(text).digest("hex"));
  assert.throws(() => operationDigest("a".repeat(8193)), /budget/);
});
