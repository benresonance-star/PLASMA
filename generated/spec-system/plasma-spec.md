# Plasma Spec System v1

Canonical source: `/spec` · Spec System 1.0.0-draft · Atlas 0.10.0

## Constitution

- **CONST-001** — Canonical world state has one governed authority path.
- **CONST-002** — A proposal is never authoritative state.
- **CONST-003** — Derived representations cannot become a second source of truth.
- **CONST-004** — Stale computation cannot overwrite a newer authoritative revision.
- **CONST-005** — Failure of a candidate operation cannot corrupt accepted state.
- **CONST-006** — Evidence retains provenance, applicability and freshness.
- **CONST-007** — History is preserved through revision-producing events.
- **CONST-008** — Non-authoritative computation may guide authority but cannot silently become authority.

## Core contracts

| Contract | Specification | Implementation | Verification |
| --- | --- | --- | --- |
| PLS-AGENT-01 · proposeTransaction() | complete | partial | none |
| PLS-CLAIM-01 · ClaimContract | partial | partial | none |
| PLS-DECISION-01 · DecisionContract | partial | partial | none |
| PLS-DIFF-01 · PLS-DIFF-01 · DifferentialContract v0.1 | complete | not_started | none |
| PLS-EVIDENCE-01 · EvidenceContract | partial | partial | none |
| PLS-EXT-01 · importExternalResult() | complete | partial | none |
| PLS-GR-01 · resolveGeometry() | complete | partial | none |
| PLS-INT-01 · submitSemanticOperation() | complete | partial | none |
| PLS-REF-01 · resolveReference() | complete | partial | none |
| PLS-REP-01 · deriveRepresentation() | complete | partial | none |
| PLS-SOLVER-01 · SolverContract | partial | partial | none |
| PLS-TX-01 · submitTransaction() | complete | partial | none |
| PLS-VALIDATE-01 · validateCandidate() | complete | partial | none |
| PLS-WALL-01 · PLS-WALL-01 · Parametric Architectural Walls | complete | not_started | unlinked |
| PLS-WORLD-01 · readWorldSlice() | complete | partial | none |

## Capabilities

| Capability | Architecture | Spec | Implementation | Readiness |
| --- | --- | --- | --- | --- |
| FND-01 · Spec → Reality Ledger | accepted | complete | partial | IMPLEMENTATION_INCOMPLETE |
| FND-02 · Build Note → Development Knowledge | accepted | complete | partial | IMPLEMENTATION_INCOMPLETE |
| FND-03 · Capability Frontier | accepted | complete | partial | IMPLEMENTATION_INCOMPLETE |
| FND-04 · Reflexive Plasma Environment | accepted | complete | not_started | READY_FOR_EXPERIMENT |
| FND-05 · Version → Release → Recovery Contract | accepted | complete | partial | IMPLEMENTATION_INCOMPLETE |
| ADK-01 · Agentic RAD Core Loop | accepted | partial | not_started | BLOCKED |
| ADK-02 · Sandboxed Worker Run | accepted | partial | not_started | BLOCKED |
| ADK-03 · Critic → Governor Gate | accepted | partial | not_started | BLOCKED |
| PLS-01 · Minimal Plasma Kernel + World State | accepted | complete | partial | IMPLEMENTATION_INCOMPLETE |
| PLS-02 · Exact Geometry Refinement | accepted | partial | not_started | BLOCKED |
| PLS-03 · Field Refinement | accepted | draft | not_started | BLOCKED |
| PLS-04 · IFC Round-trip | accepted | partial | not_started | BLOCKED |
| PLS-05 · Compliant Design RAD | accepted | draft | not_started | BLOCKED |
| PLS-06 · Observation / Real-to-Sim | accepted | partial | not_started | BLOCKED |
| PLS-07 · Reality → Evidence → Accepted Context | accepted | draft | not_started | BLOCKED |
| PLS-08 · Contextual Evidence + Practice Learning | accepted | draft | not_started | BLOCKED |
| PLS-09 · Contextual Representation Resolver | accepted | partial | not_started | BLOCKED |
| PLS-10 · Bounded Reactive Runtime + Parallel Compute | accepted | partial | partial | IMPLEMENTATION_INCOMPLETE |
| PLS-11 · Semantic Morphogenesis + Sculptural Realization | accepted | draft | not_started | BLOCKED |
| PLS-12 · Epistemic World + Value of Information | accepted | draft | not_started | BLOCKED |
| PLS-13 · Typed Reasoning Operators + Contextual Lenses | accepted | partial | partial | IMPLEMENTATION_INCOMPLETE |
| PLS-14 · Adaptive Interaction Lens Runtime | accepted | partial | not_started | BLOCKED |
| PLS-15 · Work Orchestration + Execution Graph Runtime | accepted | partial | not_started | BLOCKED |
| PLS-16 · Pathology Guard + Anti-Pattern Intelligence | accepted | partial | not_started | BLOCKED |
| PLS-17 · Spatial Operation + Kernel-Neutral Geometry Runtime | accepted | partial | not_started | BLOCKED |
| PLS-18 · Knowledge Ledger + Project Baseline Governance | accepted | partial | not_started | BLOCKED |
| PLS-19 · Parametric Architectural Wall System | accepted | partial | not_started | BLOCKED |
| PLS-20 · Differential Rendering Research Architecture | accepted | partial | not_started | BLOCKED |
| PLS-21 · DifferentialContract v0.1 | accepted | partial | not_started | BLOCKED |

## Research quarantine

- **RND-01** — Existing Formalism Stress Test; createsBuildObligation=false
- **RSCH-DIFFERENTIAL-RENDERING** — Sensitivity-Guided Differential Rendering; createsBuildObligation=false
- **RSCH-DIFFERENTIAL-COMPUTE** — Differential Compute Across Plasma; createsBuildObligation=false

## Migration state

Atlas data is generated from /spec. The existing rich plasma-spec.html remains a checked legacy projection during v1 migration; the compiler verifies its loop manifest against canonical capability records.

