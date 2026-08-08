# Semantic Parametric Design System (SPDS) v1.2

## Build Candidate --- Complete Agent-Executable Engineering Specification for Grok 4.5

> **Integrated specification note:** This file contains the complete
> retained SPDS v1.0 specification, the integrated v1.1 architecture,
> and the v1.2 build-candidate amendments. Earlier requirements remain
> binding unless v1.2 explicitly strengthens them. This is intended to
> be the single specification handed to the implementation agent.

**Status:** Build Candidate --- supersedes v1.0/v1.1 while preserving
their requirements\
**Primary reference implementation:** Parametric geodesic dome composed
of robust Y-shaped components distributed by hexagonal/pentagonal
topology\
**Primary implementation agent:** Grok 4.5\
**Architecture principle:** The semantic parametric model is the source
of truth. It is resolved through composition into a typed Parametric IR
and execution DAG; deterministic topology, geometry, meshing, analysis,
fabrication and documentation engines compile derived representations
from it.\
**Target:** A modular, extensible, agent-addressable computational
design platform capable of exact CAD geometry, fabrication outputs,
persistent identity, versioning, and later structural analysis.

------------------------------------------------------------------------

# 1. Purpose

Build a reusable semantic parametric design system in which a design is
represented as structured, typed, versioned data rather than being
trapped inside UI state, mesh data, or hard-coded geometry functions.

The system must allow humans and AI agents to:

-   create, read, update, delete, connect, disconnect, fork, compose,
    specialise and version design objects;
-   add new parameter types, patterns, rules, constraints, affectors,
    features, representations and outputs without rewriting the core
    language;
-   regenerate exact geometry deterministically after semantic changes;
-   preserve stable semantic identities across regeneration and Boolean
    operations;
-   expose design intent, dependency logic, pipelines and generated
    geometry in the UI;
-   derive fabrication-ready parts, dimensions, component families, BOMs
    and cut lists;
-   export exact/derived geometry to suitable downstream formats;
-   branch, compare and restore designs at points in time;
-   provide a constrained semantic API through which AI can safely
    inspect and modify designs;
-   later compile the same semantic model into structural/FEM
    representations without making FEM the source of truth.

The system is not merely a dome modeller. The dome is the first
demanding reference case used to prove the architecture.

------------------------------------------------------------------------

# 2. Product Goal

Create an **agent-addressable parametric design language and compiler**
for physical design.

The central stack is:

``` text
Human / AI Agent
       |
       v
Semantic CRUD + Command API
       |
       v
SEMANTIC PARAMETRIC GRAPH  <-- SOURCE OF TRUTH
       |
       v
Dependency / Validation / Compilation Layer
       |
       +--------------------+---------------------+
       |                    |                     |
       v                    v                     v
Geometry Compiler       Analysis Compiler     Fabrication Compiler
       |                    |                     |
       v                    v                     v
OpenCascade / OCCT       FEM adapters          Parts/BOM/Drawings
       |
       v
Tessellation
       |
       v
Three.js / WebGL-WebGPU Viewport
```

OpenCascade is not the product model. Three.js is not the product model.
FEM meshes are not the product model. They are deterministic
representations derived from the semantic parametric graph.

------------------------------------------------------------------------

# 3. Non-Goals for v1

Do not attempt to build:

-   a general replacement for Rhino, Grasshopper, SolidWorks, Revit or
    ANSYS;
-   a new B-rep kernel;
-   a new FEM solver;
-   a universal visual programming language;
-   unconstrained natural-language-to-arbitrary-code execution;
-   production certification of structural designs;
-   CAM toolpath generation for every manufacturing process;
-   collaborative multi-user editing in the first implementation unless
    it falls out cheaply from the persistence architecture.

Use mature deterministic libraries for difficult mathematics.

------------------------------------------------------------------------

# 4. Required Engineering Skills

Grok should treat the work as requiring these skills and boundaries:

1.  **TypeScript domain modelling** --- discriminated unions, schemas,
    immutable identifiers, command/event contracts.
2.  **Graph/dependency systems** --- DAG evaluation, invalidation,
    provenance, dependency traversal.
3.  **Computational geometry integration** --- call OCCT rather than
    reimplement robust CAD algorithms.
4.  **Topology/graph mathematics** --- geodesic/Goldberg topology,
    adjacency, dual graphs, local frames.
5.  **React application architecture** --- inspector, viewport,
    graph/pipeline explorer, history UI.
6.  **Three.js** --- rendering, picking, highlighting, measurement
    overlays, LOD.
7.  **Database design** --- PostgreSQL, JSONB where appropriate,
    normalized identity/event/version tables.
8.  **Event sourcing/version snapshots** --- immutable operations plus
    materialized snapshots.
9.  **API design** --- typed CRUD and semantic command endpoints.
10. **Testing** --- unit, property, topology, geometry validity,
    regression, round-trip, UI and performance tests.
11. **Containerization** --- reproducible geometry service and CI
    environment.
12. **Fabrication data modelling** --- parts, connections, fasteners,
    dimensions, BOM/cut-list generation.

Grok must not invent complex geometry mathematics where a tested
kernel/operator can be used.

------------------------------------------------------------------------

# 5. Architectural Invariants

These are mandatory.

## 5.1 Semantic model is authoritative

Every meaningful design object has a stable semantic ID and type.
Generated geometry may be discarded and regenerated.

## 5.2 Geometry is derived

No business/design logic may depend solely on transient Three.js object
IDs, triangle indices or OCCT transient topology identifiers.

## 5.3 Stable identity survives regeneration

`component:y:0042` remains the same semantic component when its B-rep
changes because diameter, aperture, cuts or connector parameters
changed.

## 5.4 Topology before detailed geometry

For cellular systems, create semantic/topological cells, edges, vertices
and junctions first. Generate B-rep components from those objects
second.

## 5.5 Meaning separated from implementation

Semantic instruction:

``` yaml
feature: shell
thickness: 8 mm
direction: inward
```

must not expose OCCT class/function names.

## 5.6 Deterministic compilation

Same semantic snapshot + same compiler/operator versions + same
tolerance policy must produce equivalent outputs.

## 5.7 Patterns are data

Patterns are inspectable, versioned, editable, forkable and composable
semantic graphs, not opaque plug-ins.

## 5.8 AI acts through validated semantic operations

AI does not directly mutate database tables, OCCT B-reps or arbitrary
application code during normal design manipulation.

## 5.9 Units are explicit

No untyped dimensional number is permitted for physical parameters.

## 5.10 Fabrication readiness is a state, not an assumption

A part must pass geometry and fabrication validation before being marked
fabrication-ready.

------------------------------------------------------------------------

# 5A. v1.1 Integrated Architectural Additions

The following requirements are **additive to the original v1.0
specification**. They do not replace the semantic graph, pattern,
operator, OCCT, Three.js, fabrication, database, history, AI, UI,
testing, benchmark, security, observability, caching, schema-evolution
or checkpoint requirements elsewhere in this document.

The v1.1 architecture is:

``` text
Human / AI
    |
    v
Semantic Query + CRUD + ChangeSet API
    |
    v
SEMANTIC DESIGN MODEL  <-- authoritative source of truth
    |
    +-- Entities / Parameters / Relationships
    +-- Patterns / Rules / Affectors
    +-- Selectors / Constraints / Objectives
    +-- Variants / Layers / Overrides
    +-- Materials / Connections / Fasteners
    +-- Analysis / Fabrication / PMI semantics
    |
    v
COMPOSITION + RESOLUTION ENGINE
    |
    v
PARAMETRIC INTERMEDIATE REPRESENTATION (PIR)
    |
    v
EXECUTION DAG
    |
    +----------------+----------------+----------------+
    |                |                |                |
    v                v                v                v
Topology         Exact CAD        Analysis Mesh    Product/Fab
operators        OCCT             Gmsh             compiler
    |                |                |                |
    +----------------+----------------+----------------+
                     |
                     v
              Derived Representations
       Three.js / STEP / STL / GLB / BOM /
       cut lists / dimensions / PMI / FEM
```

## 5A.1 Parametric Intermediate Representation is mandatory

The semantic graph expresses **meaning**. The PIR expresses the
deterministic executable program produced after pattern resolution, rule
evaluation, variant composition and selector resolution.

PIR must be:

-   typed;
-   deterministic;
-   serializable;
-   inspectable;
-   hashable;
-   versioned;
-   kernel-neutral;
-   traceable back to semantic owners;
-   visible in diagnostics/UI;
-   suitable for replay;
-   incapable of embedding arbitrary persisted JavaScript.

Example:

``` yaml
id: pir:y042-arm-a
op: sweep
operator: geometry.sweep@1.0.0
semanticOwner: component:y:0042
inputs:
  path:
    selector: edge:0031
  profile:
    selector: profile:y-member
frame:
  source: junction:0042
produces:
  role: arm:A
provenance:
  patternInstance: pattern-instance:y-network-01
```

The PIR must not contain direct OCCT API calls. Kernel adapters
translate PIR operations to implementation-specific calls.

## 5A.2 Execution DAG

Compilation of PIR creates an execution DAG containing:

-   operation IDs;
-   dependencies;
-   invalidation edges;
-   operator versions;
-   canonical input hashes;
-   tolerance-policy version;
-   expected output types;
-   semantic owners;
-   execution status;
-   cache status;
-   timing;
-   diagnostics.

The DAG is the basis for incremental regeneration, pipeline
visualization and reproducibility.

## 5A.3 Persistent sub-element naming and topological provenance

Stable component identity alone is insufficient. v1.1 requires a
persistent reference system for semantically important sub-elements.

Never persist `Face17`, `Edge24` or equivalent transient kernel indices
as design references.

Support semantic paths such as:

``` text
component:y:0042/arm:A/start
component:y:0042/arm:A/end
component:y:0042/arm:A/mounting-face
connection:0083/plate:A/outer-face
cell:h:0017/boundary-edge:03
```

Topological provenance records must support at least:

``` text
generated-from
modified-from
split-from
merged-from
trimmed-from
deleted-by
survives-as
```

A topology history record links:

``` text
semantic anchor
    -> PIR operation
    -> kernel operation result
    -> generated/modified B-rep sub-elements
```

When an operation causes ambiguity, the system must report an unresolved
reference rather than silently attaching a dimension, connector, load or
manufacturing feature to the wrong geometry.

## 5A.4 Selector is a first-class semantic object

Add `Selector` to the core language.

Selectors address semantic or geometric targets declaratively.

Examples:

``` yaml
kind: Selector
semanticType: selection.semantic-query
where:
  semanticType: structural.y-component
  adjacentTo:
    cellType: pentagon
```

``` yaml
kind: Selector
semanticType: selection.sub-element
owner: component:y:0042
path:
  - arm:A
  - terminal:outer
  - role:mounting-face
```

Selectors may target:

-   entities;
-   relationships;
-   topology;
-   product parts;
-   geometric sub-elements;
-   spatial regions;
-   classifications;
-   capabilities;
-   validation states;
-   fabrication states.

Selectors are reusable by patterns, rules, affectors, connections,
dimensions, analysis loads/supports, materials, exports and AI queries.

## 5A.5 Separate three topology domains

The system must explicitly distinguish:

### Design topology

Conceptual design relationships:

``` text
cell
junction
member
boundary
connection intent
```

### Product topology

Manufacturable/assemblable structure:

``` text
assembly
part
subpart
connector
plate
fastener
```

### Geometric topology

Kernel-level shape structure:

``` text
compound
solid
shell
face
wire
edge
vertex
```

Mappings between domains are explicit many-to-many relationships. Do not
assume one design member equals one product part or one B-rep solid.

## 5A.6 Composition, inheritance, specialisation and overrides

Pattern composition is expanded into a general composition system.

Support:

-   reference;
-   instantiate;
-   specialise;
-   inherit;
-   override;
-   compose;
-   fork;
-   layer;
-   variant;
-   deprecate.

Example:

``` text
BoltedConnection@2.0
    -> specialise AluminiumBoltedConnection
        -> specialise DomeBoltedConnection
            -> instance connection:0083
                -> project override
                    -> experiment override
```

Published base definitions remain immutable. Overrides store deltas
rather than destructive copies where practical.

Composition must resolve deterministically to an effective semantic
state before PIR generation.

## 5A.7 Variants are distinct from history

History answers **what changed over time**.

Variants answer **which intentional alternative is active**.

Required v1.1 variant dimensions for the reference architecture:

-   geometry;
-   material;
-   connection;
-   fabrication strategy.

Example:

``` text
Geometry: 20m | 22m
Material: aluminium | steel
Connection: bolted | prototype
```

A variant selection must be recorded in snapshots and compilation
provenance.

## 5A.8 Constraint taxonomy

Replace a single undifferentiated constraint concept with typed
categories:

1.  **Validation constraint** --- checks a condition.
2.  **Geometric constraint** --- defines geometric relation.
3.  **Relational constraint** --- derives one semantic quantity from
    another.
4.  **Solvable constraint** --- participates in a future solver.
5.  **Fabrication constraint** --- manufacturing/transport requirement.
6.  **Analysis constraint** --- performance requirement.
7.  **Advisory constraint** --- reports guidance without blocking.

Objectives are distinct from constraints.

Examples:

``` text
memberLength <= 2400 mm              fabrication constraint
clearOpening >= 650 mm               validation constraint
axis(A) coincident axis(B)            geometric constraint
plateThickness = memberWall * 1.5     relational constraint
utilisation <= 0.85                   analysis constraint
minimise uniquePartFamilies           objective
minimise mass                         objective
```

v1.1 does not require a general-purpose optimiser, but the schema must
be solver-ready.

## 5A.9 Semantic query and EXPLAIN language

CRUD is insufficient for an agent-addressable design model.

Add query operations:

``` text
QUERY
FILTER
SEARCH
TRAVERSE
AGGREGATE
TRACE
EXPLAIN
```

The system must answer queries such as:

-   show every Y component adjacent to a pentagon;
-   show parts longer than 2400 mm;
-   find all objects affected by `affector:world-cut-01`;
-   what parameters influence `component:y:0042`;
-   what will be invalidated if this parameter changes;
-   which connection generated this hole;
-   why does this component exist;
-   which parts are not fabrication-ready.

`EXPLAIN` returns lineage, not an LLM-generated guess.

## 5A.10 Lineage and causality

Every meaningful derived result should be traceable backwards.

Example:

``` text
Hole H-183
  <- generated-by HoleRequirement
  <- required-by Bolt B-83-01
  <- part-of Connection C-083
  <- instantiated-from BoltedPlateConnection@2.3
  <- applied-by Rule perimeter-connection
  <- targeted Y-042
  <- generated-from Junction J-042
```

Lineage must be queryable and exposed in the UI.

## 5A.11 Capability-based extensibility

Semantic types may declare capabilities independently of concrete class
names.

Initial capability vocabulary:

``` text
measurable
dimensionable
fabricatable
connectable
pattern-target
affectable
shellable
boolean-target
analysable
analysable-as-beam
analysable-as-shell
exportable
material-assignable
```

Patterns/operators may require capabilities instead of hard-coded
dome-specific types.

## 5A.12 Packages and manifests

Patterns, schemas, operator bindings, materials, fixtures and
documentation may be grouped into versioned packages.

Package manifest contains:

``` text
package id
version
dependencies
semantic namespaces
patterns
schemas
operator requirements
materials
fixtures
tests
compatibility
migration hooks
```

Example future packages:

``` text
spds-core
geodesic-systems
structural-y-system
fabrication-connections
architectural-stairs
```

v1.1 only needs local package loading/validation; remote package
distribution is not required.

## 5A.13 Model-Based Definition / PMI readiness

Dimension semantics must not be designed as viewport-only annotations.

Add schema-ready concepts:

``` text
Datum
Tolerance
GeometricTolerance
SurfaceFinish
ManufacturingFeature
InspectionRequirement
PMIAnnotation
```

V1.1 requires only a minimal subset to prove semantic storage and
attachment to persistent selectors. Full GD&T authoring is out of scope.

STEP export architecture should target an AP242-capable path where
practical. If the selected OCCT implementation cannot emit all semantic
PMI in the first release, preserve the semantic data and report the
export limitation explicitly.

## 5A.14 Gmsh analysis-mesh proof

A real FEM solver remains outside the fabrication-critical v1 path, but
v1.1 must prove semantic geometry can become an analysis mesh.

Required proof:

``` text
Semantic design
    -> analysis abstraction
    -> OCCT/reference geometry
    -> Gmsh mesh
    -> semantic/physical groups
    -> mesh artifact + provenance
```

At minimum demonstrate:

-   beam-network mesh or a simple shell fixture;
-   material group;
-   support group;
-   load group;
-   semantic IDs mapped to mesh groups;
-   mesh-quality metrics;
-   result-ready artifact contract.

No structural certification claims.

## 5A.15 AI execute-measure-validate-repair loop

AI mutation must use a closed deterministic feedback loop:

``` text
intent
 -> read/query/explain
 -> propose ChangeSet
 -> semantic validation
 -> impact preview
 -> apply on branch
 -> resolve composition
 -> compile PIR
 -> execute DAG
 -> exact geometry validation
 -> fabrication/constraint validation
 -> quantitative measurements
 -> optional visual check
 -> accept OR structured failure
```

For recoverable failures, an AI may perform a bounded repair loop:

``` text
diagnostic -> revised ChangeSet -> recompile
```

Default maximum automatic repair attempts: configurable, initially `3`.

Each attempt is recorded. AI may not relax hard constraints or tolerance
policy silently.

## 5A.16 Why / What-If interaction model

The UI must provide two cross-system interactions.

### WHY

For a selected object show:

-   semantic identity;
-   type/capabilities;
-   generated-from lineage;
-   active patterns;
-   rules that applied;
-   selectors that target it;
-   upstream parameters;
-   affectors;
-   downstream product parts;
-   connections;
-   dimensions;
-   validation;
-   representations;
-   exports.

### WHAT IF

Allow temporary branch-based parameter/variant proposals and show
estimated or compiled deltas:

``` text
geometry
part count
family count
mass
fabrication validity
affected objects
analysis mesh metrics
```

Preview results must never be confused with exact validated results.

------------------------------------------------------------------------

# 5B. v1.2 Build-Candidate Amendments

These requirements are additive to all v1.0 and v1.1 requirements. They
close the principal failure modes identified during pre-build stress
testing. If a v1.2 requirement conflicts with an earlier implementation
detail, preserve the earlier design intent while using the stricter v1.2
safety/reproducibility requirement.

## 5B.1 Design Transactions and Atomic Publication

Every semantic mutation that can change compiled design state must
execute inside a `DesignTransaction`.

A transaction contains:

``` yaml
id: txn:uuid
modelId: model:uuid
branchId: branch:main
expectedHeadHash: sha256:...
changeSetId: changeset:uuid
actor:
  type: user | ai | system
commands: [...]
createdAt: ...
```

Required lifecycle:

``` text
BEGIN
  -> validate command syntax
  -> verify expected head
  -> apply commands to isolated candidate semantic state
  -> resolve composition/variants/selectors
  -> compile PIR
  -> build execution DAG
  -> execute affected nodes
  -> validate topology
  -> validate exact geometry
  -> heal where policy permits
  -> validate product/fabrication constraints
  -> generate required candidate representations
  -> produce CompileManifest
  -> publication gate
COMMIT or ABORT
```

No partially regenerated candidate may become the published current
design.

Introduce:

-   `DesignTransaction`
-   `CandidateRevision`
-   `CompileManifest`
-   `PublicationManifest`
-   `PublicationGate`
-   `TransactionDiagnostic`

A publication manifest records the exact semantic snapshot, PIR hash,
execution DAG hash, environment manifest, validation results and
artifact hashes published together.

If one required component fails, the previous published revision remains
authoritative.

## 5B.2 Optimistic Concurrency

All mutating commands must include an expected model/branch head.

If:

``` text
expectedHeadHash != currentHeadHash
```

return a structured `HEAD_CONFLICT`.

Never silently replay a stale AI/user ChangeSet against a newer head.

Provide:

-   conflict metadata;
-   changed semantic IDs since expected head;
-   safe rebase eligibility;
-   explicit rebase/re-proposal path.

V1 remains usable by one person, but concurrency correctness is required
because user actions, AI branches and background compilation can
overlap.

## 5B.3 Undo / Redo

Snapshots are not a substitute for interaction-level undo.

Implement semantic undo/redo using compensating commands/events.

Requirements:

-   undo never rewrites historical events;
-   redo is invalidated or branched appropriately after divergent edits;
-   transactions are the default undo granularity;
-   UI may group rapid parameter edits into one interaction transaction;
-   undoing a published design creates a new head representing the
    inverse state;
-   compiled artifacts are regenerated/invalidation-aware;
-   AI-generated ChangeSets can be undone exactly like user ChangeSets.

## 5B.4 Topological Naming Torture Suite

Persistent naming is a V1 release gate.

Create a dedicated adversarial fixture suite covering repeated sequences
of:

-   dimensional changes;
-   topology frequency changes;
-   shell/unshell;
-   Boolean add/subtract/intersect;
-   moving affectors;
-   fillet/chamfer where supported;
-   split/merge faces;
-   connector add/remove/change;
-   hole generation;
-   trimming;
-   pattern count changes;
-   component replacement.

For every persistent selector, each mutation must result in exactly one
of:

1.  correct surviving reference;
2.  explicitly unresolved reference with diagnostic;
3.  intentionally deleted reference.

The forbidden result is a silently incorrect remap.

Add benchmark:

### B12 --- Topological Naming Torture

-   minimum 500 deterministic mutation sequences;
-   record survival rate;
-   unresolved rate;
-   intentional deletion rate;
-   **silent wrong-reference target: 0**.

Any discovered silent wrong-reference bug blocks fabrication-ready
status.

## 5B.5 Import and Semanticisation

V1.2 must support exact/reference geometry entering SPDS.

Initial required import:

-   STEP.

Architecture must leave adapters for:

-   IFC;
-   IGES;
-   STL/mesh;
-   GLTF/GLB;
-   native future connectors.

Imported geometry is not automatically claimed to be natively
parametric.

Introduce:

``` text
ImportedAsset
ImportedShape
SemanticAssertion
RecognitionResult
SemanticisationSession
```

Pipeline:

``` text
external file
 -> import adapter
 -> exact/reference geometry
 -> imported topology/provenance
 -> user/AI semantic assertions
 -> optional deterministic recognition
 -> selectors
 -> semantic wrapper/entities
```

V1 STEP proof: - import STEP; - preserve source hash and units; -
display it; - query imported solids; - attach semantic
type/material/role assertions; - reference imported geometry with
selectors; - include it in an assembly; - export/derive without
pretending imported feature history exists.

## 5B.6 Coordinate Frames and Unit Boundaries

Add first-class `CoordinateFrame`.

Required frame roles:

``` text
WORLD
PROJECT
ASSEMBLY
COMPONENT
FEATURE
PATTERN
ANALYSIS
FABRICATION
IMPORT
```

Every cross-frame transform records:

-   source frame;
-   target frame;
-   4x4 transform or equivalent exact representation;
-   units;
-   handedness;
-   up axis;
-   forward axis where relevant;
-   transform provenance.

Canonical internal length remains millimetres unless explicitly changed
by a future migration.

Import adapters must detect/read source units where possible and require
explicit confirmation/diagnostic when ambiguous.

World-space affectors must reference `WORLD` rather than relying on
viewport transforms.

## 5B.7 Reproducibility Manifest

Every snapshot eligible for fabrication release must bind to a
`ReproducibilityManifest`.

Minimum fields:

``` text
SPDS schema version
compiler version / commit
semantic package versions
pattern package versions
operator versions
OCCT version
mesher adapter + version
tolerance policy version
unit policy version
platform/runtime architecture
container image digest where used
database migration version
feature flags affecting compilation
```

A historical fabrication release must be able to report whether it is:

-   exactly reproducible;
-   reproducible with compatible substitutions;
-   not currently reproducible, with reasons.

Never silently compile an old fabrication release under materially
different operator/kernel versions and label it identical.

## 5B.8 Dependency and Licence Governance

Every external computational dependency must have a governance record:

``` yaml
name:
version:
purpose:
license:
linkingModel:
distributionImpact:
serverOnly:
optional:
replaceableAdapter:
securityUpdatePolicy:
source:
```

OCCT, Gmsh or any future solver must sit behind replaceable adapters.

Gmsh must not become an unavoidable core-domain dependency.

G0 technology decisions must explicitly record distribution/licensing
implications before dependency adoption.

Add CI check for: - dependency licence inventory; - prohibited/unknown
licences; - pinned versions for fabrication-critical dependencies.

This is engineering governance, not legal advice; unresolved
distribution/licence questions are release blockers until reviewed.

## 5B.9 Artifact Store, Integrity, Retention and Recovery

Large derived artifacts must not be stored as arbitrary database blobs
by default.

Use:

``` text
PostgreSQL
  semantic state
  events
  graph metadata
  artifact metadata
  provenance
  manifests

Object Store
  B-rep artifacts
  STEP
  STL
  GLB
  meshes
  drawings
  reports
  large diagnostics
```

Artifacts are immutable and content-addressed using SHA-256 or stronger
approved digest.

Artifact metadata includes: - hash; - MIME/type; - byte size; - creator
operation/run; - semantic snapshot; - environment manifest; - storage
location; - retention state.

Required operational functions: - integrity verification; - orphan
detection; - reference counting or equivalent reachability; -
garbage-collection dry run; - retention policy; - backup; - restore; -
restore verification.

Fabrication-release artifacts are protected from automatic garbage
collection.

## 5B.10 Sketch / Geometric Constraint Contract

V1.2 does not require a production sketch solver, but the language/API
must support future solver integration without redesign.

Minimum constraint vocabulary contract:

``` text
coincident
horizontal
vertical
parallel
perpendicular
equal
distance
angle
radius
diameter
tangent
concentric
symmetric
fixed
```

Constraint states:

``` text
satisfied
under-constrained
fully-constrained
over-constrained
conflicting
unsupported
```

Provide a `ConstraintSolverAdapter` interface and deterministic fixture
schemas. No claim of solving unsupported constraints.

## 5B.11 Assembly, Instance, Mate and Connection Semantics

Promote assemblies to a first-class subsystem.

Add:

``` text
Assembly
ComponentDefinition
ComponentInstance
Mate
Joint
Interface
Connection
Transform
```

Distinctions:

-   `ComponentDefinition` describes reusable product/design definition.
-   `ComponentInstance` places it in an assembly.
-   `Mate` expresses geometric placement relationship.
-   `Joint` expresses allowed kinematic relationship.
-   `Connection` expresses physical joining/fabrication system.
-   `Interface` exposes intended connectable surfaces/axes/points.

Required initial mates: - coincident; - concentric; - distance/offset; -
aligned-axis.

Connections may depend on mates/interfaces but must not be conflated
with them.

Instance identity must remain stable when a reusable definition changes.

## 5B.12 Canonical Reference Models

The architecture must prove generality against three reference domains.

### D01 --- Geodesic Y Dome

Tests: - complex topology; - hexagon/pentagon layout; - repeated Y
components; - world-space affectors; - shelling/Booleans; -
connections/fasteners; - rationalisation; - fabrication.

### A01 --- Parametric Assembly

A small mechanical/architectural node assembly containing: - reusable
component definitions; - multiple instances; - mates; - interfaces; -
bolted connection; - fasteners; - persistent face/axis selectors; -
assembly transform changes; - STEP import reference.

Tests: - instance identity; - assembly semantics; - mates vs
connections; - persistent references; - BOM.

### F01 --- Freeform Panel Surface

A trimmed/freeform shell or canopy containing: - NURBS/freeform surface
input; - trimming; - shelling; - irregular panelisation; - panel
boundaries; - local frames; - fabrication panel identities.

Tests: - non-geodesic geometry; - freeform topology; - trimming/shelling
robustness; - selector/provenance survival; - panel fabrication output.

V1 architecture is not accepted if any reference model requires
bypassing the semantic/PIR/operator architecture with domain-specific
shortcuts.

## 5B.13 Scale Tiers

Retain the original interactive semantic benchmark and add:

### B1-S

-   10,000 semantic objects;
-   30,000 relationships;
-   interactive target.

### B1-M

-   100,000 semantic objects;
-   representative relationship density;
-   bounded query/CRUD/invalidation performance;
-   lazy UI loading permitted.

### B1-L

-   1,000,000 semantic objects;
-   system must remain operable;
-   full eager rendering is not required;
-   test pagination, indexing, streaming/lazy loading and bounded
    memory;
-   record query and graph traversal timings.

The objective of B1-L is architectural survival, not instant full-model
rendering.

## 5B.14 Adversarial Composition Tests

Composition tests must include:

-   nested specialisation;
-   project overrides;
-   experiment overrides;
-   conflicting opinions;
-   reference cycles;
-   pattern dependency cycles;
-   variant conflicts;
-   missing package dependency;
-   incompatible package version;
-   deleted/deactivated base object;
-   override of non-overridable field;
-   deterministic ordering of equal-strength inputs.

Cycles or irreconcilable composition conflicts must fail with structured
diagnostics, never recursion/hang.

## 5B.15 Worker Isolation, Cancellation and Resource Budgets

Exact geometry and meshing operations can hang, crash or exhaust memory.

All non-trivial geometry/meshing jobs require: - worker/process
isolation where supported; - timeout; - cancellation token; -
memory/resource budget; - structured crash diagnostic; - retry policy; -
idempotent job identity; - stale-result rejection if branch head
changed; - no partial publication.

UI must expose: - queued; - running; - cancelling; - cancelled; -
failed; - succeeded; - stale.

## 5B.16 Determinism Classes

Not every representation can be byte-identical across every platform.

Classify outputs:

### D0 --- semantic deterministic

Same canonical semantic input produces same canonical semantic hash.

### D1 --- operation deterministic

Same resolved semantic state and operator versions produce same PIR/DAG.

### D2 --- geometric-equivalent

Exact geometry is equivalent within declared tolerance even if
serialization ordering differs.

### D3 --- byte-reproducible artifact

Required where export implementation supports canonical deterministic
serialization.

Benchmarks and manifests must state which determinism class applies.

## 5B.17 Failure Taxonomy

Standardize errors:

``` text
SEMANTIC_INVALID
SCHEMA_INCOMPATIBLE
HEAD_CONFLICT
SELECTOR_UNRESOLVED
SELECTOR_AMBIGUOUS
COMPOSITION_CONFLICT
DEPENDENCY_CYCLE
OPERATOR_UNAVAILABLE
OPERATOR_FAILED
GEOMETRY_INVALID
GEOMETRY_TOLERANCE_EXCEEDED
BOOLEAN_FAILED
HEALING_FAILED
MESH_FAILED
FABRICATION_INVALID
CONSTRAINT_FAILED
IMPORT_UNIT_AMBIGUOUS
RESOURCE_LIMIT
CANCELLED
STALE_RESULT
PUBLICATION_BLOCKED
ARTIFACT_INTEGRITY_FAILED
```

Every error carries: - code; - human-readable summary; - affected
semantic IDs; - operation/PIR ID where relevant; - lineage; -
recoverability; - suggested deterministic next actions where known.

## 5B.18 Security Boundaries for Extensibility

Pattern data remains declarative.

Operator/package extensions: - cannot execute arbitrary persisted
scripts in the core process; - require declared capabilities; - run
through approved adapters/workers; - validate package manifests; -
restrict filesystem/network access by default; - log execution
provenance.

AI cannot install/activate an executable operator package merely through
a semantic ChangeSet without the required administrative approval path.

## 5B.19 Release Objects

Introduce a formal `DesignRelease`.

A release binds:

``` text
model
branch
snapshot
publication manifest
reproducibility manifest
required artifact hashes
validation report
fabrication readiness state
release label/version
author/approver metadata
timestamp
```

States:

``` text
draft
candidate
validated
released
superseded
withdrawn
```

Only a validated release may be described by the system as
fabrication-ready.

------------------------------------------------------------------------

# 6A. v1.2 Additional Module Architecture

Add or preserve the following package boundaries:

``` text
packages/
  transaction-core/
  concurrency-core/
  undo-redo/
  coordinate-frames/
  import-core/
  reproducibility/
  dependency-governance/
  artifact-core/
  assembly-core/
  constraint-contracts/
  release-core/
  failure-taxonomy/

services/
  artifact-store/
  geometry-occt/
  meshing-adapter/
  import-worker/
```

Rules:

1.  `transaction-core` depends on semantic commands and compilation
    contracts, not OCCT.
2.  `assembly-core` remains kernel-neutral.
3.  `artifact-core` knows hashes/metadata, not domain geometry
    implementation.
4.  import adapters produce normalized import contracts.
5.  licence/dependency governance is build/deployment metadata, not
    semantic design state.
6.  release objects reference immutable manifests/artifacts.
7.  UI never treats a worker result as published until a
    `PublicationManifest` exists.

------------------------------------------------------------------------

# 17A. v1.2 Database Additions

Add/migrate tables or equivalent stores:

``` text
design_transactions
candidate_revisions
compile_manifests
publication_manifests
reproducibility_manifests
undo_groups
coordinate_frames
imported_assets
semantic_assertions
component_definitions
component_instances
mates
joints
interfaces
design_releases
artifact_objects
artifact_references
dependency_records
worker_runs
```

Database requirements:

-   transactionally commit semantic event/head/publication metadata;
-   use optimistic concurrency on branch head;
-   immutable content hashes for published manifests;
-   foreign-key or application-level integrity for artifact references;
-   indexes for semantic ID, branch/head, lineage, selector targets,
    artifact hashes and release state;
-   migrations additive where possible;
-   tested backup/restore path.

------------------------------------------------------------------------

# 18A. v1.2 Command / Query API Additions

Representative commands:

``` text
POST /models/:id/transactions
POST /models/:id/transactions/:txnId/validate
POST /models/:id/transactions/:txnId/commit
POST /models/:id/transactions/:txnId/abort

POST /models/:id/undo
POST /models/:id/redo

POST /models/:id/imports
POST /models/:id/semantic-assertions

POST /models/:id/assemblies
POST /models/:id/mates
POST /models/:id/connections

POST /models/:id/releases
POST /models/:id/releases/:releaseId/validate
POST /models/:id/releases/:releaseId/publish

GET  /models/:id/artifacts/:hash
POST /models/:id/artifacts/verify

POST /models/:id/jobs/:jobId/cancel
```

Every mutation response includes: - transaction ID; - previous head; -
candidate/new head; - affected semantic IDs; - invalidated DAG nodes; -
compile/publication state; - diagnostics.

------------------------------------------------------------------------

# 21A. v1.2 UI Additions

The UI must expose system truth, not just geometry.

Add:

### Transaction / Publication Status

Show: - current published head; - candidate head; - compiling state; -
publication gate; - validation failures; - stale/cancelled jobs.

### Undo / Redo

-   transaction-level undo;
-   readable action description;
-   AI/user provenance.

### Import / Semanticise

-   imported asset list;
-   source units/hash;
-   exact/reference geometry state;
-   semantic assertions;
-   unresolved recognition.

### Assembly Inspector

-   definitions;
-   instances;
-   mates;
-   interfaces;
-   physical connections;
-   transforms.

### Coordinate Frame Inspector

-   current object frame;
-   world/project transforms;
-   frame visualization;
-   unit/axis metadata.

### Release / Reproducibility View

-   release status;
-   snapshot;
-   validation;
-   compiler/kernel/package versions;
-   artifact hashes;
-   reproducibility status.

### Artifact / Integrity View

-   artifacts by release;
-   content hashes;
-   storage/integrity status;
-   regeneration eligibility.

UI benchmark additions: - user can identify whether viewport geometry is
published or candidate within 2 seconds; - user can trace a failed
publication to the blocking semantic/component error in \<= 3
interactions; - user can undo the last transaction in one primary
action; - user can inspect an imported asset's units/source hash in \<=
2 interactions; - user can identify which release produced a fabrication
artifact in \<= 3 interactions.

------------------------------------------------------------------------

# 22A. v1.2 Test Strategy Additions

## Transaction tests

-   atomic commit;
-   failed compile abort;
-   previous published state remains visible;
-   stale worker cannot publish;
-   duplicate transaction idempotency.

## Concurrency tests

-   stale expected head;
-   user vs AI conflict;
-   safe re-proposal;
-   no lost update.

## Undo tests

-   parameter;
-   create/delete;
-   pattern mutation;
-   connector;
-   multi-command transaction;
-   AI ChangeSet.

## Import tests

-   STEP units;
-   multiple solids;
-   semantic assertion;
-   selector attachment;
-   assembly placement;
-   malformed file;
-   ambiguous units.

## Coordinate tests

-   nested transforms;
-   world-space affector;
-   imported axes;
-   round-trip frame transforms;
-   millimetre/metre boundary.

## Recovery tests

-   database restore;
-   artifact restore;
-   missing artifact;
-   corrupted artifact hash;
-   release integrity verification.

## Worker tests

-   timeout;
-   cancellation;
-   crash;
-   memory/resource rejection;
-   retry;
-   stale completion.

## Assembly tests

-   definition/instance distinction;
-   mate update;
-   instance transform;
-   connection persistence;
-   BOM counts.

## Reproducibility tests

-   exact manifest replay;
-   incompatible operator version;
-   missing package;
-   tolerance-policy change;
-   artifact equivalence class.

------------------------------------------------------------------------

# 23A. v1.2 Benchmark Additions

In addition to all original and v1.1 benchmarks:

### B12 --- Topological Naming Torture

500+ deterministic mutation sequences; zero silent wrong references.

### B13 --- Transaction Atomicity

Inject failures at every major compile stage; published head/artifacts
must remain internally consistent.

### B14 --- Concurrency

Run overlapping user/AI transaction fixtures; zero lost updates.

### B15 --- Import

Measure representative STEP import, semantic wrapping and viewport
readiness.

### B16 --- Artifact Integrity

Verify 10,000 content-addressed artifact records and detect deliberate
corruption/missing objects.

### B17 --- Recovery

Restore a representative model/release from database + artifact backup
and verify hashes/manifests.

### B18 --- Reference Model Generality

Run D01, A01 and F01 through the same semantic -\> composition -\> PIR
-\> DAG architecture.

### B19 --- Scale Tiers

B1-S/B1-M/B1-L as defined above.

### B20 --- Worker Failure

Forced timeout/crash/cancel/stale-result cases; zero partial
publication.

------------------------------------------------------------------------

# 29A. v1.2 Build Phases

These phases integrate with and extend the existing G0--G15 plan. Do not
remove earlier checkpoints.

## G0A --- Build-Candidate Governance

### G0A.1 Requirements traceability

-   map every v1.0/v1.1/v1.2 requirement to module and checkpoint;
-   identify ownerless requirements.

### G0A.2 Dependency/licence register

-   OCCT;
-   mesher;
-   database;
-   rendering;
-   export/import libraries;
-   solver candidates.

### G0A.3 Determinism policy

-   D0--D3 classes;
-   canonical hashing;
-   tolerance/equivalence policy.

### G0A.4 Failure taxonomy

-   shared codes;
-   structured diagnostics.

**Gate:** no unresolved core dependency ownership, licence
classification or fabrication-critical determinism policy.

------------------------------------------------------------------------

## G3C --- Transactions, Concurrency and Undo

### G3C.1 DesignTransaction schema

### G3C.2 expected-head concurrency

### G3C.3 CandidateRevision

### G3C.4 atomic publication

### G3C.5 compensating-command undo/redo

### G3C.6 transaction UI status

**Gate:** injected compile failure cannot partially publish; stale
ChangeSet cannot overwrite newer head; undo/redo works across
representative semantic commands.

------------------------------------------------------------------------

## G3D --- Coordinate Frames and Assembly Core

### G3D.1 CoordinateFrame

### G3D.2 transform/units policy

### G3D.3 ComponentDefinition/Instance

### G3D.4 Mate/Joint/Interface

### G3D.5 assembly fixtures

**Gate:** A01 semantic assembly fixture works without
geometry-kernel-specific domain logic.

------------------------------------------------------------------------

## G6A --- Topological Naming Hardening

### G6A.1 persistent sub-element path model

### G6A.2 OCCT history adapter

### G6A.3 ambiguity diagnostics

### G6A.4 torture suite

### G6A.5 benchmark B12

**Gate:** zero silent wrong references in required torture suite.

------------------------------------------------------------------------

## G10B --- Import and Semanticisation

### G10B.1 import adapter contract

### G10B.2 STEP import

### G10B.3 source units/frames/hash

### G10B.4 semantic assertions

### G10B.5 imported selectors

### G10B.6 assembly placement

**Gate:** imported STEP participates as a semantically wrapped reference
asset without false native-parametric claims.

------------------------------------------------------------------------

## G12A --- Artifact Store and Releases

### G12A.1 content-addressed artifact model

### G12A.2 object-store adapter

### G12A.3 integrity verification

### G12A.4 reproducibility manifest

### G12A.5 DesignRelease

### G12A.6 backup/restore proof

### G12A.7 retention/GC dry run

**Gate:** a fabrication release can be restored and all required
artifact/manifests verified by hash.

------------------------------------------------------------------------

## G14A --- Cross-Domain Reference Models

### G14A.1 D01 full reference

### G14A.2 A01 assembly reference

### G14A.3 F01 freeform reference

### G14A.4 architecture exception audit

**Gate:** no reference model requires bypassing
semantic/PIR/DAG/operator boundaries.

------------------------------------------------------------------------

## G14B --- Scale and Failure Hardening

### G14B.1 B1-S

### G14B.2 B1-M

### G14B.3 B1-L

### G14B.4 worker isolation/cancellation

### G14B.5 forced failure suite

### G14B.6 adversarial composition suite

**Gate:** system remains bounded and diagnosable at scale and under
worker/composition failure.

------------------------------------------------------------------------

# 30A. v1.2 Expanded Definition of Complete

SPDS V1.2 is complete only when **all v1.0, v1.1 and the following v1.2
gates** pass:

34. Mutations use atomic `DesignTransaction` semantics.
35. Candidate geometry cannot partially replace the published design.
36. Optimistic concurrency prevents stale user/AI writes from silently
    winning.
37. Transaction-level undo/redo is operational.
38. Topological naming torture suite records zero silent wrong-reference
    outcomes.
39. STEP can be imported as exact/reference geometry with source
    provenance, units and semantic wrapping.
40. Coordinate frames are explicit across
    world/project/assembly/component/import boundaries.
41. Fabrication releases bind to reproducibility manifests.
42. External computational dependencies have recorded
    licence/distribution governance and replaceable adapter boundaries
    where required.
43. Large derived artifacts are immutable/content-addressed and
    integrity-verifiable.
44. Backup/restore can reconstruct and verify a representative released
    design.
45. Sketch/geometric constraint schema and solver adapter contract exist
    without false claims of solver capability.
46. Assembly definitions, instances, mates, interfaces and physical
    connections are semantically distinct.
47. D01, A01 and F01 all compile through the same architectural layers.
48. B1-S, B1-M and B1-L scale tests are recorded.
49. Composition cycle/conflict tests fail safely and diagnostically.
50. Geometry/meshing workers support timeout, cancellation and
    stale-result rejection.
51. Determinism class is declared for every fabrication-critical derived
    output.
52. Failure taxonomy is used consistently across
    semantic/compiler/worker/UI boundaries.
53. Executable extension packages cannot bypass declared
    security/capability boundaries.
54. A `DesignRelease` binds snapshot, publication manifest,
    reproducibility manifest, validation and immutable artifacts.
55. UI clearly distinguishes candidate, validated and published/released
    state.
56. No known architecture shortcut makes the semantic graph, composition
    engine, PIR or execution DAG optional for any reference model.

------------------------------------------------------------------------

# 42A. Build Freeze Instruction

SPDS v1.2 is the **Build Candidate**.

Do not expand V1 with additional major product capabilities unless an
executable spike proves a blocking architectural defect.

The next step is implementation evidence, not further speculative
breadth.

Before coding beyond G0/G0A, Grok 4.5 must return:

1.  requirements traceability matrix covering v1.0 + v1.1 + v1.2;
2.  repository/module dependency diagram;
3.  technology decision records;
4.  dependency/licence register;
5.  persistent naming strategy and risk register;
6.  PIR schema outline;
7.  transaction/publication state machine;
8.  coordinate-frame/unit policy;
9.  artifact/release architecture;
10. D01/A01/F01 fixture definitions;
11. exact G0.1/G0A implementation plan;
12. list of unresolved decisions that truly block G0.

Then stop for review.

The system must continue to obey the central rule:

> **The authoritative design is the semantic parametric model and its
> versioned intent. Composition resolves that intent; PIR and the
> execution DAG make it executable; deterministic engines derive exact
> representations; validation and publication gates decide what is
> allowed to become a released physical design.**

# 6. Repository / Module Architecture

Recommended monorepo:

``` text
apps/
  designer-web/                 React UI
  api/                          semantic API / orchestration

packages/
  semantic-core/                language types + schemas
  semantic-commands/            CRUD/commands/events
  semantic-query/               query/filter/traverse/trace/EXPLAIN
  selectors/                    semantic + persistent sub-element selectors
  composition-core/             references/specialisation/layers/variants
  parametric-ir/                typed kernel-neutral executable IR
  execution-dag/                scheduling/invalidation/cache/provenance DAG
  topology-provenance/          persistent naming + generated/modified/split lineage
  dependency-graph/             dependency evaluation/invalidation
  pattern-engine/               pattern definitions/composition
  operator-core/                operator contracts/registry
  topology-operators/           graph/geodesic/Goldberg operators
  geometry-contracts/           kernel-neutral geometry DTOs
  geometry-client/              calls geometry service
  fabrication-core/             parts/connections/BOM/cut lists
  dimension-core/               semantic dimensions
  analysis-core/                solver-neutral analysis model
  representation-core/          derived representation metadata
  product-definition/           design/product/geometric topology mappings + PMI-ready semantics
  package-core/                 package manifests/dependencies/namespaces
  version-core/                 events/snapshots/branches
  validation-core/              semantic/geometry/fabrication gates
  ai-interface/                 constrained tools/schema descriptions
  shared-units/                 units, quantities, tolerances

services/
  geometry-occt/                OCCT-backed exact geometry service
  meshing-gmsh/                 analysis-mesh service / semantic physical groups
  analysis-worker/              later FEM adapter/worker

patterns/
  core/
  geometry/
  structural/
  fabrication/
  dome-reference/

fixtures/
  dome-d01/
  topology/
  fabrication/

docs/
  architecture/
  language/
  operators/
  patterns/
  ai/
```

No dome-specific imports are permitted inside generic packages except
reference fixtures/tests.

------------------------------------------------------------------------

# 7. Core Semantic Language

The initial first-class object types are:

``` text
Model
Entity
Parameter
Relationship
Primitive
Feature
Pattern
Constraint
Rule
Affector
Assembly
Material
Connection
Fastener
Representation
Analysis
Objective
Measurement
Dimension
Output
OperatorReference
Selector
Variant
VariantSet
Datum
Tolerance
GeometricTolerance
ManufacturingFeature
InspectionRequirement
PMIAnnotation
PackageReference
```

All objects implement a common envelope:

``` ts
interface SemanticObject {
  id: SemanticId;
  kind: SemanticKind;
  semanticType: string;
  name: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  schemaVersion: string;
}
```

## 7.1 Parameters

Parameters are first-class objects, not anonymous values.

``` yaml
id: param:y.member-wall-thickness
kind: Parameter
semanticType: geometry.thickness
name: Member wall thickness
quantity:
  value: 8
  unit: mm
domain:
  min: 4
  max: 20
role: design-variable
affects:
  - geometry
  - mass
  - stiffness
  - cost
editableBy:
  - user
  - agent
  - optimizer
```

Required parameter roles:

-   design-variable
-   derived
-   constraint-limit
-   fabrication-variable
-   analysis-variable
-   presentation-only

## 7.2 Relationships

Relationships are typed directed edges:

``` text
part-of
generated-from
connects-to
bounds
adjacent-to
affected-by
governed-by
represented-by
analysed-as
manufactured-as
requires
produces
depends-on
```

Relationship vocabulary must be extendable without a core migration for
every new relation.

## 7.3 Constraints

Example:

``` yaml
id: constraint:max-member-length
kind: Constraint
semanticType: fabrication.maximum-length
operator: less-than-or-equal
property: fabrication.memberLength
limit:
  value: 2400
  unit: mm
severity: hard
reason: Transport and fabrication constraint
```

Support hard, soft and advisory severity.

## 7.4 Rules

Rules are conditional semantic logic:

``` yaml
id: rule:perimeter-fixing-plate
when:
  all:
    - property: entity.semanticType
      equals: structural.y-component
    - property: entity.locationClass
      equals: perimeter
then:
  - action: apply-pattern
    pattern: pattern:fixing-plate
```

Rules must be declarative and validated. No arbitrary JavaScript in
persisted rules for v1.

## 7.5 Affectors

Affectors modify parameters, inclusion, topology or geometry based on a
field/region.

Required v1 affectors:

-   plane cut
-   box/volume exclusion
-   radial/distance field
-   directional field
-   scalar gradient

Example:

``` yaml
id: affector:world-cut-01
kind: Affector
semanticType: geometry.plane-cut
coordinateSpace: world
operation: subtract
target: assembly:dome-primary
preserveSemanticIdentity: true
```

## 7.6 Operations

Core command vocabulary:

``` text
CREATE
READ
UPDATE
DELETE
CONNECT
DISCONNECT
COMPOSE
SPECIALISE
FORK
APPLY
REMOVE
EVALUATE
VALIDATE
COMPILE
GENERATE
EXPORT
SNAPSHOT
RESTORE
COMPARE
```

`OPTIMISE` may be introduced as an experimental command after
deterministic evaluation is stable.

------------------------------------------------------------------------

# 8. Pattern System

Patterns encode reusable design strategies and must themselves be
semantic graphs.

Pattern schema must include:

``` yaml
id: pattern:cellular-shell
version: 1.0.0
name: Cellular Shell
intent:
  - create cellular organisation over a curved surface
applicableTo:
  - dome
  - freeform-surface
requires:
  - target-surface
parameters: []
inputs: []
outputs: []
constraints: []
rules: []
subpatterns: []
operatorBindings: []
representations: []
compatibleWith: []
conflictsWith: []
```

Patterns support:

-   instantiate;
-   edit definition;
-   fork;
-   version;
-   compose;
-   specialise;
-   deprecate;
-   discover by semantic metadata.

Required reference patterns:

1.  `SphericalCap`
2.  `GoldbergCellularTopology`
3.  `YJunctionNetwork`
4.  `VariableAperture`
5.  `StructuralThickening`
6.  `WorldSpaceCut`
7.  `BoundaryTermination`
8.  `BoltedPlateConnection`
9.  `PartFamilyClustering`
10. `FabricationRationalisation`

Patterns must expose their internal graph in the UI.

------------------------------------------------------------------------

# 9. Operator System

Patterns describe intent; operators implement deterministic mathematics.

Operator contract:

``` ts
interface Operator<I, O> {
  id: string;
  version: string;
  inputSchema: Schema<I>;
  outputSchema: Schema<O>;
  deterministic: boolean;
  execute(input: I, context: OperatorContext): Promise<O>;
}
```

Operator results include:

-   inputs hash;
-   operator version;
-   output hash;
-   warnings;
-   numerical tolerances used;
-   provenance.

Required operator families:

``` text
topology/
  icosahedron
  subdivision
  spherical-projection
  dual-graph
  adjacency
  junction-extraction

geometry/
  local-frame
  curve
  profile
  sweep
  loft
  offset
  shell
  boolean
  fillet
  chamfer
  section
  tessellate
  heal
  validate

fabrication/
  part-measurements
  similarity-signature
  family-clustering
  connection-placement
  fastener-selection

dimension/
  distance
  angle
  radius
  thickness
```

Operators may internally use complex mathematics. Their public contract
must remain typed and kernel-neutral.

------------------------------------------------------------------------

# 10. Reference Dome System Logic

The reference pipeline is mandatory:

``` text
Dome Parameters
      |
      v
Spherical Cap Definition
      |
      v
Geodesic / Goldberg Operator
      |
      v
Semantic Topology Graph
(vertices / edges / cells / adjacency)
      |
      v
Junction Extraction
      |
      v
Y Semantic Components + Stable IDs
      |
      v
Local Frames + Member Geometry
      |
      v
OCCT B-rep Realisation
      |
      v
Affectors
(cuts / gradients / exclusions)
      |
      v
Connection Patterns
(plates / bolts / holes / clearances)
      |
      v
Boolean Compilation
      |
      v
Healing + Validation
      |
      v
Fabrication Parts
      |
      +----------+-----------+----------+
      |          |           |          |
      v          v           v          v
     STEP       STL         GLB       Measurements
                                         |
                                         v
                              Rationalisation / Families
                                         |
                                         v
                                  BOM + Cut List
                                         |
                                         v
                                   Dimension Data
```

------------------------------------------------------------------------

# 11. Persistent Identity Strategy

Never use generated face/edge indices as semantic identity.

IDs derive from semantic provenance where possible:

``` text
model:dome-01
cell:h:0017
cell:p:0003
vertex:0102
edge:0031
junction:0042
component:y:0042
connection:0083
fastener:connection-0083:bolt-01
```

A generated representation records:

``` yaml
representationId: brep:component:y:0042:v147
semanticOwner: component:y:0042
sourceSnapshot: snapshot:v147
compilerVersion: geometry-compiler@1.3.0
```

After a Boolean cut, semantic identity remains `component:y:0042`; the
fabricated representation is a derived representation/version.

------------------------------------------------------------------------

# 12. Geometry Kernel

Use OpenCascade/OCCT as the v1 exact geometry kernel.

The semantic/core packages must not import OCCT directly. Only
`services/geometry-occt` may depend on OCCT-specific APIs.

Required geometry service capabilities:

-   primitives;
-   curves/profiles;
-   sweeps/lofts;
-   offsets/shelling;
-   Boolean union/subtract/intersect;
-   fillet/chamfer where robust;
-   section/intersection;
-   topology traversal;
-   tessellation;
-   mass properties;
-   geometry healing;
-   validity checking;
-   STEP export;
-   STL export.

Geometry service must return structured errors rather than crash on
failed operations.

Example:

``` json
{
  "status": "failed",
  "code": "SHELL_SELF_INTERSECTION",
  "semanticOwner": "component:y:0042",
  "operator": "shell",
  "details": {},
  "recoverable": true
}
```

------------------------------------------------------------------------

# 13. Geometry Validation Pipeline

Every final part passes:

``` text
Generated
   -> Booleaned
   -> Healed
   -> Validated
   -> Fabrication checked
```

Required checks:

-   valid B-rep;
-   closed solid when expected;
-   positive volume;
-   correct shell orientation;
-   no non-manifold conditions;
-   no invalid/self-intersecting faces where detectable;
-   tolerance policy satisfied;
-   minimum feature size policy;
-   duplicate/coincident component detection;
-   export round-trip smoke test for reference fixtures.

States:

``` text
semantic-valid
geometry-generated
geometry-valid
fabrication-valid
fabrication-ready
failed
```

Never label a failed/healed-with-unknown-quality part as
fabrication-ready.

------------------------------------------------------------------------

# 14. Connections and Fasteners

Connections are first-class semantic assemblies.

Example:

``` text
connection:0083
  connects component:y:0042
  connects component:y:0061
  applies pattern:bolted-plate-connection
```

The pattern may generate:

-   plates;
-   holes;
-   bolts;
-   nuts;
-   washers;
-   clearances;
-   edge-distance constraints.

Holes must be derived from connection/fastener requirements so deleting
or changing a connection updates/removes its holes.

Fastener library schema:

``` text
standard
size
length
thread
head
material
grade
clearance-hole
washer
nut
mass
cost(optional)
supplier(optional)
```

Seed v1 with a small generic ISO-style fixture dataset clearly marked as
demonstration data, not authoritative engineering specification data.

------------------------------------------------------------------------

# 15. Fabrication System

Fabrication compiler derives:

-   individual part records;
-   dimensions;
-   cut angles;
-   material;
-   volume/mass;
-   quantity;
-   connection references;
-   manufacturing notes;
-   family/similarity classification;
-   export references.

Example part record:

``` yaml
id: component:y:0042
partNumber: Y-042
material: aluminium-6061
arms:
  - id: A
    length: 1478.4 mm
    endAngle: 17.42 deg
  - id: B
    length: 1521.7 mm
    endAngle: 19.06 deg
  - id: C
    length: 1456.9 mm
    endAngle: 16.83 deg
mass: 8.42 kg
family: Y-F07
fabricationState: fabrication-ready
```

## 15.1 Part family rationalisation

Provide similarity signatures based on configurable
dimensions/angles/topology.

Support:

-   exact grouping;
-   tolerance-based grouping;
-   target maximum family count;
-   report deviation introduced by rationalisation.

Never silently alter exact design geometry to meet a family target.
Proposed rationalisation is a branch/change set requiring explicit
application.

------------------------------------------------------------------------

# 16. Dimensioning

Dimensions are semantic references, not manually positioned lines as the
source of truth.

Dimension object references semantic anchors:

``` yaml
id: dim:y042-arm-a
kind: Dimension
type: linear
from: component:y:0042/arm:A/start
to: component:y:0042/arm:A/end
unit: mm
precision: 1
```

The UI may derive visual dimension placement. Fabrication outputs may
later derive drawing layouts.

Required v1 dimensions:

-   linear distance;
-   member length;
-   angle;
-   radius/diameter;
-   thickness;
-   aperture width;
-   component bounding dimensions.

------------------------------------------------------------------------

# 17. Representations

One semantic entity may have multiple representations:

``` text
Semantic Y Component
  |- exact B-rep
  |- render mesh
  |- fabrication part
  |- structural beam abstraction
  |- dimension set
```

Representation records must include owner, version, source snapshot,
compiler version, status and artifact location/hash.

Three.js meshes are disposable render representations.

------------------------------------------------------------------------

# 18. Analysis / FEM Boundary

Design v1 so FEM is supported architecturally, but do not block the
fabrication MVP on a full FEM implementation.

`analysis-core` defines solver-neutral concepts:

-   node;
-   beam;
-   shell;
-   solid;
-   material properties;
-   section properties;
-   support;
-   load;
-   load case;
-   result field.

Initial dome analysis representation should be a beam network derived
from semantic Y/junction topology.

Later adapter candidates: CalculiX or Code_Aster.

Never claim engineering certification. Results must be labelled
computational/indicative until independently verified.

------------------------------------------------------------------------

# 19. Database

Use PostgreSQL.

Recommended logical tables:

``` text
projects
models
semantic_objects
relationships
parameters
pattern_definitions
pattern_instances
commands
change_events
snapshots
branches
representations
artifacts
validation_results
operator_runs
jobs
selectors
variant_sets
variant_selections
composition_layers
pir_programs
pir_operations
execution_runs
topology_provenance
product_parts
product_mappings
pmi_objects
package_manifests
semantic_lineage
analysis_meshes
jobs
```

Use relational columns for identity, ownership, versioning and
frequently queried fields; use JSONB for extensible typed payloads
validated at the application boundary.

## 19.1 Minimum semantic object columns

``` text
id UUID PK
semantic_id TEXT
model_id UUID
kind TEXT
semantic_type TEXT
schema_version TEXT
payload JSONB
created_at
updated_at
deleted_at nullable
```

Unique constraint: `(model_id, semantic_id)` for live objects.

## 19.2 Events

Every accepted mutating command creates an immutable change event
containing:

-   event ID;
-   model/branch;
-   actor type/user/agent;
-   command;
-   target IDs;
-   before hash;
-   after hash;
-   timestamp;
-   reason/description if supplied;
-   correlation ID;
-   resulting invalidation set.

------------------------------------------------------------------------

# 20. CRUD + Command API

Expose conventional CRUD for basic objects plus semantic commands for
complex mutations.

Example endpoints conceptually:

``` text
GET    /models/:id/objects
GET    /models/:id/objects/:semanticId
POST   /models/:id/objects
PATCH  /models/:id/objects/:semanticId
DELETE /models/:id/objects/:semanticId

POST /models/:id/commands/apply-pattern
POST /models/:id/commands/connect
POST /models/:id/commands/fork-pattern
POST /models/:id/commands/compile
POST /models/:id/commands/validate
POST /models/:id/commands/snapshot
POST /models/:id/commands/restore
POST /models/:id/commands/compare
POST /models/:id/query
POST /models/:id/explain
POST /models/:id/trace
POST /models/:id/commands/set-variant
POST /models/:id/commands/compose
POST /models/:id/commands/compile-pir
POST /models/:id/commands/what-if
```

All mutations:

1.  validate schema;
2.  validate semantic invariants;
3.  calculate affected dependency set;
4.  persist event;
5.  update materialized semantic state transactionally;
6.  enqueue required recompilation;
7.  expose job/progress state.

------------------------------------------------------------------------

# 21. Versioning, Snapshots and Branches

Users must be able to see and return to earlier design states.

Support:

``` text
v143 -> v144 -> v145 -> v146 -> v147
                    \
                     experiment-A -> A2 -> A3
```

Required functionality:

-   named snapshots;
-   automatic checkpoint snapshots at significant compile/export
    milestones;
-   branches;
-   restore by creating a new head from an old snapshot rather than
    destroying history;
-   compare snapshots;
-   show parameter/object changes;
-   show added/removed objects;
-   show geometry/fabrication metrics deltas where available.

UI example:

``` text
v147 Current
Diameter 22.0 m
Parts 312
Families 18
Mass 4.82 t

vs

v143
Diameter 20.0 m
Parts 284
Families 16
Mass 4.37 t
```

Never implement destructive history rewriting as the normal restore
workflow.

------------------------------------------------------------------------

# 22. AI Interface

The AI interface is a constrained semantic tool surface.

AI capabilities:

-   query object/schema/pattern/operator catalogs;
-   inspect model hierarchy and dependencies;
-   search objects semantically;
-   read parameter domains and constraints;
-   propose change sets;
-   create/update/delete semantic objects through validated commands;
-   instantiate/fork/compose patterns;
-   create branches;
-   request compilation/validation;
-   compare snapshots;
-   inspect failures;
-   request exports;
-   register a new pattern definition when it satisfies
    schema/validation.

The AI must not normally:

-   execute arbitrary SQL;
-   mutate generated B-reps directly;
-   mutate Three.js objects as design state;
-   bypass parameter domains/constraints;
-   mark geometry fabrication-ready;
-   execute arbitrary persisted code.

## 22.1 Change-set workflow

Preferred AI mutation protocol:

``` text
User intent
   -> AI reads relevant semantic context
   -> AI constructs proposed ChangeSet
   -> validate ChangeSet
   -> show impact summary
   -> apply to branch/model
   -> compile
   -> validate
   -> return results + warnings
```

Example AI request:

> Add a 75 mm internal flange to Y components adjacent to pentagonal
> cells.

AI should express this as semantic pattern/rule mutations, not direct
OCCT code.

## 22.2 Schema augmentation

AI may propose new semantic types/patterns. New definitions require:

-   unique namespace;
-   schema;
-   description/intent;
-   typed parameters;
-   compatibility metadata;
-   validation;
-   version;
-   tests/fixture for executable operator bindings.

------------------------------------------------------------------------

# 23. UI Architecture

The UI must make the system understandable, not hide it behind a
conventional CAD viewport.

Recommended desktop layout:

``` text
+-----------------------------------------------------------+
| Project | Branch | Snapshot | Compile | Validate | Export |
+-------------+-----------------------------+---------------+
|             |                             |               |
| MODEL /     |                             | INSPECTOR     |
| PIPELINE    |       3D VIEWPORT           |               |
|             |                             | parameters    |
| hierarchy   |                             | semantics     |
| patterns    |                             | constraints   |
| logic       |                             | dependencies  |
|             |                             | fabrication   |
+-------------+-----------------------------+---------------+
| HISTORY / JOBS / VALIDATION / AI CHANGES                  |
+-----------------------------------------------------------+
```

Responsive/mobile UI may collapse these panels into tabs/drawers.

## 23.1 UI views

Required v1 views:

1.  **Design View** --- viewport + parameters.
2.  **Model Explorer** --- semantic hierarchy and search.
3.  **Pipeline View** --- visible compilation pipeline and state.
4.  **Pattern View** --- inspect pattern
    inputs/subpatterns/operators/outputs.
5.  **Dependency View** --- selected object's upstream/downstream
    dependencies.
6.  **Fabrication View** --- parts, families, dimensions, readiness.
7.  **History View** --- snapshots/branches/compare/restore.
8.  **Validation View** --- semantic/geometry/fabrication failures.
9.  **AI Changes View** --- proposed/applied semantic change sets.
10. **PIR / Execution View** --- resolved operations, dependencies,
    cache and timings.
11. **Lineage / Why View** --- causal trace from selected result back to
    semantic intent.
12. **Variants View** --- intentional alternatives independent of
    history.
13. **What-If View** --- branch-based impact preview and exact
    comparison.
14. **Product Definition View** --- design/product/geometric topology
    mappings and PMI-ready data.
15. **Analysis Mesh View** --- semantic groups and Gmsh mesh
    quality/provenance.

## 23.2 Pipeline UI

Example:

``` text
[Parameters] ✓
     |
[Goldberg topology] ✓  18 ms
     |
[Y network] ✓           6 ms
     |
[B-rep generation] ✓  820 ms
     |
[World cut] ✓          230 ms
     |
[Connections] ! 2 warnings
     |
[Healing] ✓
     |
[Fabrication validation] X 1 failed part
```

Selecting a stage reveals inputs, outputs, operator version, timing,
warnings and affected semantic IDs.

## 23.3 Viewport requirements

-   orbit/pan/zoom;
-   selection/picking;
-   hover highlight;
-   semantic selection by component/cell/junction/connection;
-   isolate/hide;
-   section/cut visualization;
-   measurement tool;
-   semantic dimension overlays;
-   component IDs;
-   color by type/family/validation state;
-   optional topology overlay;
-   optional FEM representation later.

## 23.4 Fast preview vs exact regeneration

For expensive parameter interaction:

``` text
slider drag -> lightweight preview / throttled render
release     -> exact semantic compile -> OCCT -> replacement mesh
```

UI must indicate `Preview` versus `Exact/Validated` state.

------------------------------------------------------------------------

# 24. UI Goal Benchmarks

On reference development hardware, target:

-   initial application interactive: \<= 3 s after assets available;
-   semantic parameter update reflected in UI state: \<= 100 ms;
-   simple dependency invalidation calculation: \<= 50 ms for 10k
    semantic objects;
-   viewport interaction: target 60 fps desktop, \>= 30 fps supported
    mobile/tablet for reference model;
-   selection highlight: \<= 100 ms perceived response;
-   pipeline status visible during long operations;
-   no UI freeze \> 250 ms from geometry work; expensive work occurs off
    main UI thread/service;
-   history snapshot navigation metadata: \<= 300 ms for typical
    project;
-   semantic search/filter of 10k objects: \<= 200 ms local/API target;
-   clear visible distinction between valid, warning, failed, preview
    and stale representations.

Benchmarks are targets, not reasons to corrupt geometry accuracy.

------------------------------------------------------------------------

# 25. Reference Model D01

Use a deterministic fixture throughout development.

``` text
Model: D01
Dome diameter:       20,000 mm
Dome rise:            6,500 mm
Structural depth:       250 mm
Base aperture ratio:      25 %
Topology:             Goldberg/geodesic dual producing hex/pent cells
Y components:         one semantic Y per valid 3-valent junction
World cut:            configurable fixed world-space plane
```

Exact expected cell/member counts depend on selected documented geodesic
frequency. Once G3 chooses the reference frequency, freeze expected
topology counts in fixtures.

Required D01 assertions after counts are frozen:

-   deterministic topology count;
-   deterministic semantic IDs;
-   expected pentagon count for chosen closed-parent topology before
    dome trimming;
-   valid adjacency;
-   no duplicate semantic IDs;
-   valid local frame at every retained Y junction;
-   generated parts have positive dimensions;
-   no unexpected duplicate/coincident parts;
-   world cut remains world-fixed while dome transform changes;
-   semantic IDs of unaffected components persist after parameter
    changes;
-   valid B-reps for all fabrication-ready components;
-   STL watertight for fabrication-ready reference parts;
-   STEP export smoke test;
-   round-trip import/export smoke test where practical.

------------------------------------------------------------------------

# 26. Testing Strategy

## 26.1 Unit tests

Every generic package requires unit tests.

## 26.2 Schema tests

-   valid examples accepted;
-   invalid units rejected;
-   invalid object kinds rejected;
-   missing IDs rejected;
-   unknown extension fields handled according to version policy.

## 26.3 Property-based tests

Use where valuable for:

-   graph acyclicity rules;
-   unit conversion;
-   ID stability;
-   topology adjacency invariants;
-   command/event replay.

## 26.4 Topology tests

-   adjacency symmetric where required;
-   edge incidence valid;
-   cell loops closed;
-   junction valence correct;
-   no orphan topology unless explicitly boundary-classified.

## 26.5 Geometry tests

-   valid B-rep;
-   volume \> 0;
-   shell/offset within expected tolerance;
-   Boolean result valid;
-   healing does not silently remove semantically required features;
-   tessellation bounded deviation from exact geometry.

## 26.6 Persistence tests

-   event replay reconstructs semantic state;
-   snapshot restore reproduces state hash;
-   branch isolation;
-   compare reports expected changes;
-   transaction rollback on invalid mutation.

## 26.7 AI interface tests

-   cannot bypass validation;
-   cannot directly modify generated representations;
-   proposed changes show impact;
-   invalid pattern definition rejected;
-   agent-created branch does not alter source branch.

## 26.8 UI tests

-   parameter edit;
-   selection synchronises viewport/explorer/inspector;
-   pipeline errors navigable to affected object;
-   history restore creates new head;
-   preview/exact status visible;
-   fabrication state visible.

## 26.9 Golden fixtures

Store canonical semantic snapshots and expected hashes/metrics. Do not
use fragile pixel-perfect geometry screenshots as the only regression
mechanism.

------------------------------------------------------------------------

# 27. Performance Benchmarks

Create automated benchmark suite.

Benchmark cases:

### B1 --- semantic graph

10,000 objects / 30,000 relationships.

Measure load, query, invalidation, serialization.

### B2 --- topology generation

Reference geodesic frequencies low/medium/high.

Measure topology generation and ID assignment.

### B3 --- Y geometry

Generate 10, 100, 500 exact Y components.

Measure OCCT generation, tessellation and validation.

### B4 --- Booleans

World cut across 100+ components.

Measure affected-set calculation versus geometry operation time.

### B5 --- history

1,000 events + snapshots every N events.

Measure replay and restore.

### B6 --- viewport

Reference mesh at multiple triangle counts.

Measure FPS and picking latency.

### B7 --- PIR / execution DAG

Compile a 10,000-object semantic graph into PIR and an execution DAG.
Measure resolution, hashing, scheduling and incremental invalidation.

### B8 --- persistent naming

Run controlled upstream edits across reference parts. Measure selector
survival, unambiguous remapping and unresolved-reference reporting.

### B9 --- semantic query / EXPLAIN

Run representative FILTER/TRAVERSE/TRACE/EXPLAIN queries over 10,000
objects / 30,000 relationships. Measure latency and verify deterministic
lineage.

### B10 --- composition / variants

Resolve layered pattern specialisation plus project and experiment
overrides. Verify deterministic effective state and snapshot
reproducibility.

### B11 --- analysis mesh

Generate the reference Gmsh proof mesh and semantic physical groups.
Record mesh time, element count, quality metrics and semantic mapping
completeness.

Record benchmark environment and compiler versions.

------------------------------------------------------------------------

# 28. Build Phases for Grok 4.5

Work strictly in checkpoints. Each checkpoint must be independently
reviewable and commit-sized. Do not proceed after a failed acceptance
gate.

For every checkpoint Grok must:

1.  inspect existing code first;
2.  state intended files/modules;
3.  implement only checkpoint scope;
4.  add/update tests;
5.  run formatting/lint/typecheck/tests/build relevant to scope;
6.  report exact commands/results;
7.  show changed files and architectural impact;
8.  stop for review at checkpoint boundary when being used
    interactively.

## Phase G0 --- Foundation and architecture

### G0.1 Monorepo skeleton

-   create package/service/app boundaries;
-   configure TypeScript, lint, formatting, tests;
-   Docker Compose with PostgreSQL;
-   CI baseline.

**Gate:** clean install, lint, typecheck, unit test and build.

### G0.2 Architecture contracts

-   dependency boundary tests;
-   ADRs for semantic-source-of-truth, OCCT adapter, representations and
    event history;
-   unit/quantity package.

**Gate:** no generic package imports dome application code or OCCT.

------------------------------------------------------------------------

## Phase G1 --- Semantic language

### G1.1 Core envelope and IDs

-   SemanticObject;
-   typed semantic IDs;
-   kind registry;
-   schema versions.

### G1.2 Parameter language

-   quantities/units;
-   domains;
-   roles;
-   derived parameter contract.

### G1.3 Relationships and graph

-   typed relationship edges;
-   graph queries;
-   upstream/downstream traversal.

### G1.4 Constraints, rules, affectors

-   declarative schemas;
-   validation only, no arbitrary code.

**Gate:** complete fixture model can be represented/validated without
geometry.

------------------------------------------------------------------------

## Phase G2 --- Persistence, CRUD and history

### G2.1 PostgreSQL schema

-   migrations;
-   repositories;
-   transactions.

### G2.2 CRUD API

-   objects;
-   parameters;
-   relationships;
-   validation.

### G2.3 Command/event layer

-   immutable change events;
-   correlation IDs;
-   actor metadata;
-   invalidation set.

### G2.4 Snapshots

-   state hashing;
-   materialized snapshots;
-   replay tests.

### G2.5 Branches/restore/compare

-   non-destructive restore;
-   branch heads;
-   semantic diff.

**Gate:** create model -\> mutate -\> snapshot -\> branch -\> mutate -\>
restore -\> replay produces expected hashes.

------------------------------------------------------------------------

## Phase G3 --- Pattern and operator framework

### G3.1 Pattern definitions

-   schema;
-   registry;
-   versioning;
-   instantiate/fork/compose.

### G3.2 Operator contracts

-   typed input/output;
-   version/provenance;
-   registry.

### G3.3 Dependency evaluation

-   invalidation;
-   stale representation marking;
-   job plan generation.

**Gate:** mock operators can compile a semantic pattern graph
deterministically.

------------------------------------------------------------------------

## Phase G3A --- Composition, selectors, PIR and execution DAG

### G3A.1 Selector language

-   semantic query selectors;
-   sub-element selectors;
-   capability selectors;
-   selector validation and resolution diagnostics.

### G3A.2 Composition engine

-   references;
-   specialisation;
-   layered overrides;
-   deterministic effective-state resolution.

### G3A.3 Variants

-   variant sets/selections;
-   snapshot provenance;
-   semantic compare between alternatives.

### G3A.4 Parametric IR

-   typed IR schema;
-   serialization/hash;
-   semantic provenance;
-   mock compiler from resolved pattern graph.

### G3A.5 Execution DAG

-   operation dependency graph;
-   invalidation;
-   scheduling plan;
-   cache keys;
-   execution state.

**Gate:** a semantic fixture with patterns, overrides and variants
resolves deterministically into inspectable PIR and a reproducible
execution DAG.

------------------------------------------------------------------------

## Phase G3B --- Persistent naming, topology provenance and semantic query

### G3B.1 Three topology domains

-   design topology schema;
-   product topology schema;
-   geometric topology mapping contracts.

### G3B.2 Topological provenance

-   generated/modified/split/merged/trimmed/deleted lineage records;
-   semantic anchor mapping contract.

### G3B.3 Persistent sub-element references

-   semantic paths;
-   selector survival across controlled regeneration;
-   unresolved ambiguity state.

### G3B.4 Semantic query API

-   QUERY/FILTER/TRAVERSE/AGGREGATE;
-   indexed semantic search.

### G3B.5 TRACE / EXPLAIN

-   deterministic causal lineage;
-   impact/invalidation explanation.

**Gate:** reference selectors survive approved upstream edits where
identity remains meaningful; ambiguous cases fail visibly; `EXPLAIN` can
trace a derived fixture object to its generating semantic causes.

------------------------------------------------------------------------

## Phase G4 --- Reference geodesic topology

### G4.1 Icosahedron operator

-   deterministic vertex/face indexing.

### G4.2 Subdivision + spherical projection

-   documented geodesic class/frequency.

### G4.3 Dual graph / Goldberg cells

-   derive pentagon/hexagon topology.

### G4.4 Dome trimming classification

-   retained/boundary/excluded topology without detailed B-rep Booleans.

### G4.5 Stable semantic IDs

-   cells, vertices, edges, junctions.

**Gate:** topology invariants and frozen D01 counts pass
deterministically.

------------------------------------------------------------------------

## Phase G5 --- Y semantic network

### G5.1 Junction extraction

-   identify valid 3-valent junctions.

### G5.2 Local frames

-   robust local normal/tangent basis;
-   degeneracy detection.

### G5.3 Y component semantics

-   arms reference topology edges/cells;
-   persistent IDs;
-   semantic measurements.

### G5.4 Parameterized Y profile contract

-   structural depth;
-   arm width;
-   wall/profile parameters;
-   aperture relationship.

**Gate:** Y network exists and is inspectable without Three.js or OCCT.

------------------------------------------------------------------------

## Phase G6 --- OCCT geometry service

### G6.1 Service skeleton

-   process/container boundary;
-   health/version endpoint;
-   typed DTOs.

### G6.2 Basic exact operations

-   primitives;
-   profiles;
-   sweep/loft;
-   tessellation;
-   mass properties.

### G6.3 Y B-rep generation

-   compile one Y;
-   then fixture set;
-   validation.

### G6.4 Shell/offset

-   explicit failure handling;
-   tolerance policy.

**Gate:** reference Y parts produce valid exact B-reps and meshes.

------------------------------------------------------------------------

## Phase G7 --- Affectors and robust final geometry

### G7.1 World-space plane cut

-   affector remains world-fixed;
-   dome transform independent.

### G7.2 Volume exclusion

-   box/simple solid cutter.

### G7.3 Scalar/radial parameter affector

-   modify aperture or depth by field.

### G7.4 Boolean compilation

-   only affected components recomputed where possible.

### G7.5 Healing + validation pipeline

-   structured diagnostics;
-   fabrication readiness state.

**Gate:** D01 can be cut while retaining semantic identities and
producing valid surviving parts.

------------------------------------------------------------------------

## Phase G8 --- Three.js UI / viewport

### G8.1 Application shell

-   responsive panel architecture;
-   project/model/branch context.

### G8.2 Viewport

-   render derived GLB/buffer geometry;
-   camera/navigation;
-   picking.

### G8.3 Semantic synchronization

-   selecting mesh selects semantic object;
-   explorer/inspector synchronize.

### G8.4 Parameter editing

-   typed units/domains;
-   preview/exact state.

### G8.5 Measurement overlays

-   vertex-to-vertex tool;
-   semantic measurements.

**Gate:** user edits D01 parameters and exact regeneration replaces
preview without losing identity/selection where object survives.

------------------------------------------------------------------------

## Phase G9 --- Pipeline, pattern and dependency UI

### G9.1 Pipeline view

-   stages;
-   status;
-   timing;
-   errors/warnings.

### G9.2 Pattern inspector

-   pattern graph;
-   parameters;
-   subpatterns;
-   operator bindings.

### G9.3 Dependency explorer

-   upstream/downstream graph for selection.

### G9.4 Validation navigator

-   click failure -\> affected semantic object and geometry.

**Gate:** user can understand why a selected Y exists, what generated it
and which downstream outputs it affects.

------------------------------------------------------------------------

## Phase G10 --- Fabrication outputs

### G10.1 Part measurements

-   lengths;
-   angles;
-   bounding dimensions;
-   volume/mass.

### G10.2 STEP/STL/GLB export

-   artifact metadata/provenance.

### G10.3 BOM and cut list

-   CSV/JSON initially;
-   semantic IDs and quantities.

### G10.4 Dimension objects

-   semantic anchors;
-   viewport display.

### G10.5 Part family clustering

-   exact and tolerance-based;
-   report-only first.

**Gate:** D01 produces traceable fabrication artifacts from a snapshot.

------------------------------------------------------------------------

## Phase G10A --- Product definition, PMI readiness and analysis mesh proof

### G10A.1 Product topology

-   assembly/part/subpart mappings;
-   design-to-product provenance.

### G10A.2 PMI-ready semantic objects

-   datum;
-   tolerance;
-   manufacturing feature;
-   inspection requirement;
-   persistent selector attachment.

### G10A.3 AP242-capable export investigation

-   verify selected OCCT binding/export capabilities;
-   export what is supported;
-   preserve/report unsupported semantic PMI without data loss.

### G10A.4 Gmsh service

-   container/service contract;
-   geometry import/transfer;
-   deterministic meshing settings.

### G10A.5 Semantic physical groups

-   material/support/load/group mapping;
-   mesh artifact provenance;
-   mesh quality metrics.

**Gate:** a reference part/assembly has traceable product topology and
PMI-ready data, and a solver-neutral semantic analysis fixture produces
a Gmsh mesh with correct semantic groups.

------------------------------------------------------------------------

## Phase G11 --- Connections and fasteners

### G11.1 Connection semantics

-   typed connection entities.

### G11.2 Bolted plate pattern

-   plates and hole requirements.

### G11.3 Fastener library

-   seed data;
-   bolt/nut/washer entities.

### G11.4 Derived Boolean holes

-   connection removal/change regenerates holes.

### G11.5 Connection validation

-   edge distance/clearance hooks;
-   geometric interference checks where feasible.

**Gate:** connection modification updates dependent geometry and BOM
deterministically.

------------------------------------------------------------------------

## Phase G12 --- History UX

### G12.1 Timeline

-   events and snapshots.

### G12.2 Named snapshots

-   user names/notes.

### G12.3 Compare

-   semantic and metric deltas.

### G12.4 Restore/fork UI

-   restore creates new branch/head.

**Gate:** user can visually return to any saved design point without
destroying later history.

------------------------------------------------------------------------

## Phase G13 --- AI semantic interface

### G13.1 Read tools

-   model summary;
-   object lookup;
-   search;
-   schema/pattern/operator discovery;
-   dependency inspection.

### G13.2 ChangeSet schema

-   proposed mutations;
-   impact preview.

### G13.3 Mutation tools

-   validated CRUD;
-   apply pattern;
-   fork pattern;
-   create branch.

### G13.4 Compile/validate/compare tools

-   asynchronous job results.

### G13.5 AI changes UI

-   proposed/applied/rejected changes;
-   provenance.

**Gate:** scripted agent fixture can safely add a pattern parameter/rule
on a branch, compile it, inspect failures and compare against source.

------------------------------------------------------------------------

## Phase G13A --- AI closed-loop execution and repair

### G13A.1 Deterministic feedback packet

-   exact measurements;
-   semantic/geometry/fabrication constraint results;
-   structured failures;
-   lineage links.

### G13A.2 Bounded repair protocol

-   maximum attempt count;
-   each attempt as ChangeSet;
-   no silent constraint/tolerance relaxation;
-   branch isolation.

### G13A.3 Why / What-If tools

-   explain selected object;
-   create temporary what-if branch;
-   compare semantic and quantitative deltas.

### G13A.4 AI audit

-   prompts/intents where retained by policy;
-   tool calls/change sets;
-   compiler results;
-   repair attempts;
-   final disposition.

**Gate:** scripted agent fixture proposes a change, encounters a
recoverable deterministic failure, repairs it within the configured
bound, recompiles, validates and reports the complete lineage without
bypassing hard constraints.

------------------------------------------------------------------------

## Phase G14 --- Extensibility proof

Do not add a second full application. Add a small non-dome fixture,
e.g. parametric stair or planar space-frame, using the same language.

### G14.1 New semantic types via extension namespace

### G14.2 New pattern

### G14.3 Existing operators reused

### G14.4 UI renders/explores it without dome-specific code changes

**Gate:** proves platform is not secretly hard-coded to the dome.

------------------------------------------------------------------------

## Phase G15 --- FEM solver preparation (post-v1 solver boundary)

### G15.1 Solver-neutral analysis schema

### G15.2 Beam abstraction from Y network

### G15.3 Loads/supports/materials

### G15.4 Export adapter fixture

### G15.5 Results import schema and viewport mapping mock

Only integrate a real solver after these contracts and verification
fixtures are reviewed.

------------------------------------------------------------------------

# 29. Checkpoint Size Rule for Grok

Grok should not combine large subphases merely because they appear
straightforward.

A checkpoint should generally contain:

-   one architectural concept;
-   \<= roughly 5--15 cohesive files unless generated code/migrations
    require more;
-   tests in the same checkpoint;
-   no unrelated refactors.

If a subphase reveals uncertainty in OCCT APIs, topology mathematics,
database migration safety or semantic identity, stop and report options
rather than improvising a broad redesign.

------------------------------------------------------------------------

# 30. Failure and Recovery Behaviour

The system must expect geometry operations to fail.

Failure object contains:

``` text
code
stage
semantic owner(s)
operator/version
input hashes
tolerance
human-readable message
structured diagnostics
recoverable flag
suggested remediation metadata (optional)
```

Failed representations remain linked to semantic state for diagnosis. A
previous valid representation may be displayed as stale only if clearly
marked `STALE` and never exported as the current design without explicit
action.

------------------------------------------------------------------------

# 31. Tolerance and Numerical Policy

Create one documented tolerance policy module.

It must define:

-   modelling length tolerance;
-   angular tolerance;
-   coincidence tolerance;
-   tessellation chord/angular tolerances;
-   family clustering tolerances separately from geometry validity
    tolerances.

Never scatter unexplained epsilon constants through the codebase.

Store units internally using a documented canonical unit system;
recommended canonical geometry unit is millimetres for architectural
fabrication, while conversion utilities support SI quantities
consistently.

------------------------------------------------------------------------

# 32. Security / Safety / Integrity

Even for local v1:

-   validate all API payloads;
-   use parameterized SQL/repository layer;
-   do not evaluate persisted JavaScript;
-   restrict export paths;
-   limit geometry worker resources/time;
-   structured cancellation/timeouts for pathological geometry;
-   audit actor for mutations;
-   AI changes always attributed;
-   generated engineering results carry provenance and solver/compiler
    version.

------------------------------------------------------------------------

# 33. Observability

Record per compilation:

-   semantic snapshot hash;
-   invalidated objects;
-   operator timings;
-   cache hits/misses;
-   geometry failures;
-   representation sizes;
-   validation outcomes;
-   compiler versions.

Expose useful portions in Pipeline/Diagnostics UI.

------------------------------------------------------------------------

# 34. Caching and Incremental Regeneration

Cache operator results by deterministic key:

``` text
operator ID/version
+ canonical input hash
+ tolerance policy version
+ compiler configuration
```

Changing a local connector must not force unrelated topology to
regenerate.

Dependency engine must identify minimum affected downstream set.
Correctness takes priority over premature incremental optimization;
implement coarse invalidation first, then benchmark/refine.

------------------------------------------------------------------------

# 35. Schema Evolution

Every semantic object has `schemaVersion`.

Provide:

-   versioned validators;
-   migration functions;
-   migration tests;
-   no silent destructive migration;
-   snapshots retain original schema/compiler metadata.

Patterns and operators version independently.

A model snapshot must record the pattern/operator versions required to
reproduce it.

------------------------------------------------------------------------

# 36. Pattern Library Governance

Patterns have lifecycle:

``` text
draft -> validated -> published -> deprecated
```

A published pattern version is immutable. Editing it creates a new
version.

Fork records parent lineage.

Pattern definitions include examples and test fixtures.

AI-created patterns default to `draft` until validated.

------------------------------------------------------------------------

# 37. Example Semantic Design Script

This is illustrative syntax only. Do not build a text parser before the
typed object/command model works.

``` text
CREATE Dome primary
  diameter = 20000mm
  rise = 6500mm

APPLY SphericalCap TO primary

APPLY GoldbergCellularTopology TO primary
  frequency = 6

APPLY YJunctionNetwork TO primary

APPLY VariableAperture TO primary
  ratio = 0.25

CONSTRAIN fabrication.memberLength <= 2400mm

CREATE Affector worldCut
  type = PlaneCut
  coordinateSpace = world

APPLY worldCut TO primary

APPLY FabricationRationalisation TO primary
  targetFamilies = 16
  tolerance = 3mm

GENERATE fabrication
VALIDATE fabrication
EXPORT STEP
EXPORT BOM
```

The canonical implementation remains typed JSON/domain commands, not
free-form text.

------------------------------------------------------------------------

# 38. Example AI Interaction

User:

> Make apertures larger toward the top but keep every clear opening
> above 650 mm and don't change the base ring.

Expected AI workflow:

1.  inspect relevant aperture pattern and topology/location semantics;
2.  read existing minimum-opening constraint;
3.  create branch `experiment/top-aperture-gradient`;
4.  propose radial/height affector targeting aperture ratio;
5.  add/confirm constraint `clearOpening >= 650mm`;
6.  exclude base-ring classification;
7.  validate change set;
8.  apply;
9.  compile;
10. report affected components, failures, fabrication deltas and
    comparison to source.

AI must not directly manipulate mesh vertices.

------------------------------------------------------------------------

# 39. Definition of v1 Complete

v1 is complete when all of the following are demonstrated end-to-end:

1.  A user can create/open D01.
2.  D01 exists as a semantic graph in PostgreSQL.
3.  Hex/pent topology and Y network are deterministic and inspectable.
4.  Y components retain stable semantic IDs across normal regeneration.
5.  OCCT generates exact valid B-rep parts.
6.  User can change dome parameters and see preview then exact
    regeneration.
7.  World-space cuts produce robust surviving components without
    destroying semantic identity.
8.  Connections/fasteners can be added semantically and drive dependent
    holes/parts.
9.  Geometry passes explicit validation gates before fabrication-ready
    state.
10. Three.js renders derived geometry and supports semantic
    selection/measurement.
11. Pipeline, patterns and dependencies are visible in UI.
12. STEP/STL/GLB and BOM/cut-list outputs are traceable to a snapshot.
13. Part families can be identified using configurable tolerances.
14. User can create snapshots, branches, compare and restore/fork
    historical states.
15. AI can inspect and manipulate the semantic model through constrained
    validated ChangeSets.
16. A second small non-dome example proves extensibility.
17. Automated tests and benchmark suite run in CI/reproducible
    environment.
18. No critical domain logic depends on Three.js IDs or OCCT transient
    topology IDs.
19. Composition, specialisation, layered overrides and variants resolve
    deterministically.
20. The resolved semantic state compiles into a typed, inspectable
    Parametric IR and execution DAG.
21. Persistent semantic selectors and topological provenance support
    stable sub-element references; ambiguity fails visibly.
22. Design, product and geometric topology are explicitly separated and
    mapped.
23. Semantic QUERY/FILTER/TRAVERSE/TRACE/EXPLAIN operations work on the
    reference model.
24. Any selected derived object can expose a deterministic `WHY` lineage
    where provenance exists.
25. Capability-based pattern/operator targeting is demonstrated by the
    non-dome extensibility fixture.
26. Package manifests can load and validate at least the core and
    reference-domain packages locally.
27. Variant alternatives are distinct from chronological history and are
    preserved in snapshots.
28. Constraint taxonomy distinguishes validation, geometric, relational,
    fabrication and analysis constraints plus objectives.
29. PMI-ready semantic data can attach to persistent selectors without
    being reduced to viewport annotation.
30. A Gmsh analysis-mesh proof preserves semantic groups and provenance.
31. AI can execute a bounded measure/validate/repair loop on a branch
    without bypassing hard constraints.
32. UI exposes PIR/execution, lineage/WHY, variants, What-If, product
    mappings and analysis-mesh diagnostics.
33. Benchmarks B7--B11 run reproducibly alongside the original benchmark
    suite.

------------------------------------------------------------------------

# 40. Final Implementation Principle

The system should make this statement true:

> **A design is a versioned semantic parametric graph of intentions,
> entities, relationships, parameters, patterns, rules and constraints.
> Exact geometry, visual meshes, engineering models, fabrication parts
> and documents are deterministic representations compiled from that
> graph.**

The Y-component dome is the first stress test of that proposition.

When uncertain during implementation, preserve this hierarchy:

``` text
SEMANTIC DESIGN MODEL
   ↓
COMPOSITION / VARIANTS / SELECTORS
   ↓
PATTERNS / RULES / CONSTRAINTS
   ↓
PARAMETRIC IR
   ↓
EXECUTION DAG
   ↓
DETERMINISTIC OPERATORS
   ↓
DESIGN / PRODUCT / GEOMETRIC TOPOLOGY
   ↓
EXACT GEOMETRY / GMSH ANALYSIS MESH
   ↓
VALIDATION
   ↓
FABRICATION / PMI / REPRESENTATIONS / ANALYSIS
```

Do not collapse these layers for convenience.

------------------------------------------------------------------------

# 41. Grok 4.5 Execution Instruction

Before writing code, Grok must review this specification and produce:

1.  a proposed repository/module map;
2.  dependency-direction diagram;
3.  risk register, especially OCCT integration, topology identity and
    Boolean robustness;
4.  proposed technology choices where this specification intentionally
    leaves an implementation choice open;
5.  G0.1 implementation plan only.

Do **not** implement multiple phases in the first pass.

After approval, execute checkpoint-by-checkpoint. At every checkpoint,
preserve the semantic source-of-truth architecture and report any
requested shortcut that would compromise it before proceeding.

------------------------------------------------------------------------

# 42. v1.1 Integration Guardrail for Grok 4.5

This document intentionally retains the complete depth of the original
SPDS v1.0 specification and adds the v1.1 architecture on top.

When two requirements appear to overlap:

1.  preserve the stricter requirement;
2.  do not delete a v1.0 capability merely because v1.1 introduces a
    more abstract mechanism;
3.  treat PIR, composition, selectors, persistent naming, topology
    provenance, variants, semantic query, capabilities, package
    manifests, PMI readiness, Gmsh proof and AI repair as **additional
    architecture**, not substitutes for:
    -   semantic CRUD;
    -   patterns;
    -   operators;
    -   OCCT exact geometry;
    -   Three.js interaction;
    -   fabrication outputs;
    -   connections/fasteners;
    -   dimensions;
    -   PostgreSQL persistence;
    -   events/snapshots/branches;
    -   validation;
    -   tests/benchmarks;
    -   security;
    -   observability;
    -   caching;
    -   schema evolution;
    -   UI pipeline exposure.

Before G0.1, Grok must produce a requirements traceability matrix
mapping every numbered requirement and every build checkpoint in this
specification to the proposed package/module responsible for it. Any
requirement with no owner is a blocking architecture defect.

Do not start broad implementation until the traceability matrix,
dependency diagram, technology decisions, persistent-naming strategy,
PIR schema outline and G0.1 plan have been reviewed.
