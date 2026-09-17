# PLS-RUN-01 — durable computation provenance

Status: candidate 0.1.0, bounded reference implementation. This is an execution-layer extension of PLS-15, not an eighth kernel primitive or a schema freeze. Decision: CON-031. It supersedes no kernel authority rule.

## Requirement

Every retained consequential computation has a permanently addressable RunRecord. Completing work or storing its results never changes semantic World State. Only an authorized, freshly evaluated WorldTransaction publishes a revision. A record documents what happened; neither its existence nor its integrity certifies the scientific validity of the result.

A terminal RunRecord is immutable. Queued/running state belongs to the existing WorkItem lifecycle; this slice records completed, failed, cancelled and superseded outcomes. A rerun gets a new ID and an optional rerunOf link. Previous records are never rewritten to describe a new producer or outcome.

The record pins one immutable world revision and retains producer identity/version, exact input references, assumptions, parameters, execution environment/times, evidence, logs, artifact references and exact proposed operations. See [candidate types](run-records.ts). The reference host stores complete gateway proposal payloads to bind later submission to the original run, instead of retaining only unauthenticated transform IDs.

## Ownership and storage

The trusted job runner captures inputs and persists the terminal record. Capabilities receive a pinned input view and a principal-bound gateway client; they receive no database, world factory, run writer or authority client. The gateway retains its five methods. Run and artifact ingestion are trusted host seams in this slice, not new public world-write methods.

Artifact bodies live in a separate content-addressed execution_artifacts table, outside semantic state. The bounded adapter retains UTF-8 text and JSON with media type; its identifier hashes media type, a NUL separator and exact UTF-8 bytes. A production binary/object-store backend must preserve immutable identity, retention and read verification. No arbitrary filesystem paths or executable/container downloads are accepted here.

Runs, artifacts and immutable proposals reside in the same SQLite database as existing revisions so explicit recovery copies retain them together. There is no new authoritative world history. Accepted revision events carry proposalId, transformId, runRef and evidenceRefs atomically with the revision, branch head and idempotency receipt. Later publication is a history projection; it never mutates the completed RunRecord.

## Gateway mapping

- World identities are R0, R1, etc.; the bounded SQLite host maps these strictly to safe nonnegative integers on main. Other branches/identity formats are unsupported.
- world.read accepts selector `{kind: "snapshot"}` and an exact revision or head. Unsupported selectors fail closed.
- proposal.submit stores one typed transform and a durable actor/key receipt without publication. A referenced run must be completed, pin the same base and contain the exact submitted proposal and evidence references.
- proposal.publish resolves an existing stored proposal, rechecks gateway policy and host commit authorization, then re-evaluates the typed operation with exact-head comparison inside the existing transaction. No caller candidate or validation result is installed.
- history.get resolves runId, revision, proposalId, transformId or eventId. A run view includes original inputs, retained artifacts and accepted publication links.
- Supported fixture transforms are terrain.controls and panel.set-thickness, schemaVersion "1". Domain semantic validation remains in the host. Unknown transforms and multi-transform submissions fail closed in this adapter.

Submission idempotency and publication idempotency are distinct ledgers. Reusing a key with different content fails. Publication receipts bind the stored provenance as well as the world request. Authority is checked again before receipt replay. An old run can be inspected or rerun even when a new proposal against its old base can no longer publish.

## Currentness and replay

Currentness is a derived view evaluated against a named revision, never a permanent flag in the immutable record. This first implementation is deliberately conservative: equal revision identity yields current; any later/different revision yields stale. The returned scope is revision_identity_only. Producer revocation, evaluator-specific influence closure and partial currentness require further contracts; current does not certify those properties or a safe physical design.

HistoricalRecordIntact means retained record/artifact bytes passed their integrity checks. It does not mean the old solver result is scientifically correct. A stale result remains historical evidence of what was computed.

Inspection is required: reconstruct the original snapshot, exact captured inputs, producer, assumptions, outputs and publication links after process exit. Rerun creates a new RunRecord against the original revision with a named producer version. Reproducibility is a stronger declaration requiring preserved executables, environment and numerical settings; this mock advertises rerunnable only and does not promise bit-identical external/GPU/SaaS results.

## CON-031 acceptance evidence

The mock FEA fixture starts panel P27 at 10 mm/R0, retains its run, proposes 12 mm, obtains governor publication/R1, changes geometry/R2, exits the process, then reopens in another process. Property explanation walks value-changing revision events to R1 and the original run/R0 inputs. A version-2 rerun is separately retained without changing either old run or head. A verified recovery copy restores both historical revisions, both runs, their artifacts and publication lineage into a new database.

Tests also exercise raw capability publication denial, missing proposals/artifacts, altered run-linked proposals, stale-base rejection, revoked authority, immutable IDs, retry conflicts, corruption detection and process interruption at four publication stages. The existing terrain bridge uses the same gateway publication path and retains its regression suite. The saved demo's existing HTTP endpoint remains a trusted direct host adapter; migrating that UI transport is not claimed.

Run `node --test packages/kernel-gateway/test/*.test.mjs packages/world-runtime/test/*.test.mjs`. This qualifies the synthetic local slice only. Production authentication, hostile-code isolation, lifecycle scheduling, storage quotas/retention migration, binary artifact services and general property lineage remain open.
