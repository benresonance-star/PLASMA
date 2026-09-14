# PLS-INT-01 — Interaction Session Runtime
Version 0.1.0 candidate. Product description: Interaction Reflex Runtime.
Status: specification addition; no new runtime implementation or performance qualification.
Owner: PLS-10 bounded reactive runtime, with PLS-14 workbench interaction and PLS-GR-01 domain resolution.

## Purpose and non-goals
Provide immediate local speculative feedback while exact geometry, dependent representations, simulation and reasoning run at their own rates.
Plasticity-like tactile fluidity is a design aspiration, not a measured product comparison or a guarantee on every device/model.
This is the explicit interaction mechanism within the existing stack, not another state owner or independently deployed service.
PLS-INF-01 describes optional interpretation and escalation. PLS-INT-01 must function without inference, agents, network access or a local language model.

## Core invariant
Interaction, geometry resolution, simulation, reasoning and commit have independently scheduled rates and causally consistent revision identities.
The input/render path must never synchronously wait for global propagation, expensive geometry generation, simulation or AI.
A validation backlog may delay authoritative acceptance; it must not freeze camera motion, cancellation, inspection or honest speculative feedback.
No asynchronous result becomes authoritative merely because it arrived after release.
Global conditions that are genuinely commit-critical must pass before commit, even if expensive; the proposal stays pending while those checks run. Only noncritical follow-on work can remain pending after acceptance.

## Supported interaction families
Move/rotate/scale; face/edge/vertex manipulation; trim/extend/split; Boolean previews; sketching; snapping; terrain edits; parameter dragging; local constraint interaction.
This list defines contract coverage to qualify progressively. It does not assert all commands exist.
A domain pack must define semantic meaning, preview capability and acceptance criteria for each verb. Exposing a mesh handle does not automatically make its deformation a valid parametric edit.

## Lifecycle and authority
1. beginSession pins base world revision, semantic targets/references, explicit verb, frame, modifier state and applicable policies.
2. updateSession coalesces ordered input into an overlay. The overlay renders deltas over the pinned accepted state; it owns no canonical entities, relations or rules.
3. Preview work may run locally or asynchronously. Each result binds session, base revision, monotonically increasing input sequence, operation digest and fidelity contract.
4. finishGesture freezes the intended delta into a proposal. Releasing a pointer is not acceptance and need not destroy the visible overlay.
5. Domain resolution builds an isolated candidate. For required exact B-rep operations use the qualified OCCT/equivalent adapter; terrain fields or other representations use their own declared domain contract rather than forced B-rep conversion.
6. Validate geometry, semantic postconditions, bindings, tolerances and applicable hard invariants. Bounded healing is followed by revalidation and updated topology correspondence.
7. Compare expected head and atomically commit the semantic revision, accepted representation bindings and Event/Evidence lineage.
8. Reconcile the visible overlay with the accepted representation. Remove it only when the renderer can display the accepted result coherently.
9. Schedule remaining noncritical representations, solvers and agents with explicit currentness and failure states.

Resolution/validation can start before pointer release, but only revision/sequence-matching outputs may be reused.
An external head change marks the proposal stale or triggers an explicit rebase/re-evaluation path. Never apply an old delta silently to a different semantic target.
A later session on the same entity must supersede or explicitly depend on pending work. Camera motion remains independent; serialising overlapping accepted edits is allowed.
The user may inspect a failed candidate, choose an alternative, return visually to accepted state or cancel. A failed operation cannot corrupt or silently rewrite the accepted world.

## Overlay contract
[interaction-contracts.ts](interaction-contracts.ts) defines the candidate types.
An overlay may target multiple entities: coupled wall/corridor movement, a junction, a selection transform or a terrain feature set. A single entityId is insufficient.
Fields include session/base revision/input sequence, typed deltas with units/frame, semantic reference intent, optional speculative artifact, local constraint assessment, fidelity, currentness, lifecycle and operation digest.
Lifecycle, assessment and fidelity are separate. A current preview can still be approximate, unknown or conflicted.
SpeculativeGeometry is an artifact reference or a transient render handle. It cannot be persisted as semantic identity or labelled exact/current accepted geometry without qualification.
Known allowable ranges and cached adjacency are revision-, rule-, evaluator- and input-bound. They expire when any applicability input changes. Snapping does not authorize silently clamping away a requested conflicting state.
Raw pointer samples may remain in bounded buffers; preserve final meaningful intent and decision evidence under PLS-INF-01/PLS-13 retention policy.

## Fast path
Permitted techniques: GPU transforms, cached geometry, proxy meshes, analytic primitives, local bounded constraints, cached adjacency/spatial indexes, cheap collision/snap checks, coarse fields, speculative tessellation and validated allowable ranges.
Run only bounded work on the input/UI thread. Expensive local constraints may return pending; “local” does not guarantee inexpensive.
Coalesce inputs without losing the final sample. Separate visual update frequency from exact request frequency. Only the latest relevant sequence may update the overlay.
Avoid rebuilding scene graphs, uploading full meshes, recomputing whole-project fingerprints or serialising large artifacts for each move.
Expose stable camera, precise numeric entry, snap source, requested delta and currentness near selection. Do not switch gesture semantics as predictions fluctuate.
A valid cheap feedback mode may be a ghost, transform gizmo, wireframe, footprint or parameter label. If a topology-changing preview is unavailable, show honest pending feedback rather than a fabricated successful Boolean.

## Work scheduling and overload
Reserve a measured budget for input/render and bounded snap/constraint work. Use separate worker/process execution for blocking geometry and solver tasks.
Worker isolation alone is insufficient: CPU saturation, memory copying, GPU queue monopolisation, VRAM pressure and main-thread application of results can still stall interaction.
Bound concurrent tasks, queue length, artifact memory and GPU submissions; prioritise visible work and apply backpressure before saturation. Use bounded job chunks where supported.
If a provider cannot cancel safely, discard its late result and cap additional in-flight work. Never assume all OCCT or GPU work is preemptible.
Reduce preview detail and suspend optional prefetch/inference/background refinement before degrading explicit interaction. Preserve hard-validation requirements when reducing preview fidelity.
Maintain explicit fairness for deferred work; “asynchronous” must not mean permanently starved.
Resource exhaustion yields pending/unavailable feedback and a useful cancellation path. No timeout becomes a validation pass.

## Failure, cancellation and undo
Cancellation discards the session/proposal's speculative artifacts and cancels or invalidates associated work; accepted state remains unchanged.
Cancellation before atomic publication prevents acceptance. Cancellation racing with an already completed commit must report that commit and offer a compensating undo; it cannot claim to erase a completed transition.
Undo of an accepted change remains a new Transform/revision. Cancelling a gesture is not an undo event over accepted world state.
Exact/proxy mismatch must be checked against the declared preview error/semantic policy. A materially different exact result requires a fresh visible preview and acceptance; it cannot be substituted unnoticed.
Ambiguous topology binding, tolerance overrun, unsupported geometry or stale hard evidence holds the proposal with diagnostics.
Presentation reconciliation must not double-apply a delta, flash back to old accepted geometry or reset the camera. If rendering the new accepted artifact fails, show honest fallback/currentness and retain the committed revision identity.

## Performance qualification
The following are requested product targets, scoped to a declared device, workload and interaction profile. They are not current measurements, universal guarantees or permission to relax validity.
| Metric | Target | Measurement and qualification |
|---|---|---|
| Camera and direct manipulation | 60 fps minimum goal on a supported 60 Hz-or-faster profile | Target steady-state p95 frame interval ≤16.67 ms; also record p99/max, missed presentation deadlines and dropped-frame ratio. Average fps alone cannot pass. Hardware below the declared profile has an explicit reduced target. |
| Pointer/hover/snap feedback | <16 ms target | Report event-to-visible-feedback latency where measurable; instrument dispatch-to-render submission separately. Submission timing is not physical input-to-photon proof. |
| Local preview | <50 ms desirable | Latest input sample to visibly updated local speculative representation; disclose proxy method and error limits. Immediate cursor/gizmo feedback continues during this interval. |
| Exact local resolution | <100 ms desirable | Run time for a named local fixture on a pinned provider; report queue time and end-to-end release latency separately. Unsupported or difficult cases may remain pending. |
| Ordinary authoritative commit | <250 ms typical target | Release/acceptance request to durable commit acknowledgement for a named ordinary workload; includes queue, required resolution, validation and persistence. Also measure acknowledgement-to-visible-reconciliation. Human think time is excluded and separately labelled. |
| Global noncritical propagation | Asynchronous, nonblocking | Measure convergence time, queue age and required/optional currentness. Commit-critical global conditions remain pre-commit gates. |
| AI | Never required for basic manipulation | Execute baseline fixtures with all inference/model providers disabled and network unavailable. |

Before performance runs, register fixture geometry/semantic size, active/dirty sets, operation distributions, display refresh/resolution, device/OS/browser, renderer/provider builds, warm/cold state, background loads and measurement method.
Use at least 100 completed gestures per ordinary operation/profile and a sustained 30-second camera/manipulation segment for each contention profile. Report sample counts and distributions; select fixtures before running.
Reference 60 Hz profile goal: fewer than 1% missed frame deadlines in the steady-state segment, alongside the frame-interval distribution. Cold startup and pathological operations are separately reported, not silently excluded.
Test desktop and physical iPhone. A synthetic mobile viewport is not device evidence. Set concrete hardware/scene profiles during M1; do not claim Plasticity parity without an actual comparable task measurement.
These numeric targets are performance requirements only. Unknown performance remains unknown.

## Acceptance corpus — M1/M2 extension
| ID | Scenario | Required outcome |
|---|---|---|
| INT-A01 | Wall drag and camera movement with slow exact resolver | Continuous honest local feedback, responsive camera/cancel; no waiting in input/render path |
| INT-A02 | Slow global hard check | Proposal remains pending; accepted head unchanged while camera/inspection remain responsive |
| INT-A03 | Slow noncritical analysis after acceptance | Accepted edit visible; analysis explicitly pending/stale until current |
| INT-A04 | Results complete out of order, including same-revision older gestures | Only matching session/sequence/digest result updates the overlay |
| INT-A05 | Concurrent accepted head change | Stale/rebase flow; no silent application to changed targets |
| INT-A06 | Exact failure, excessive healing or ambiguous binding | No accepted mutation; inspectable failure and alternatives/cancel |
| INT-A07 | GPU/CPU/memory contention and uncancellable work | Backpressure and fidelity policy operate within declared budgets; obsolete results discarded |
| INT-A08 | Snap/range cache invalidated by a rule or geometry change | Invalidate cached limits; preserve requested delta and report conflict/pending |
| INT-A09 | Gesture cancellation, publication race and subsequent undo | Correct lifecycle; cancellation does not erase a completed commit; undo appends a revision |
| INT-A10 | Exact result differs materially from proxy | Re-preview/reaccept; no unnoticed semantic change or double delta during reconciliation |
| INT-A11 | Multiple coupled targets with inference disabled | Same authoritative gates; explicit semantics and basic editing work offline without AI |
| INT-A12 | Terrain/breakline, parameter and topology-changing operations | Same overlay protocol, domain-specific fidelity and T1R influence checks; no fake B-rep or successful Boolean |
| INT-A13 | Named performance profiles and physical devices | Measured distributions and contention evidence; none inferred from a synthetic viewport |

No test in this corpus has been executed by this specification update.

## Integration and precedence
This contract makes PLS-10's existing interaction representation contract concrete and incorporates TerrainEditSession into one session/overlay lifecycle with domain-specific deltas.
For the consolidation candidate, it clarifies legacy phrases “restore local-hard invariants synchronously” and “preview/commit before global checks”: only cheap bounded checks belong in the synchronous visual path, and every applicable commit-critical check precedes acceptance.
PLS-GR-01 remains the exact B-rep resolver; PLS-09 remains representation authority; PLS-15 remains scheduler/work authority; PLS-INF-01 is optional interpretation. No parallel architecture is created.

## Sequence and deferrals
M1: explicit wall session, delta overlay, honest pending states, revision/sequence rejection, failure/cancel/undo and coherent durable reconciliation. Qualify the first OCCT operation and named device profiles before claiming targets.
M2: reuse for terrain T1/T1R and coupled edits; qualify evaluator-specific influence and domain preview fidelity.
Expand face/edge/vertex topology edits and Boolean preview families incrementally with operation-specific fixtures.
Defer universal GPU optimisation, a second scene-owned model, a mandatory inference layer and claims of blanket sub-100 ms exact geometry.

## Structural validation
Targets are nonempty and semantic references resolve against the base revision. Input sequences are monotonic nonnegative integers; numeric deltas and matrix entries are finite; transform matrices have exactly 16 elements and a declared frame/unit convention. Units and operation schemas must be registered. In-flight limits are positive integers; queue/memory limits are nonnegative. An exact_candidate is validated candidate geometry, not accepted world state. Every response must match request, session, revision, sequence, digest and producer contract before use. A committedRevision exists only after successful WorldTransaction publication and must match renderer reconciliation. Event history records consequential decisions without promoting overlay caches to canonical objects.

For qualification, use p95 for the pointer/hover/snap and local-preview targets; report median/p95/p99 for all timings. Treat the desirable exact-local and typical-commit figures as median goals on the named ordinary fixture, with tails and slow cases disclosed separately. No pass can be inferred by averaging unrelated devices or operation classes.

## Presentation consumer — PLS-IPS-01
The [Interactive Presentation Surface](presentation.md) renders this protocol's overlays and existing representations inside PLS-14. It does not own the session, source constraints, geometry or acceptance. Input observations return to the runtime; the presentation adapter has no commit capability. Frame/view generation augments existing session/base revision/input sequence checks for rendering and semantic hit maps. PLS-INT-01 performance, commit gating and reconciliation rules remain authoritative. The presentation types import InteractionOverlay unchanged.
