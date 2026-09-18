# Terrain lifecycle and OpenCascade integration audit

Reviewed 18 September 2026. This is a source-and-test audit, not a completion percentage.

Checkpoint: this document and the lifecycle tests/evidence are now packaged together
on `codex/gateway-provenance`, based on `a54e5f5`. The containing commit pins the
checkpoint. [Checkpoint verification](../../packages/world-runtime/evidence/terrain-checkpoint.json)
confirms every tested source matches this checkout after line-ending normalization.
Original evidence retains the byte hashes and workspace metadata from its execution;
the checkpoint manifest supplies portable hashes. Historical workspace descriptions
below refer to the test run, not a remaining packaging requirement.

## Where the project stands

The reviewed gateway worktree is at `a54e5f5c123356441d73962d339cf534f9774725`.
Its [main CI](https://github.com/benresonance-star/PLASMA/actions/runs/35277518271),
[native geometry](https://github.com/benresonance-star/PLASMA/actions/runs/35277518252)
and [graph benchmark](https://github.com/benresonance-star/PLASMA/actions/runs/35277518202)
workflows succeeded. The native constructive/STEP/drift test step and health check
also succeeded; that workflow is optional, so checking its individual steps matters.
The previous task's CI wait is resolved.

The active workspace remains on `codex/interaction-reflex` at `ee5b895`, with substantial
existing uncommitted runtime, gateway, demo and documentation work. Tests below apply
to that workspace plus the new lifecycle test, not automatically to a committed PR.
See the source hashes in [lifecycle evidence](../../packages/world-runtime/evidence/terrain-lifecycle.json).

Implemented foundations include authority-gated proposals, atomic SQLite publication,
revision history and receipts, saved terrain editing, undo/restoration/reapplication,
and retained computation provenance. The saved-demo run-inspection UI is still pending.
The general CAD capability plan from the “Reuse OpenCascade Work” chat introduces a
separate terrain-first acceptance gate; this audit does not treat either plan as proof.

## Declared authority and reconstruction

For this bounded fixture, authority is `snapshot.state.terrain`: versioned integer-mm
controls, stable point/feature IDs, boundary/breakline definitions, frame, datum and
source evidence. The declared base is the fixture's R0 state. Recorded requests carry
the exact base revision and dependency guards; committed events record evaluator
version, actor and request. SQLite retains immutable full revisions and event history.

Triangulated surfaces and display/picking resources are derived. Persisted surfaces
are integrity-checked publication records, but are not required inputs for regeneration.
Do not delete representation bytes from SQLite: they participate in revision hashes.
The new test starts a separate Node process, reads only saved controls into the real
surface evaluator, and compares its output to the accepted result. It then submits
the recorded typed requests from R0 into a separate empty database through the terrain
bridge and gateway. This is replay verification, not a new production replay API.

Fixture: `test/fixture.mjs`, four-point boundary in mm, two elevation replacements.
Comparison policy: exact canonical semantic state and deep equality of deterministic
surface data, with zero numeric tolerance for this integer fixture. No rendered-image,
general meshing-tolerance or OpenCascade equivalence claim follows. This small fixture
does not replace a browser demonstration with a boundary and breakline.

## Gate A audit

“Partial” means a component proof exists but the full application criterion remains open.
Paths below are relative to the repository root.

| Gate | Status | Concrete evidence and remaining work |
| --- | --- | --- |
| A1: stable identity, preview isolation | Proven for desktop fixture | Runtime test and `packages/world-runtime/test/browser-lifecycle.mjs` compare the complete durable snapshot before and during a real worker preview. |
| A2: cancel | Proven for desktop fixture | Browser Reset preview leaves authority unchanged; runtime cancellation rejects commit. Browser pagehide cleanup removes visuals and revokes retained click/keyboard handlers. |
| A3: valid commit | Proven for desktop fixture | Two UI commits create exactly R1/R2, preserve point IDs and evaluate real surfaces. `runtime.test.mjs` also covers idempotent receipts. |
| A4: invalid edit | Proven for desktop fixture | Browser duplicate-XY edit reports a validation reason and keeps acceptance disabled; the same typed edit receives HTTP 422 `SOURCE_CONFLICT` and agent `SOURCE_CONFLICT`. Complete saved snapshot, history, receipt absence, geometry and usable picking are checked. |
| A5: obsolete completion | Proven for explicit reload workflow | Test-only init script holds one actual ready worker response. A competing HTTP edit commits, Reload saved closes the obsolete gesture, and the held response is released. DOM observation detects any candidate publication; authority, reconstructed geometry and picking remain correct. Runtime tests independently reject stale commit with `STALE_READ`. |
| A6: destroy and rebuild representation | Proven for desktop fixture | Browser lifecycle test explicitly dispatches pagehide, observes zero terrain visual groups, exercises retained revoked handlers, closes the browser, and then verifies identical rebuilt geometry and working point selection. |
| A7: cold reopen | Proven for desktop fixture | Browser AND HTTP server restart against the same SQLite file with empty session storage; new worker and presentation resources regenerate the same geometry and 25 anchor labels. |
| A8: replay | Proven for desktop fixture | The browser's two recorded requests replay from declared R0 into a fresh database through the terrain bridge/gateway. State, surfaces, SVG geometry, boundary/breakline lines and anchor labels match exactly. |
| A9: human/agent equivalence | Proven for desktop fixture | Browser commands replay through an authorized agent with equal state and representations and usable rebuilt picking; duplicate-XY edits reject on both paths. Browser uses its existing trusted HTTP host submission path; agent uses bridge/gateway, both reaching the shared domain evaluator and SQLite transaction. |

All A1–A9 behavioral criteria now have passing evidence for this bounded desktop fixture.
Seven browser workflows cover the application path, alongside the runtime proofs.
The obsolete-result scenario includes explicit Reload saved after a competing commit;
it does not claim automatic multi-client synchronization. Worker output is real;
only message delivery timing is controlled by the test.

The containing checkpoint commit now pins these sources and evidence for review.
The earlier remote gateway commit alone does not contain these new tests. The next implementation
slice is the native OpenCascade wall/through-opening fixture below; no wider terrain or
production qualification is implied by these bounded results.

## Gate B audit and reuse candidates

The existing provider is substantial reusable code, but it is not yet the new shared
runtime wall/opening domain. `services/geometry-occt/src/kernel-factory.ts` defaults to
`exact-adapter`. Select `occt-native` explicitly for constructive OpenCascade proofs;
`occt-wasm` is the STEP import path with constructive operations delegated.
The native binding pins `opencascade.js` to `2.0.0-beta.b5ff984` in its package manifest.
The native CI lane uses Ubuntu and Node 22. This audit's runtime tests use Windows
and Node 25.2.1, and do not rerun native geometry locally.

| Gate | Status | Evidence or gap |
| --- | --- | --- |
| B1: wall and through-opening | Missing integrated fixture | Native `boolean` and tests for union/cut/intersection exist in `occt-native-kernel.ts` and `occt-native.test.ts`; no 4 × 0.2 × 3 m shared-runtime wall/opening proof was established. |
| B2: move/resize opening | Missing | No registered wall/opening parameter evaluator in `world-runtime/src/reference-domains.mjs`; its wall evaluator is the earlier semantic fixture. |
| B3: tool/gizmo/agent equivalence | Missing | Requires a common registered wall-opening operation connected to each input path. |
| B4: cancel/invalid dimensions | Partial foundation | Generic preview/atomic rejection exists; wall-opening dimensional and boundary policies still need implementation. |
| B5: kernel failure atomicity | Partial foundation | Runtime rollback tests exist, but no real failed wall boolean through that publication path. |
| B6: face correspondence | Unknown for this fixture | Existing topology/naming work must be verified on affected/unaffected faces through opening edits. Raw face indices are insufficient. |
| B7: obsolete kernel output | Partial foundation | Stale-head and terrain worker rejection exist; OCCT request-to-presentation integration still needs proof. |
| B8: remove opening | Missing | Must restore the valid 2.4 m³ wall and explicitly resolve/invalidate dependent references. |
| B9: replay/rebuild | Missing | No shared-runtime wall/opening authority model and pinned-provider reconstruction fixture yet. |
| B10: undo/redo | Missing | Terrain history is reusable infrastructure, not proof of wall/opening geometry and reference restoration. |

After Gate A, adapt the native subtraction operation, not the whole ancestor application.
Use X for wall length, Y for thickness, Z for height; explicitly convert the planned
metre fixture to the service's millimetres. Expected cut volume is 2,000,000,000 mm³.
Declare cutter extension and validity/comparison tolerances before running it. Require
validity, one solid, placement, bounds and reference outcomes as well as volume.

## Verification performed

On 18 September 2026, all 151 checks passed with zero skips:

```text
node --test packages/world-runtime/test/*.test.mjs packages/kernel-gateway/test/*.test.mjs
# 74 passed, including four new lifecycle cases
node packages/terrain-core/test/run.mjs
# 70 passed
node --test packages/terrain-core/test/interaction.test.mjs packages/terrain-core/test/navigation.test.mjs
# 7 passed
```

Seven browser workflows passed in Chrome on Windows using:

```text
node packages/world-runtime/test/browser-lifecycle.mjs <agent-browser executable>
```

Set `AGENT_BROWSER_EXECUTABLE_PATH` if Chrome is not discovered automatically.
Browser startup required execution outside this session's sandbox; sandboxed attempts
closed the CDP connection before loading the page. The successful run used disposable
databases and closed its browser/server afterwards. Source identities and scope are in
[browser lifecycle evidence](../../packages/world-runtime/evidence/browser-lifecycle.json).
The rebuilt screenshot is `tmp/plasma-lifecycle-rebuilt.png` (local verification artifact).

This browser fixture contains 25 controls, a boundary and the three-control ridge
breakline. Pagehide is explicitly dispatched so cleanup can be observed before closing
the browser; subsequent recovery uses an actual browser/server restart. Comparison is
exact semantic/surface data and deterministic SVG geometry/anchor labels, not pixel
identity or qualified geometric error bounds. All seven workflows pass their browser
error checks. The invalid HTTP test expects a structured 422 response. The delayed-worker
check uses `test/browser-worker-gate.js` as a browser init script; this is not imported
by or exposed through the demo application. Native geometry was not newly run for this change.

These changes add verification and an audit, with no runtime behavior or authority-policy changes.
