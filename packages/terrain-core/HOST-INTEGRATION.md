# Terrain host transaction and worker adapter

Status: implemented adapter and worker transport, **not installed in the live host**.

The adapter connects the existing T1 command and surface modules to an injected
WorldTransaction host. It contains no world-state database or permissive fallback.
The current development environment is unavailable and the exposed Sites list
does not include the terrain workbench. These ports therefore remain integration
requirements, not a claim of deployed persistence.

## Ownership and execution

The workbench owns the O(1) point interaction overlay. The bridge belongs in the
host runtime outside the pointer/render loop: source checks and independent mesh
validation are bounded but synchronous. Surface generation can run in the supplied
dedicated module worker. Merely making a function async does not move CPU work
off the main thread.

The host must supply the authenticated actor and a unique interaction session ID.
Never accept a self-declared actor or capability from an untrusted client.

```js
import { createTerrainBridge } from "@spds/terrain-core/bridge";
import { createTerrainWorkerEvaluator } from "@spds/terrain-core/worker-client";

const evaluator = createTerrainWorkerEvaluator(
  new Worker(workerUrl, { type: "module" })
); // host build resolves workerUrl to the exported surface-worker entry

const bridge = createTerrainBridge({
  host: worldTransactionHost,
  evaluate: evaluator.evaluate,
  actor: authenticatedActor,
  sessionId: interactionSessionId
});

const preview = await bridge.preview(typedTerrainRequest, inputSequence);
if (preview.status === "ready") {
  // Present as candidate geometry only; keep the accepted model underneath.
  // User acceptance or an explicit host-granted capability initiates commit.
  const receipt = await bridge.commit(preview.previewId);
}
```

The worker client takes ownership of the worker. Dispose it when the owning
runtime no longer needs it. A timeout terminates it; create a new dedicated worker
before retrying. The bridge itself cannot promise to interrupt arbitrary injected
evaluators. It discards their stale output and bounds the queue instead.

## Host port

Outside the transaction:

- `readSnapshot()`: return the current branch/world/proposal heads and terrain.
- `authorize(actor, request, "preview")`: obtain the permitted terrain/target scope.
- `withWorldTransaction(callback)`: invoke the callback with the transaction port.

Inside the transaction:

- `readSnapshot()`: transactionally consistent host projection.
- `authorize(actor, request, "commit")`: current permissions and human/agent acceptance policy.
- `getReceipt({actorId, branchId, requestId})`: durable request receipt or absence.
- `validateCandidate({actor, request, candidate, surface})`: expand the full
  causal impact and evaluate every applicable hard invariant. Return
  `{status: "pass", ...evidence}` only when the whole required gate passes.
- `commitTerrain(write)`: atomically install the terrain state, event/provenance,
  durable receipt and new world revision. Surface/proposal reconciliation and
  dependent representation invalidation remain host responsibilities.

The write carries the authenticated actor, request and normalized request key,
candidate, validated surface, host validation evidence and session/sequence.

**Required host guarantee:** competing transactions are serialized or have
equivalent compare-and-swap and conflict protection. No external writes may
invalidate the checked dependency snapshot between validation and installation.
The state/event/receipt commit is all-or-nothing and durable before the enclosing
`withWorldTransaction` promise resolves. Callback failure rolls back staged writes.
Authorization changes need the host's own serialization/recheck policy too.

Long hard validation must not monopolize the UI. A production host can prepare
off-thread and revalidate all dependencies at its atomic boundary. It must not
weaken the above guarantee to shorten a lock.

The bridge cannot manufacture these guarantees around a non-atomic legacy
transaction engine. Do not wire `commitTerrain` to a direct entity assignment
or call this production integration complete until fault-injection/reopen tests
pass against the actual store.

## Preview and commit lifecycle

Only one evaluation runs at a time and one pending request is retained.
A newer sequence supersedes the pending request and invalidates the previous
checked preview. Stale or cancelled jobs resolve as `superseded`; their late
results cannot become the current preview.

After evaluation the bridge independently validates the returned surface and
checks a fresh snapshot. The result is still a candidate. At commit it checks
authorization again, consults the receipt ledger, rebuilds the candidate from
the transaction snapshot, compares it with the private checked candidate,
validates the mesh, and calls the host's complete hard-validation gate.

Callers receive copies. Editing a preview response cannot change the private
candidate later submitted to the host.

The request envelope remains proposal-only. Calling bridge.commit does not grant
authority: host authorization must enforce explicit human acceptance or a scoped
auto-commit grant. AI cannot make itself the human actor or waive invariants.

A repeated request with the same normalized content returns the original receipt.
Changed content under the same actor/branch/request ID fails. Retries after an
unknown storage outcome must consult this durable ledger, not assume failure.
The current session retains its last checked preview for retries; cross-session
receipt lookup/recovery is a host responsibility.

Cancellation before commit submission prevents submission. Once commitTerrain
has begun, cancel reports that an outcome is still pending; the commit may succeed.
Always await and reconcile that outcome. Reversal then needs an ordinary inverse
WorldTransaction, not a promised rollback.

## Validation evidence and remaining work

51 behavioral cases pass: the 34 prior control/surface cases plus 17 adapter and
transport cases. New coverage includes bounded queues, late output, stale heads,
caller mutation, host authorization, hard failures, injected storage failure,
idempotent receipts, competing sessions, worker correlation/disposal/timeout and
both cancellation sides of commit submission.

Execution used V8 orchestration with injected imports and a recursive plain-data
clone substitute because structuredClone is absent there. The persisted source
uses standard structuredClone. Tests use an explicitly simulated, serialized
copy-on-write host and a fake worker event port; they do not prove production
durability, native structuredClone semantics, actual Worker module loading,
browser responsiveness or full monorepo compatibility.

Next: wire these ports to the live source and worker build, render accepted and
candidate terrain in plan/3D/section, then verify persistence/reopen, failed writes,
cancel/commit races and device latency against the real application.
