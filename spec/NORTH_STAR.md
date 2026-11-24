# Plasma North Star — proposed engineering policy v1.0.0

This policy supplements the existing canonical graph; it does not replace or amend the frozen constitution or existing typed contracts. On conflict the constitution and accepted contracts govern until an approved amendment. No implementation or verification status is advanced by this document.

## Mission
Make good buildings radically easier, faster and less costly to design, verify, document and deliver. Achieve CAD-quality geometric precision with game-engine-quality interaction responsiveness, without compromising the single source of truth.

## Normative proposed requirements
| ID | Requirement | Existing authority | Required proof |
|---|---|---|---|
| NS-01 | One authoritative world per project; studios are contextual lenses, never independent model authorities. Human and agent writes use the same governed transaction path. | CONST-001, CONST-002, PLS-WORLD-01, PLS-TX-01, PLS-AGENT-01 | Edit a shared entity in each studio; verify identical revision and identity, reject stale writes. |
| NS-02 | Shared compute feeds all studios. Foundation depends on neutral interfaces, not studio implementations; registered evaluators may provide domain algorithms. | CONST-008, PLS-GR-01 | Import boundary checks and actual Site, Architecture and Loft integrations. |
| NS-03 | Derived artifacts carry source revision, dependency digest, evaluator version and precision policy. Renderers never independently author production geometry. | CONST-003, CONST-006, PLS-REP-01 | Cross-renderer geometry, identity and coordinate tests. |
| NS-04 | Interaction is independent of expensive exact computation; candidate previews are explicitly non-authoritative; failed or stale results cannot publish. | CONST-002, CONST-004, CONST-005, PLS-INT-01, PLS-TX-01 | Drag while worker is blocked; cancel, conflict and failure tests. |
| NS-05 | Property/region dependency invalidation and immutable reusable geometry definitions; occurrence transforms independent of geometry. | PLS-GR-01, PLS-REF-01 | Compare incremental against full evaluation; unchanged dependencies not recomputed; actual hotel instance test. |
| NS-06 | Explicit units, coordinate frames, tolerances and stable semantic/topology references; exact measurements use appropriate precision geometry. | PLS-GR-01, PLS-REP-01 | Large survey coordinate, topology ambiguity and precision tests. |
| NS-07 | Retained scene, revision-guarded deltas, instancing, culling and LOD; no separate world authority in any renderer. | CONST-003, CONST-004, PLS-REP-01 | Scene replay, corrupted delta rejection, renderer parity and hardware tests. |
| NS-08 | Analysis and documentation derive from compatible world and intent revisions with freshness evidence. | CONST-006, PLS-DOC-01, PLS-EVIDENCE-01 | Cross-domain causal change and stale evidence tests. |
| NS-09 | Preserve accepted state and history, including worker failure and recovery. | CONST-005, CONST-007 | Crash recovery and save/reopen tests. |

## Proposed performance qualification
On documented hardware, dataset, resolution and rendering quality: target 60 FPS navigation (16.7 ms frame budget), p95 input-to-visible-preview <=33 ms, p95 hover/selection <=50 ms, zero geometry requests during rigid-transform drag, zero stale commits. Report CPU/GPU frame timing, transport and evaluation separately; targets are not measured results. Test terrain, townhouse, actual 168-suite hotel, Loft freeform and fabrication details. Precision tolerances must be operation-specific, not display tolerances. OCCT for exact solid/surface evaluation, constrained TIN for terrain where appropriate; renderer choice is replaceable and must be evidence-driven.

## Amendment governance
Clarifications preserve meaning; engineering amendments require rationale, impacted IDs/contracts, alternatives, migration and verification plan, reviewable diff and recorded decision. Constitutional amendments require explicit owner approval. Never silently change a requirement to make a failing test pass. Keep accepted and proposed status distinct. Use git history and PRs as decision provenance. Generated artifacts remain derived.

## Reporting
Record spec commit and version, implementation baseline, requirements, actual changed paths, test commands/results, outstanding gates and amendments. Distinguish reference, integrated, verified and production-qualified. If source/spec unavailable, explicitly say so.
