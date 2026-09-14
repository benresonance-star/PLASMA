# Contract semantics — v0.1.0 candidate
These six JSON schemas are newly authored consolidation proposals. They are not asserted to match unseen chat contracts or legacy TypeScript DTOs.
Structural validation is necessary but insufficient. Runtime validators must enforce the cross-record rules below; no JSON Schema validator was available or run in this session.
All references resolve against the pinned baseline/revision. SHA-256 fields identify canonical byte encodings whose canonicalisation contract must be fixed before implementation qualification. Time stamps are diagnostic ordering aids; revision/event lineage defines causality.

## WorldTransaction
The base revision, actor authority, transforms, knowledge baseline and idempotency key are explicit.
Idempotent retry of the same key and payload returns the same outcome; a reused key with different payload is rejected.
State machine: proposed → evaluating → conflicted/ready/rejected/cancelled; conflicted may return to evaluating after an explicit revised proposal; ready → committed only after all gates and atomic expected-head comparison.
Committed/rejected/cancelled are terminal for that transaction ID. New attempts get explicit lineage.
Before commit: resolve references and authority; require complete impact coverage for the relevant hard evaluators; require fresh passing evidence for every applicable hard invariant; require current contract-satisfying commit-critical representations; check exact base head inside the storage transaction.
Publish accepted semantic revision, representation bindings, Event and Evidence references atomically. A failure leaves the prior accepted world and published head intact.
Unknown, stale or absent hard-check results block commit. The schema alone cannot check that the list includes every applicable invariant.
The documented 1000 mm corridor is a fixture target, not a statutory assertion.

## WorldSnapshot
Immutable revision with entity-state map, relation/invariant sets, parent revisions, evidence lineage and baseline pins.
Entity IDs are unique and every state/reference resolves within a compatible revision. Parent history is acyclic.
An initial snapshot may have no parents/events; otherwise parent/event linkage must describe the committed transition.
Snapshot identity includes all authoritative data and pins. Do not hash a mutable renderer scene.
Accepted representation references bind to the accepted revision; individual noncritical claims may remain stale but their status set must make that visible.
A branch is a mutable pointer to an immutable snapshot; it is not embedded as the snapshot's unique owner.

## RepresentationRequest
Purpose, semantic/geometric detail, subject references, frame, tolerances, freshness, latency and fallback are independent dimensions.
LOD labels are interpreted by a versioned domain contract; a higher LOD label does not imply a particular tolerance.
Tolerance is a list of named metrics with units, measurement space and scoped subjects. Linear world-space, angular, screen-space and field error are never interchangeable.
A consumer may request exact_revision with current noncritical results; allowing stale previews does not authorize committed use.
required_for_commit forces exact revision and disallows approximate fallback. An equivalent provider must satisfy the same semantics, reference and error contract.
If a metric cannot be measured or converted by an explicit compatible mapping, return unavailable/unknown; do not invent zero error.

## RepresentationResponse
Every response binds request ID, request input digest, world revision, producer implementation/configuration, achieved tolerances and diagnostics.
A current result must match the requested revision/digest, satisfy every requested tolerance and carry required correspondence and fresh validation. Current is not just a recent timestamp.
A stale result may be displayed only under consumer policy; it is never used to satisfy a required current representation.
No achieved-error claim may substitute a configured tolerance for a measurement or justified conservative bound.
Geometry healing requires a new validated output digest and updated correspondence. Ambiguous hard references block publication.
Missing providers, unsupported operations and exhausted budgets are explicit failures/unavailability, not successful placeholder meshes.

Examples:
- Renderer: interactive mesh, screen-space tolerance, local view context, short latency, allow_stale_preview, approximate_preview permitted, required_for_commit=false.
- Solver: analysis mesh at exact revision, world-space and element-quality metrics, fallback limited to an equivalent qualified producer; no silent render-mesh substitution.
- AI: purpose-specific semantic/geometry context, pinned revision, explicit unknowns and evidence refs. The response is a derived context package and gives no mutation authority.

## CausalImpactSet
Caller-declared scope is an intent hint. The kernel/evaluators compute actual conservative scope.
Boundaries are evaluator-specific and require valid influence certificates before propagation stops. An unchanged tessellation boundary does not certify unchanged drainage.
complete_for_evaluators applies only to the declared evaluator set, producer and pinned inputs. Unknown scope cannot certify a commit-critical invariant.
Store dependency-projection identity, not a second independent world model. Rebuild from authoritative data when invalidated.

## RefinementPlan
A plan references a pinned world revision and impact set; work dependencies do not create accepted world truth.
Every work ID is unique, dependency IDs resolve, and ordinary dependency edges form a DAG. Cycles require an explicit bounded solve-group policy with convergence criteria, iteration/time budget and failure state.
Per-item budgets fit the total execution policy; resource exhaustion leaves required outputs pending/failed. Cancellation and supersession reject late results.
completed means required plan outputs were produced and assessed, not that a WorldTransaction committed.
External actions require separately scoped authorization and reconciliation of receipts; rollback of a world revision cannot undo an executed physical action.

## Adapter and schema-freeze gate
Map existing RC-02, kernel reference and SPDS contracts explicitly. Document renamed fields, enum mappings, units, revision identity, missing evidence and unsupported semantics.
Round-trip known inputs without losing requirements; reject unsupported inputs. Compare new and existing fixture outcomes.
Only after wall and terrain reuse evidence may these schemas become a frozen compatibility boundary. A correction to intended semantics requires a decision and migration note.

## PLS-INF-01 interpretation provenance
[Candidate inference types](inference-contracts.ts) and [semantic invariants](inference.md) specialise PLS-13 outputs without expanding the kernel. WorldTransaction adds optional interpretation_proposal_refs and interpretation_disposition_refs. Explicit-tool changes need not manufacture inference records. Any referenced selected interpretation must match the transaction's base revision, relevant interaction sequence and resolved material parameters; user/model selection does not waive the commit gate.
CausalImpactSet's declared scope may contain predictions; its computed scope and coverage certificates remain authoritative runtime results. No additional classifier score can certify closure.
These are additive draft fields in the unshipped 0.1.0 structural schema; no adapter or deployed compatibility is claimed.

## PLS-INT-01 interaction provenance
[Interaction types](interaction-contracts.ts) describe ephemeral overlays and request/response envelopes. [Semantic rules](interaction.md) govern lifecycle, fidelity, currentness and publication. WorldTransaction gains optional interaction_session_ref and interaction_input_sequence fields, present together, to trace material gesture input. They are provenance, not permission or proof. Transactions from agents/imports without gestures need not invent sessions. The authoritative payload and retained evidence must suffice to replay accepted changes after overlays expire.
No overlay is added to WorldSnapshot. Representation and transaction gates remain unchanged; commit-critical regional/global work may not be moved after acceptance to meet a latency target.

## Interactive presentation consumer — PLS-IPS-01
[PresentationFrame and adapter types](presentation-contracts.ts) compose references to existing RepresentationResponses and the existing InteractionOverlay; the six JSON schemas are unchanged. The [presentation protocol](presentation.md) governs context/generation/sequence, immutable ownership, semantic hit mapping, lifecycle and fallback. It does not introduce a second representation authority.
A reflex-purpose usage profile selects existing purpose/kind/tolerance/freshness/latency/fallback fields. Presentation demand hints are resolved by the host into normal RepresentationRequests. An overlay-only proxy cannot be labelled a validated RepresentationResponse. Accepted/candidate/stale roles and claim-level currentness survive composition. Adapter outputs remain transient handles and input observations; all mutations use the established runtime and WorldTransaction path.
