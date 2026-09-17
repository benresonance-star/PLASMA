# PLS-RUN-01 focused implementation review

Reviewed 2026-09-18 against PR #4, following baseline `eba403f`.

Scope: candidate RunRecord contract, execution storage, gateway mapping, publication transaction, retries, restart and recovery. This review does not qualify the deferred browser transport, production authentication or real FEA.

## Findings fixed

- **P1 — sparse data could damage retained history.** A terminal record with `assumptions: new Array(2)` passed validation and was serialized as invalid JSON. Reject sparse arrays before persistence. The regression verifies rejection, absence of the rejected record and successful reopening of existing history.
- **P2 — publication retry trusted unchecked receipt content.** Changing a stored receipt's revision to R0 could make a retry report success at the wrong revision. Verify status, revision, digest, actor, branch and request against the retained event before returning it. Apply the same verification on reopening and recovery-copy validation.
- **P2 — submission retry trusted an unchecked proposal link.** Redirecting a submission receipt to a second proposal caused the original retry to return that second proposal. Verify the stored proposal's actor and payload digest against the receipt, on replay and reopening.

All three regression tests reproduced their findings before the fixes. The updated harness passes 161 checks: 70 gateway/runtime/HTTP/provenance, 70 terrain and 21 interaction/navigation. It also runs create, inspect and versioned rerun in separate processes. Source identities are retained in `packages/world-runtime/evidence/provenance-tests.json`.

## Contract and authority review

Run completion and proposal submission do not publish World State. Publication resolves the retained proposal, checks host authorization (including retries), compares its exact operation, reevaluates the current domain and commits the event, provenance, revision, head and receipt in one SQLite transaction. Four interruption-stage tests exercise rollback and lost-response recovery.

Original revisions, captured inputs, artifacts and completed records remain immutable. Reruns require the same retained inputs and original revision. Currentness remains a derived revision-identity comparison; it does not attest to solver validity or producer trust. Property explanation follows the actual value-changing event.

Trusted host boundaries remain material: capabilities must not receive the world factory, execution writer or database. Database hashes detect inconsistent content, not coordinated modification by a database writer. No additional blocking finding was identified within this bounded review; that is not a production security certification.

## Next product slice

Expose run inspection in the saved demo through an authorized read path: original revision and inputs, producer version, outputs, publication lineage and derived currentness. A rerun should create a separate record and preserve the displayed original. Add browser acceptance checks for reopen, inspection and rerun before claiming that UI workflow.
