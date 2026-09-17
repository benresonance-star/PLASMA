# Shared world runtime — bounded reference implementation

## Durable computation provenance — CON-031

The [RunRecord contract](../../docs/plasma/v0.5/run-records.md) now retains immutable terminal runs, content-addressed text/JSON artifacts and proposals beside the existing revision store. The terrain bridge and mock FEA publish through the same kernel gateway. Publication links are part of the atomic revision event; completing a run or submitting a proposal never changes the world. Currentness is derived against a named revision, conservatively by exact revision identity.

Run `node --test packages/world-runtime/test/*.test.mjs packages/kernel-gateway/test/*.test.mjs` for runtime, gateway and provenance tests. The new test exits and reopens separate processes, traces 12 mm back to its R0 FEA input, reruns that old state with another mock version, restores a recovery copy and checks four publication-interruption stages.

To inspect a persistent example, run these commands from the repository root (create refuses an existing file):

```text
node packages/world-runtime/demo/provenance.mjs create
node packages/world-runtime/demo/provenance.mjs inspect
node packages/world-runtime/demo/provenance.mjs rerun
```

The default database is `.data/provenance-demo.sqlite`; supply another filename as the second argument. Each command is a separate process. Output explains the thickness, original snapshot, retained artifacts, publication links and currentness; rerun adds a new record while the head stays R2. It is a synthetic CLI fixture, not real FEA or a new browser panel. The saved terrain HTTP adapter retains its existing trusted-host path.

`world.execution` is a trusted job-runner interface and must never be exposed to capabilities. Only give them a principal-bound gateway transport. Binary artifact services, general lifecycle scheduling, producer revocation, physical validity and hostile-code isolation remain unqualified. Earlier evidence files below describe earlier source snapshots; see `evidence/provenance-tests.json` for this slice.

Node >=22.13, using the built-in experimental `node:sqlite` API. This is a local host implementation for the synthetic wall and terrain fixtures. The optional saved browser demo uses this host; the legacy application is not migrated. This is not a qualified six-contract implementation.

## Ownership and publication

The trusted host opens a database, registers synchronous domain evaluators and supplies an authorization policy. It creates a session from an authenticated principal. Give clients only that session; never give them the factory, database, evaluator registry or policy. JavaScript same-realm encapsulation is not a hostile-code sandbox.

Sessions accept typed requests, not approved candidates. Preview returns detached data. Submit independently resolves and validates the proposal under SQLite `BEGIN IMMEDIATE`, then publishes one immutable revision containing state, event, evidence and representation data, alongside the branch head and idempotency receipt. SQLite uses rollback journaling and `synchronous=FULL`. Commit returns only after SQLite COMMIT; an interrupted response is reconciled by retrying the same actor/branch/request ID and payload. Authorization is checked again on retries. Stored revision digests detect accidental semantic corruption; they are not authenticated proof against a database editor.

The terrain host connects the existing `createTerrainBridge` to this same submission path. Its callback performs preparatory checks; only `commitTerrain` publishes, once per callback. The actual database transaction re-evaluates the original request and checks the head. It never installs the bridge's caller-supplied candidate or validation result.

## Mapping and deliberate limits

| Candidate contract | Reference mapping | Remaining gap |
|---|---|---|
| WorldTransaction | Session principal, request ID, baseRevision, domain/payload; receipt identity and fresh evaluation | Knowledge baseline, general invariant coverage, schema-compatible encoding and migration remain open. |
| WorldSnapshot | Immutable revision row, parent, state, event/evidence and representation data | Main branch only; no merge/rebase or generalized branch API. |
| RepresentationRequest/Response | Terrain topology output stored atomically; toleranceStatus remains unknown | Not canonical response envelopes or measured tolerance qualification; no wall OCCT representation. |
| CausalImpactSet | Named fixture evaluators and terrain's conservative preparation | No general closure certificate or cross-domain physical influence proof. |
| RefinementPlan | Synchronous evaluation while holding the local write transaction | No asynchronous scheduler, budgets or scale qualification. |

The wall adapter reuses the hardened historical fixture kernel. The terrain adapter independently validates the constrained surface. Neither certifies general housing, drainage or regulatory validity. Evidence states the evaluator's bounded scope. Existing representation data is retained only for untouched fixture domains; broader propagation requires the causal contracts before adoption.

All history is retained as complete snapshots in this slice; compaction, retention and automatic backup recovery are deferred; explicit verified recovery copies are available. Corruption fails closed rather than silently replacing the world. Process-interruption tests are not power-loss, filesystem-failure or multi-user qualification. Two database connections exercise stale-head rejection, not a production concurrency workload.

## Verification

Run `node --test packages/world-runtime/test/runtime.test.mjs` from the repository root. Tests cover candidate tampering, detached ownership, forged transactions, shared wall/terrain publication, the real terrain bridge, authorization revocation, stale proposals, duplicate payload conflicts, undo/history, missing evidence, two connections, corruption and child-process exits at four publication stages.

The separate original wall test remains runnable with `node docs/plasma/v0.5/reference-runtime/plasma-kernel-wall.test.mjs`.

## Saved browser demo — CON-024

Run `node packages/world-runtime/demo/server.mjs` and open `http://127.0.0.1:8081/packages/terrain-core/demo/?durable=1`. Data is stored in `.data/terrain-demo.sqlite` under the repository. `PLASMA_DEMO_DB` and `PLASMA_DEMO_PORT` override the file and port. The original port-8080 static preview remains temporary.

Preview by dragging or changing a level, then choose **Accept changes**. The server validates the original typed request and returns only after the shared runtime commits. **Reset preview** discards unsaved changes and pending retries; **Reload saved** reconciles a lost response and loads the latest saved terrain. Pending requests are retained in this tab's session storage across page reload, with the same request ID; closing the tab may discard an unacknowledged pending request. Accepted state remains in SQLite regardless of browser storage.

The server is restricted to IPv4 loopback and checks Host, Origin and a per-process save token. This is one local demo principal, not multi-user authentication. Only the synthetic terrain capability is exposed. It serves an explicit source-directory allowlist and never serves the database. Remote hosting requires a real authentication/deployment design.

The HTTP suite covers save/restart, lost responses, stale proposals and authority boundaries. `node packages/world-runtime/test/browser-saved.mjs <agent-browser-path>` runs a disposable database on port 8082 and verifies ten Chrome workflows, including browser/server restart and failed-save controls. Evidence is in `evidence/browser-saved.json`; no real project data is used.

## Current verification status
CON-025 completes the previously blocked browser rerun: ten Chrome cases now pass, including navigation, colour distinction, save/restart, failed responses and recovery copies. The native runtime/HTTP/camera suite passes 29 cases, and the existing terrain suite passes 70.

## Recovery copies
Use **Create recovery copy** in saved mode. Each verified standalone SQLite copy is stored next to the database in `<database>.backups/`. It includes accepted snapshots, history, evidence and retry receipts; unsaved previews are excluded.

Restore into a new path with `node packages/world-runtime/demo/restore.mjs <backup.sqlite> <new-database.sqlite>`, then launch the saved-demo server with `PLASMA_DEMO_DB` pointing to that restored file. Stop the server before switching files. Existing destinations are refused, and corrupt copies fail validation. This is explicit local recovery, not automatic failover, off-device backup or power-loss qualification.

Save-token renewal: an open page refreshes its local token after a server restart and retries the identical pending request once. Real permission denial or stale revision still fails with the pending proposal retained. Verified by eight HTTP/client cases and the browser restart-with-open-preview case.

## Preview undo — CON-027
With no pending preview or save, choose **Preview undo** to see the inverse of the last saved terrain point edit. **Accept changes** publishes a new revision; **Reset preview** cancels it. The previous revision and its event remain intact. Another save makes an old undo request stale. This slice inverts only the last terrain transaction; it is not a multi-level history stack. Inverting a saved undo reverses that undo. Structural changes and missing history are rejected. Verified by eleven HTTP/client cases and eleven browser cases.

## Saved history — CON-028
Choose **Saved history**, select an earlier revision, then **Preview revision**. The old terrain appears as an amber proposal against the current blue-grey saved base. **Accept changes** appends a new revision and records the source revision in its intent; **Reset preview** cancels. **Load older** retrieves the next page of 20 revisions. Existing previews must be accepted or reset before starting another restoration. History remains intact after restoring.

Restoration is limited to compatible terrain point controls. Different sources/frames, structural differences and stale bases are rejected. The history read can be newer than the page’s loaded base; Reload saved refreshes that base before proposing again. Thirteen HTTP/client tests and twelve Chrome workflows pass.

History controls explain unavailable actions beside the buttons. Unsaved edits and pending saves show the required next action; selecting the current revision asks for an earlier one. When the complete list is loaded, the older-page button reads **All revisions loaded** with an entry count. **Refresh history** retries loading without accepting or discarding terrain edits. The browser history workflow verifies these states.

## Explicit stale-edit recovery — CON-029
After a stale save, choose **Reapply pending edits**. The host compares the original request against its retained base and the latest saved terrain. Only point replacements with unchanged source, structure and targeted point revisions can proceed. Changed points are named as conflicts; even a point changed and then restored requires manual resolution. The combined terrain is fully evaluated before a new preview is returned.

Review the amber proposal, then **Accept changes** to append a revision or **Reset preview** to cancel. Reapplication itself never saves. It uses a new request ID and records the original request/base in the intent. The original pending request remains intact on failure. A later competing save still causes stale acceptance to fail; an already accepted request requires **Reload saved**, preventing duplicate replay after a lost response. This is bounded local point reconciliation, not branch merge or multi-user qualification.

CON-029 verification: 41 runtime/HTTP/reconciliation tests, four camera tests, 70 terrain cases and 14 Chrome workflows pass. See `evidence/stale-edit-recovery.json`.

## Pending preview recovery — CON-030
A retained pending point edit now reconstructs its amber preview after page reload or Reload saved when the saved base still matches. If the base advanced, the page shows saved terrain and lists requested versus loaded coordinates, with explicit reapplication required. Recovery does not publish or change the pending request identity. Already committed requests are reconciled through receipts before preview recovery. Reset removes both the pending request and its review display. Storage remains tab-scoped; closing the tab can lose an unacknowledged request.

Verification: 41 runtime/HTTP/reconciliation tests and 16 Chrome workflows pass, including offline reload, stale pending coordinates, cancellation and lost-response reconciliation. See packages/world-runtime/evidence/browser-saved.json from the repository root.

## Ordinary amber drafts — refresh recovery correction
Previously only attempted saves were retained. Saved-mode numeric and completed drag previews now retain their typed request in tab session storage immediately, before Accept changes. Refresh and Reload saved reconstruct the amber draft when its saved base still matches, and further edits remain available. A stale draft enters the existing explicit pending/reapplication flow. Reset and successful save clear the draft; receipt reconciliation clears a draft whose interrupted save already succeeded. Nothing is committed by draft recovery. Closing the tab may discard the draft.

Verification: 41 runtime/HTTP tests and 17 Chrome workflows pass, including numeric editing after refresh, drag draft refresh and reset cleanup. This corrects the earlier ordinary-preview refresh behaviour; preview changes are no longer intentionally discarded by refresh in saved mode.
