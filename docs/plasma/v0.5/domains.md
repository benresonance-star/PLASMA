# Domain requirements
The terrain requirements below are inherited from the reviewed companion. Additional domains marked reconstructed proposal capture available thread intent without claiming recovery of the original detailed wording.

## Terrain: centralised T1/T1R gate
Author source features with ownership: registered survey points, boundary, breaklines, pads, masks and declared overrides. Distinguish measured ground, designed formation, finished floor and threshold anchors.
Use TerrainEditSession for local preview and the common transaction boundary for accepted changes. Keep event history separate from compiled active terrain state so long histories do not require unbounded replay on every drag.
Persistent anchors identify semantic features and attachment intent, with explicit remapping outcomes: preserved, remapped, ambiguous, missing. Stable entity IDs alone do not resolve derived topology.
Coupled constraints use named solve groups; layer order is not a substitute for simultaneous constraints.
Currentness is tracked per claim/evaluator and affects rendering.
AI uses semantic queries and bounded intent/proposals, then the same commands and validators as human editing.

T1: registered points + boundary + one breakline, editable precisely in plan, 3D and section with reversible CRUD.
T1R: before expanding materially into additional pad/driveway tools, demonstrate incremental/full equivalence, crossing/near-coincident handling, long-history behaviour, source replacement, 100,000-control surrounding-context stress, concurrent edit handling and physical-device responsiveness. Work and latency budgets must be declared before the run; no constant-time promise is made.
Geometry, hydrology, quantities, access and statutory interpretation have separate readiness and evidence.
See the complete [terrain companion](sources/terrain-v0.2.html).

## Reality depth — reconstructed proposal
Represent intrinsic properties, spatial variation, physical state, process history, uncertainty and evidence explicitly when relevant to the requested purpose.
A visual proxy cannot establish manufacturing or physical behaviour.
Examples:
- Colour: appearance depends on material, finish, illumination and viewing conditions. A screen RGB value is a display realization, not a complete material specification.
- Timber: species/grade/source, grain direction, moisture state, member orientation and relevant defect evidence inform process and analysis. Do not infer structural grade from a texture.
- Stone: geological/material identification, bedding/vein orientation, discontinuities, finish and evidence of relevant properties inform cutting, attachment and durability decisions.
The seven primitives remain unchanged; these are typed domain schemas and evaluators. Property values require units, provenance and applicability.

## Geometry-aware appearance — reconstructed proposal
An appearance field binds to semantic boundaries or persistent surface references; it does not bind only to transient triangle indices.
Record field domain, boundary conditions, scalar/vector quantity, units, interpolation method, material-output mapping, source revision and error budget.
An edge-to-aperture colour gradient uses named edge/aperture references and a declared distance-field convention. Topology change triggers remapping or an explicit unresolved state.
Material output is a derived representation. Claims about finish, fabrication or optical performance require separate evidence.

## Cost perspectives — reconstructed proposal
Use shared quantities and scoped cost items with purpose-specific views. Do not sum the perspectives together.

| Perspective | Main decision | Typical content |
|---|---|---|
| Architect | Design value and option comparison | Element/system quantities, allowances and design uncertainty |
| Developer | Delivery feasibility and retained financial exposure | Land, fees, finance, programme, revenues and risk assumptions |
| Builder | Procurement and site delivery | Trade packages, preliminaries, subcontract scope and programme |
| Fabricator | Shop production | Material yield, processes, setups, labour, tooling, finish and QA |
| Installer | Installation | Handling, lifting, access, crews, sequence, temporary works and connection labour |

CostItem requires ID, scope references, quantity and unit, measurement rule, rate and currency, rate date/source, geographic applicability, inclusions/exclusions, waste/contingency basis, uncertainty, owner and pricing status.
Separately declare tax basis, escalation date/index and currency conversion source when used.
Use inclusion ownership and explicit transfer items to prevent double-counting fabrication, transport, installation and overhead.
Unknown lifting/transport methods remain unclassified allowances with assumptions. A precise geometric quantity does not establish a credible rate.
No current prices or statutory compliance values are supplied in this baseline.

## Craft without uncontrolled interference — reconstructed proposal
A CraftOpportunity records scope, design freedom, interface constraints, reserved time/cost, required performance, responsible party and acceptance evidence.
Freedom may occur inside a bounded finish, pattern or component zone while attachment, tolerance, access, structure and sequence interfaces remain explicit.
A change crossing those interfaces triggers impact analysis and a new proposal. Craft is neither suppressed by statistical convention nor exempted from applicable hard constraints.
Display the available freedom and the interface it must preserve at selection time.

## Botanical Pattern Test — reconstructed candidate acceptance test
Purpose: test whether one semantic pattern can produce multiple honest representations and refinements without redefining identity or the kernel.
Fixture: one plant with hierarchical stem/branch/leaf organisation; a local growth/branch parameter; environmental input; coarse render, refined geometry and one explicitly scoped analysis representation.
Required invariants:
1. Semantic IDs persist across LOD changes; ambiguous split/merge correspondence is reported.
2. All outputs bind to an exact revision, producer, seed where stochastic and tolerance.
3. A local edit invalidates the conservative affected scope; global effects are not falsely certified local.
4. Stale analysis is visibly stale and cannot authorize a commit-critical claim.
5. Unsupported physical or biological claims remain unavailable.
6. Replaying pinned inputs produces the declared deterministic result or a bounded reproducibility statement for stochastic outputs.
7. The same transaction, evidence and representation contracts used for walls/terrain suffice.
Evaluate identity continuity, provenance completeness, incremental/full agreement, cancellation/stale-result rejection, bounded work and honest fidelity. Attractive imagery is not a pass.
Failure cases: renderer scene becomes source of truth; LOD changes rename the plant; texture is mistaken for biological truth; missing solver fabricates a result; whole-planet performance is inferred from one plant.
This is a research-track test until the wall and terrain integration gates pass. Planetary tiling, ecosystems, robotics and broad fabrication remain separate programmes with explicit budgets.
