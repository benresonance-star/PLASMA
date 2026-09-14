# Core and authority
Status: consolidation candidate. Existing Foundry requirements are inherited except for explicit corrections listed in decisions.md.

## Objective
Plasma helps people design and deliver dignified housing with less cost, time, complexity and delivery friction. Land, finance, policy, operations and support services remain explicit external dependencies.
For the first implementation programme, success means a designer can make a precise change, understand its consequences, accept a valid alternative and reopen the same coherent project. A larger feature catalogue is not an acceptance metric.

## Authoritative world
Entity, State, Relation, Transform, Invariant, Event and Evidence remain the only kernel primitives.
Snapshots, transactions, dependency indexes, work plans, geometry and renderer scenes are mechanisms or domain representations over those primitives.
Project state and capability state have distinct mutation and promotion boundaries even when the UI exposes them together.
A provider-owned scene, topology index or AI context capsule cannot become a second authoritative world.

## Mutation path
Every accepted material change originates as a typed Transform against an immutable base revision.
Resolve intent and references; compute conservative affected scope; evaluate in an isolated candidate; validate intersecting hard invariants and commit-critical representations; then compare the current head with the pinned base and commit atomically.
The authoritative publication unit includes semantic changes, accepted representation bindings and Event/Evidence lineage. Artifact bytes may be staged first and garbage-collected if unreferenced; no partially accepted semantic state is published.
If any gate fails, accepted head stays unchanged. A conflicted preview may remain visible with the requested edit preserved.
Preview geometry never acquires exact status simply because the user releases a pointer.
Undo appends a compensating Transform and a new revision. History remains addressable.

## Authority and evidence
Observation, interpretation, proposal, evaluation and accepted decision are distinct records.
Every rule carries source, applicability, revision, authority and hard/soft status. AI plausibility checks are advisory unless an explicit governed invariant supplies blocking authority.
Evidence is scoped to exact inputs, producer, environment, fixture and outputs. Imported pass flags remain unverified.
General knowledge is append-only and versioned. Each project pins a baseline. Updating a source triggers impact analysis; project migration is a separate decision.
Unknown applicability, stale evidence and missing solver support remain visible. They do not become passing results.

## Responsive interaction
Pointer motion uses a bounded local preview without a model call.
Release creates a durable proposal; acceptance crosses the common validation/commit boundary for humans, AI, imports and solvers.
Retain the five boundaries: Active World, Dirty Frontier, Dependency Horizon, Representation LOD and Consistency Horizon.
A boundary summary can stop propagation only for an evaluator whose conservative influence contract permits that stop. Terrain geometry, drainage, quantity and access effects need different contracts.
Late worker results must match the pinned revision, request and input digest. Cache identity includes producer/version and upstream results.

## Geometry
PLS-GR-01 retains classify, infer intent, choose strategy, bind references, apply tolerance policy, evaluate, validate, heal and commit.
Healing is bounded and must be followed by validation of the healed candidate, tolerance accounting and topology correspondence before commit. No result can skip post-heal validation.
OpenCascade is the initial exact geometry provider beneath the contract. It does not own semantic identity.
Hard downstream references must resolve unambiguously after topology changes or publication is held. Approximate fallback must satisfy the requesting consumer's declared policy.

## Compatibility
Existing repository SPDS contracts remain legacy implementation contracts. They do not become equivalent to these contracts by matching names.
An adapter must explicitly map IDs, units, status, revision, evidence and error semantics, and pass differential fixtures before adoption.
Within this candidate, contracts.md governs the new schema semantics; explicit consolidation decisions govern conflicting inherited status notes; the preserved Foundry declaration supplies unchanged detailed requirements; the terrain companion supplies domain-specific requirements.
An unresolved requirement conflict remains open and blocks a dependent release claim.

## Bounded interpretation — PLS-INF-01
Separate interpretation, domain evaluation and authoritative mutation. Intelligence proposes meaning; evaluators establish validity within declared assumptions; governed transactions establish accepted project state; evidence connects that state to reality. Determinism alone does not establish physical truth or correct interpretation.
Explicit intent outranks predictions. Uncertainty and abstention remain expressible. Inference cannot waive hard checks, alter authority or certify dependency closure. Execute through existing PLS-10/13/14/15/16 and Geometry Resolver boundaries.
See [PLS-INF-01](inference.md) for contracts, routing, provenance and M1 acceptance criteria.

## Interaction responsiveness — PLS-INT-01
Input/render scheduling is independent of geometry, propagation, simulation, reasoning and commit scheduling, with explicit revision/sequence consistency. Ephemeral overlays provide honest local feedback; they never become another authoritative world. Slow hard validation may hold acceptance without blocking camera, inspection or cancellation. See [Interaction Session Runtime](interaction.md).
