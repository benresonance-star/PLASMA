import test from "node:test";
import assert from "node:assert/strict";
import { createInteractionSession } from "../src/index.mjs";

const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const frames = [], jobs = [], freed = [], deltas = [];
  const identity = { sessionId: "gesture", baseRevision: "world:1", semanticAnchorRef: "control:a" };
  const input = x => ({ ...identity, x });
  const session = createInteractionSession({ identity,
    policy: { id: "bounded", maximumInFlightRequests: 1, maximumQueuedRequests: 1, representationContractRef: "mesh" },
    createOverlay: (observation, sequence) => ({ schemaVersion: "PLS-INT-01/0.1.0", ...identity,
      inputSequence: sequence, operationDigest: "digest:" + observation.x, actorRef: "human", operation: "move",
      targets: [{ entityId: "entity:a", semanticReference: identity.semanticAnchorRef }], modifiersRef: "modifiers",
      deltas: [{ kind: "domain", schemaRef: "delta", payloadRef: "delta:" + sequence }], speculativeGeometry: null,
      assessment: { status: "unknown", evaluatorRefs: [], ruleRevisionRefs: [], evidenceRefs: [], diagnosticsRefs: [] },
      currentness: "pending", lifecycle: "active", proposalRef: null, transactionRef: null, committedRevision: null }),
    requestPreview: request => new Promise((resolve, reject) => jobs.push({ request, resolve, reject })),
    publishFrame: (overlay, latencyClass) => frames.push({ overlay, latencyClass }),
    releasePreview: response => freed.push(response.artifactRef), releaseOverlay: overlay => deltas.push(overlay.deltas[0].payloadRef) });
  const response = job => ({ ...job.request, producerRef: "worker", status: "ready", artifactRef: "mesh:" + job.request.inputSequence,
    assessment: { status: "locally_valid", evaluatorRefs: [], ruleRevisionRefs: [], evidenceRefs: [], diagnosticsRefs: [] }, achievedErrorEvidenceRefs: [] });
  return { session, frames, jobs, freed, deltas, identity, input, response };
}
test("begin pins identity and publishes canonical reflex overlay before any preview resolves", () => {
  const s = setup(); s.session.begin(s.input(0));
  assert.equal(s.frames[0].latencyClass, "reflex"); assert.equal(s.frames[0].overlay.baseRevision, "world:1");
  assert.equal(s.frames[0].overlay.currentness, "pending"); assert.equal(s.jobs.length, 1);
});
test("rapid moves retain only the latest pending request; obsolete results never present", async () => {
  const s = setup(); s.session.begin(s.input(0));
  for (let x = 1; x <= 100; x++) s.session.update(s.input(x));
  assert.equal(s.session.state().activeJobs, 1); assert.equal(s.session.state().pendingJobs, 1);
  assert.equal(s.frames.length, 101); assert.equal(s.jobs.length, 1);
  s.jobs[0].resolve(s.response(s.jobs[0])); await tick();
  assert.equal(s.jobs.length, 2); assert.equal(s.jobs[1].request.inputSequence, 101);
  assert.equal(s.frames.filter(f => f.overlay.currentness === "current").length, 0);
  assert.deepEqual(s.freed, ["mesh:1"]);
  s.jobs[1].resolve(s.response(s.jobs[1])); await tick();
  assert.equal(s.session.state().overlay.speculativeGeometry.sourceInputSequence, 101);
});
test("release retains its final sample and waits for that exact result", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.session.release(s.input(42));
  assert.equal(s.session.state().overlay.lifecycle, "resolving");
  assert.ok(s.frames.some(f => f.overlay.lifecycle === "released"));
  s.jobs[0].resolve(s.response(s.jobs[0])); await tick();
  assert.equal(s.jobs[1].request.operationDigest, "digest:42");
  s.jobs[1].resolve(s.response(s.jobs[1])); await tick();
  assert.equal(s.session.state().overlay.lifecycle, "awaiting_acceptance");
  assert.equal(s.session.state().overlay.transactionRef, null);
});
test("cancel drops pending work and releases uncancellable late artifacts", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.session.update(s.input(1)); s.session.cancel();
  const count = s.frames.length;
  s.jobs[0].resolve(s.response(s.jobs[0])); await tick();
  assert.equal(s.frames.length, count); assert.equal(s.jobs.length, 1);
  assert.equal(s.session.state().overlay.lifecycle, "cancelled"); assert.deepEqual(s.freed, ["mesh:1"]);
});
test("worker failure is inspectable, keeps feedback live, and permits a corrected move", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.jobs[0].reject(Error("worker failed")); await tick();
  assert.equal(s.session.state().overlay.assessment.status, "failed");
  s.session.update(s.input(1)); assert.equal(s.session.state().overlay.currentness, "pending");
});
test("release after evaluation failure does not claim acceptance readiness", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.jobs[0].reject(Error("worker failed")); await tick();
  s.session.release(); assert.equal(s.session.state().overlay.lifecycle, "failed");
});
test("wrong target or base revision cannot redirect an existing gesture", () => {
  const s = setup(); s.session.begin(s.input(0));
  assert.throws(() => s.session.update({ ...s.input(1), semanticAnchorRef: "control:b" }), /pinned/);
  assert.throws(() => s.session.update({ ...s.input(1), baseRevision: "world:2" }), /pinned/);
  assert.equal(s.session.state().overlay.inputSequence, 1);
});
test("response correlation checks session, revision, sequence and operation digest", () => {
  for (const key of ["sessionId", "baseRevision", "inputSequence", "operationDigest"]) {
    const s = setup(); s.session.begin(s.input(0));
    assert.equal(s.session.applyPreview({ ...s.response(s.jobs[0]), [key]: "wrong" }), false);
    assert.equal(s.session.state().overlay.currentness, "pending");
  }
});
test("new input clears resolved geometry instead of presenting an obsolete mesh as current", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.jobs[0].resolve(s.response(s.jobs[0])); await tick();
  s.session.update(s.input(1)); assert.equal(s.session.state().overlay.speculativeGeometry, null);
  assert.deepEqual(s.freed, ["mesh:1"]);
});
test("published data and state snapshots cannot mutate runtime state", () => {
  const s = setup(); s.session.begin(s.input(0)); s.frames[0].overlay.targets[0].entityId = "bad";
  s.session.state().overlay.lifecycle = "committing";
  assert.equal(s.session.state().overlay.targets[0].entityId, "entity:a");
  assert.equal(s.session.state().overlay.lifecycle, "active");
});
test("close releases current artifacts and denies more input", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.jobs[0].resolve(s.response(s.jobs[0])); await tick();
  s.session.close(); s.session.close();
  assert.deepEqual(s.freed, ["mesh:1"]); assert.deepEqual(s.deltas, ["delta:1"]);
  assert.throws(() => s.session.update(s.input(1)), /active/);
});
test("release without a new sample retains an already resolved preview", async () => {
  const s = setup(); s.session.begin(s.input(0)); s.jobs[0].resolve(s.response(s.jobs[0])); await tick();
  s.session.release(); assert.equal(s.session.state().overlay.lifecycle, "awaiting_acceptance");
  assert.equal(s.jobs.length, 1);
});
test("duplicate terminal response cannot dispose or replace the current candidate", async () => {
  const s = setup(); s.session.begin(s.input(0)); const response = s.response(s.jobs[0]);
  s.jobs[0].resolve(response); await tick();
  assert.equal(s.session.applyPreview(response), false); assert.deepEqual(s.freed, []);
  assert.equal(s.session.state().overlay.currentness, "current");
});
test("oversized observations fail before creating or scheduling an overlay", () => {
  const s = setup();
  assert.throws(() => s.session.begin({ ...s.input(0), raw: "x".repeat(65536) }), /budget/);
  assert.equal(s.jobs.length, 0); assert.equal(s.frames.length, 0);
});
