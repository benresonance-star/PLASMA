# SPDS Semantic Depth Interface
## Pattern, Dependency, Causality and Execution Exploration UX Specification

**Status:** Proposed SPDS v1.3 UI architecture extension  
**Purpose:** Define a world-leading interface for understanding, navigating, modifying and explaining the semantic systems that generate geometry.  
**Primary viewport:** Three.js geometry viewport  
**Graph rendering substrate:** `@xyflow/react`  
**Source of truth:** SPDS semantic model, pattern engine, dependency graph, execution DAG and Parametric IR  
**Geometry authority:** OpenCascade / OCCT  
**Primary principle:** **The graph explains the design. The graph does not own the design.**

---

# 1. Product Goal

The system must allow an architect to work primarily with geometry while being able to progressively descend into the logic responsible for that geometry.

The interface must answer, interactively:

- What is this?
- Why does it exist?
- What controls it?
- What patterns affect it?
- What does it depend on?
- What depends on it?
- Which constraint limits it?
- Which field is driving it?
- What happens if I change it?
- How was it mathematically generated?
- Which OpenCascade operation ultimately produced it?
- Why did the AI make this change?
- What changed between the previous and current state?

The user must not need to understand node programming to answer these questions.

A computational designer or developer must nevertheless be able to descend all the way to deterministic execution.

---

# 2. Core UX Concept — Semantic Depth

Every design object has multiple levels of explanation.

Define five principal depths:

```text
D0  FORM
    What am I looking at?

D1  INTENT
    Why is it like this?

D2  SYSTEM
    What patterns, constraints and relationships affect it?

D3  LOGIC
    How do those patterns work?

D4  EXECUTION
    How is it calculated and generated?
```

These are not separate applications.

They are progressively deeper views of the same semantic model.

The selected object must remain the contextual anchor while navigating between depths.

---

# 3. Fundamental Interaction Model

Normal workflow begins in geometry.

```text
Three.js geometry
      ↓ select
Semantic object
      ↓ inspect
Intent / causal neighbourhood
      ↓ descend
Patterns + dependencies
      ↓ descend
Pattern internals
      ↓ descend
Operators + execution DAG
      ↓
OCCT result
```

The user must never be required to open a global graph merely to understand one object.

Selection is the primary entry point into system depth.

---

# 4. Geometry First

The Three.js viewport remains the dominant workspace.

Selecting geometry resolves:

```text
render mesh
→ representation ID
→ topology provenance
→ semantic object ID
→ pattern provenance
→ dependencies
→ constraints
→ downstream outputs
```

Selection in any representation must synchronise with every other representation.

Selecting:

- geometry highlights semantic nodes;
- semantic nodes highlight geometry;
- a constraint highlights affected geometry;
- a field visualises that field in 3D;
- an affector displays its spatial representation;
- an operator highlights the geometry it generated;
- an edge highlights the relationship it represents.

There must be no independent "graph selection" and "geometry selection" state.

---

# 5. Explain Selection

Provide a primary command:

**Explain Selection**

It computes and displays the smallest meaningful causal neighbourhood around the selected object.

Example:

```text
                 Height Field
                      │
                    drives
                      │
                      ▼
              Variable Aperture
                      │
                  generates
                      │
                      ▼
                Aperture 047
                      │
                  modifies
                  ┌───┴───┐
                  ▼       ▼
                Y51       Y52
                  │
                  ▼
         Fabrication Family 08
```

Do not initially display unrelated model nodes.

The default graph is a **causal lens**, not the whole model graph.

---

# 6. Causal Radius

The user can expand the causal lens progressively.

Controls:

```text
Direct
±1 relationship

Context
±2 relationships

System
full relevant pattern

Model
all connected dependencies
```

Default = Direct or Context.

Never default to full-model visibility for complex models.

Expansion must preserve the selected semantic object at the visual centre where practical.

---

# 7. Relationship Types

Edges must have semantic types.

Initial relationship vocabulary:

```text
GENERATES
DERIVES_FROM
DEPENDS_ON
DRIVES
CONSTRAINS
LIMITS
AFFECTS
MODIFIES
APPLIES_TO
CONTAINS
COMPOSES
SPECIALISES
INHERITS
OVERRIDES
REFERENCES
MEASURES
VALIDATES
INVALIDATES
FABRICATES_AS
REPRESENTS
EXECUTES_AS
INPUT_TO
OUTPUT_OF
```

Relationships are first-class model concepts.

React Flow edges are merely visual projections of these relationships.

Each edge must therefore carry a stable semantic relationship ID.

---

# 8. Edge Presentation

Do not create Grasshopper-style anonymous wires.

At close semantic zoom:

```text
Height Field
      │
      │ drives
      ▼
Variable Aperture
```

At medium zoom:

```text
Height Field
      ↓
Variable Aperture
```

At distant zoom, semantic direction remains legible without textual clutter.

Meaning must not depend on colour alone.

Use combinations of:

- edge label;
- arrow form;
- line style;
- weight;
- small relationship glyph;
- optional colour family.

---

# 9. Pattern View

Patterns are displayed as semantic strategies rather than low-level functions.

Example:

```text
DOME SYSTEM

Spherical Cap
      ↓
Goldberg Cellular Topology
      ↓
Y Junction Network
      ↓
Variable Aperture
      ↓
Structural Thickening
      ↓
Fabrication Rationalisation
```

Each pattern node can expose:

- intent;
- inputs;
- outputs;
- parameters;
- rules;
- constraints;
- subpatterns;
- operator bindings;
- affectors;
- compatibility;
- conflicts;
- version;
- provenance;
- affected geometry count;
- validation state.

---

# 10. Pattern Cards

At normal zoom a pattern appears approximately as:

```text
┌──────────────────────────────┐
│ VARIABLE APERTURE            │
│                              │
│ Height-driven                │
│ 186 cells                    │
│ 180–900 mm                   │
│                              │
│ 1 constraint · 2 inputs      │
└──────────────────────────────┘
```

It should communicate design intent before implementation detail.

---

# 11. Semantic Zoom

Graph representation changes with zoom.

### Level A — Identity

```text
[ Variable Aperture ]
```

### Level B — Summary

```text
Variable Aperture
186 cells
Height driven
```

### Level C — Behaviour

```text
Variable Aperture

Driver       Height Field
Mapping      Smoothstep
Minimum      180 mm
Maximum      900 mm
Constraint   clear ≥650 mm
```

### Level D — Structure

Expose:

- subpatterns;
- rules;
- affectors;
- inputs;
- outputs.

### Level E — Implementation

Expose operator bindings and execution.

Zoom should progressively reveal information rather than merely enlarge the same node.

---

# 12. Entering a Pattern

Patterns can be entered as semantic spaces.

Example:

```text
Variable Aperture
        ↓ ENTER

Height Field
     ↓
Normalize
     ↓
Mapping Rule
     ↓
Aperture Domain
     ↓
Profile Requirement
```

Navigation should feel more like entering a system than opening a pop-up.

Provide breadcrumb:

```text
Dome
› Variable Aperture
› Aperture Mapping
```

Back returns to the previous semantic context and viewport state.

---

# 13. Nested Graphs

Support nested pattern graphs.

However, nesting exists in the SPDS semantic model.

React Flow `parentId` / subflow functionality may be used for presentation where useful, but must not define semantic containment.

Patterns may contain:

- subpatterns;
- rule groups;
- constraints;
- operator groups;
- affectors.

Collapsed nodes act as portals into deeper semantic graphs.

---

# 14. Dependency View

Dependency view answers:

> If this changes, what else changes?

Two primary directions:

```text
UPSTREAM
Why does this have its current state?

DOWNSTREAM
What will this affect?
```

Example:

```text
                 UPSTREAM

Solar Field ──┐
              ├→ Variable Aperture → Aperture 47
Height Field ─┘                         │
                                       │
                                  SELECTED
                                       │
                              ┌────────┴─────────┐
                              ▼                  ▼
                             Y51                Y52
                              │                  │
                              └────────┬─────────┘
                                       ▼
                             Fabrication Family

                                    DOWNSTREAM
```

The two directions must remain visually understandable even in dense networks.

---

# 15. Impact Preview

Before applying any modification, calculate the affected downstream set.

Display:

```text
PROPOSED CHANGE

VariableAperture.max
900 mm → 1100 mm

DIRECTLY AFFECTED
28 apertures

DOWNSTREAM
44 Y components
6 connections
3 fabrication families

UNCHANGED
topology
base ring
world cut

VALIDATION
✓ geometry
✓ minimum opening
⚠ +2 unique part families
```

Allow user to reveal the actual dependency path that produced each impact.

---

# 16. "Why?" Interaction

Every meaningful generated value should support:

**Why?**

Example:

> Why is Aperture 47 714 mm?

UI traces:

```text
Height = 5.84 m
      ↓
Height Field = 0.72
      ↓
Smoothstep mapping
      ↓
Requested aperture = 731 mm
      ↓
Fabrication rationalisation
      ↓
Actual aperture = 714 mm
```

This becomes the human-readable equivalent of program tracing.

---

# 17. "What Controls This?" Interaction

Context action:

**What controls this?**

Returns the minimum control graph.

Example:

```text
member:184.depth

controlled by
StructuralThickening.maxDepth

driven by
SupportDistanceField

limited by
UtilisationConstraint
```

The user can edit an appropriate controlling parameter directly from this explanation.

---

# 18. "What If?" Interaction

Any editable semantic element can initiate temporary computation.

Example:

```text
What if:
maxDepth 320 → 260 mm?
```

System:

1. forks transient what-if state;
2. invalidates required dependencies;
3. runs preview;
4. displays ghost geometry;
5. evaluates constraints;
6. reports semantic and fabrication deltas.

Do not modify current branch until accepted.

---

# 19. Before / Intervention / After

Every AI-generated modification must expose a structural delta.

Example:

```text
BEFORE

HeightField
    ↓
VariableAperture


INTERVENTION

+ SketchDistanceField
+ composition relationship


AFTER

HeightField ─────────┐
                     ▼
               VariableAperture
                     ▲
                     │
            SketchDistanceField
```

Accompany with geometry impact.

This is mandatory for significant AI changes.

---

# 20. AI as Semantic Navigator

The AI should be able to manipulate graph focus without modifying design.

Examples:

> Show me what controls these members.

> Why is this opening smaller?

> Show only fabrication dependencies.

> Hide execution details.

> Where does this value originate?

> Which patterns affect this region?

> Show the path from the sketch to the final B-rep.

> What would need to change to make this shallower?

> Which constraint is preventing that?

The AI returns graph focus instructions backed by semantic query results.

---

# 21. AI as Graph Editor

AI design modifications operate through validated SPDS ChangeSets.

AI may propose:

- instantiate pattern;
- compose pattern;
- specialise pattern;
- change parameter;
- add/remove relationship;
- add affector;
- add constraint;
- change rule;
- change field driver;
- fork pattern;
- create draft pattern.

It must not directly mutate React Flow nodes or edges as design state.

Graph UI receives model changes only after semantic commands are accepted by the model layer.

---

# 22. Sketch Integration

Sketches are first-class spatial intent.

Example:

User sketches over dome and says:

> Make the openings more generous around here.

System resolves:

```text
Sketch
   ↓
semantic hit region
   ↓
affected cells
   ↓
current causal graph
   ↓
Variable Aperture
```

AI proposes:

```text
SketchDistanceField
      ↓
compose
      ↓
VariableAperture
```

The proposed new node and relationship appear visually before application.

---

# 23. Spatial Fields

Fields must have dual representations.

Graph:

```text
Sketch Curve
     ↓
Distance Field
     ↓
Variable Aperture
```

Viewport:

- field scalar overlay;
- contours;
- vectors where appropriate;
- influence radius;
- falloff;
- target geometry.

Selecting either representation highlights the other.

---

# 24. Constraints as Visible Participants

Constraints are not hidden validation messages.

They exist visibly in the semantic system.

Example:

```text
Minimum Clear Opening
        │
      limits
        ▼
Variable Aperture
```

Selecting the constraint should expose geometry states:

```text
safe
approaching limit
at limit
violating
```

Constraint limits should be inspectable directly in the viewport.

---

# 25. Pattern Composition View

Composition should be graphically understandable.

Example:

```text
Y Junction Network
        +
Structural Thickening
        +
Variable Aperture
        +
Boundary Termination
        ↓
Effective Y Component Definition
```

Specialisation must be distinguishable from composition.

Example:

```text
Bolted Connection
      ↓ specialises
Aluminium Bolted Connection
      ↓ specialises
Dome Bolted Connection
      ↓ instance
Connection 083
```

Overrides appear as deltas rather than duplicated graphs.

---

# 26. Variant View

Variants answer:

> Which alternative is active?

They are not represented as history.

Example:

```text
GEOMETRY
● 20 m
○ 22 m

MATERIAL
● Aluminium
○ Steel

CONNECTION
● Bolted
○ Prototype
```

Selecting another variant causes semantic and geometry comparison without rewriting history.

---

# 27. History View

History answers:

> What happened?

Example:

```text
v37
│
├─ aperture gradient added
│
v38
│
├─ minimum opening constraint
│
v39
│
├─ sketch affector added
│
v40 ← current
```

Selecting a historical event exposes its graph delta and geometry delta.

---

# 28. Execution View

Execution view is the deepest level.

This may resemble a conventional node graph.

Example:

```text
cell-topology
      ↓
extract-junction
      ↓
local-frame
      ↓
generate-profile
      ↓
build-wire
      ↓
sweep
      ↓
boolean
      ↓
heal
      ↓
validate
      ↓
tessellate
```

Each execution node exposes:

- operator ID;
- version;
- deterministic input hash;
- output hash;
- cached/not cached;
- execution duration;
- tolerance policy;
- warnings;
- errors;
- provenance;
- resulting semantic/topological IDs.

This view is primarily for computational designers and developers.

---

# 29. Execution Diagnostics

Optional overlays:

```text
cached
recomputed
invalidated
failed
warning
expensive
```

Selecting a regenerated geometry component can reveal the exact execution path responsible.

---

# 30. React Flow Decision

Use:

```text
@xyflow/react
```

for graph rendering and interaction.

React Flow may own:

- node rendering;
- edge rendering;
- pan;
- zoom;
- node visual positioning;
- selection gestures;
- minimap where useful;
- edge interaction;
- graph viewport;
- group presentation;
- visual subflows;
- keyboard navigation;
- temporary drag state.

React Flow must NOT own:

- semantic graph;
- pattern definitions;
- dependency graph;
- execution DAG;
- model identity;
- semantic hierarchy;
- graph validity;
- dependency calculation;
- persistence;
- undo/history;
- AI state;
- pattern composition;
- model commands;
- geometry generation.

---

# 31. Graph Projection Architecture

Introduce a presentation adapter:

```text
SPDS Semantic Model
        ↓
Graph Query
        ↓
Semantic Projection
        ↓
Graph View Model
        ↓
React Flow
```

Example:

```ts
interface GraphProjection {
  projectionId: string;
  focusObjectIds: string[];
  depth: SemanticDepth;
  relationshipTypes: RelationshipType[];
  causalRadius: number;

  nodes: GraphViewNode[];
  edges: GraphViewEdge[];

  layoutHints: LayoutHints;
}
```

`GraphViewNode` is disposable view data.

It must always retain:

```text
semanticId
semanticType
projectionRole
```

Never derive semantic identity from React Flow node IDs alone.

---

# 32. Read-Only Projection by Default

React Flow initially behaves as a projection of semantic state.

Dragging a node changes diagram layout only.

It must NOT alter design relationships.

Explicit graph-edit mode permits semantic operations such as:

```text
connect
disconnect
compose
apply
override
```

These operations create semantic commands first.

Only accepted commands cause the projection to update.

---

# 33. Layout Engine

Do not rely on users manually laying out the model.

Use automatic layouts based on graph mode.

Recommended evaluation:

```text
ELK.js
Dagre
custom causal layout
```

Likely architecture:

- ELK for hierarchical/layered pattern graphs;
- custom radial or centred causal neighbourhood;
- left-to-right dependency traces;
- compact vertical execution chains.

Store optional user layout preferences separately from semantic state.

---

# 34. Stable Mental Map

Automatic layout must minimise unnecessary movement.

When graph expands:

- existing nodes should remain approximately stationary;
- new context should unfold around them;
- selected node remains anchored;
- collapsing should restore previous positions where practical.

Graph motion should explain structural change rather than create visual noise.

---

# 35. Performance Strategy

Never project the entire semantic model automatically.

Query only required graph neighbourhood.

Use:

- causal-radius projection;
- collapsed patterns;
- viewport culling;
- memoised custom nodes;
- targeted store subscriptions;
- lazy expansion;
- derived graph caches;
- semantic-level clustering.

Large pattern instances should appear as aggregate nodes.

Example:

```text
Y Components
186 instances
```

not 186 individual nodes unless expanded.

---

# 36. Instance Expansion

An aggregate node can progressively reveal:

```text
Y Components
186

→ by topology region
→ by part family
→ by rule state
→ by constraint state
→ individual instances
```

This avoids graph explosion.

---

# 37. Filter Lenses

Provide semantic lenses:

```text
Patterns
Dependencies
Constraints
Fields
Fabrication
Structure
Connections
AI Changes
Execution
Validation
```

These are graph filters, not separate graph data models.

---

# 38. Combined View

Allow viewport + graph presentation:

```text
┌─────────────────────────────┬───────────────┐
│                             │               │
│       THREE.JS MODEL        │ CAUSAL LENS   │
│                             │               │
│                             │      A        │
│                             │      ↓        │
│                             │      B        │
│                             │      ↓        │
│                             │    [SEL]      │
│                             │               │
└─────────────────────────────┴───────────────┘
```

Graph pane should be collapsible.

For deep work it can expand to the main workspace.

---

# 39. Overlay View

For simple causal relationships, support an alternative to opening the graph pane:

```text
3D GEOMETRY

selected aperture
      │
      ├── Variable Aperture
      │
      ├── Height Field
      │
      └── Min Opening Constraint
```

This is a compact "peek" into semantic depth.

---

# 40. Depth Navigation

Persistent depth control:

```text
FORM ─ INTENT ─ SYSTEM ─ LOGIC ─ EXECUTION
```

Do not interpret this purely as tabs.

It represents allowable explanation depth.

User may jump directly, but normal interaction progressively descends.

AI can take user directly to the relevant depth.

---

# 41. Search

Global semantic search must find:

- object;
- pattern;
- parameter;
- constraint;
- rule;
- operator;
- material;
- connection;
- field;
- affector;
- output.

Selecting search result:

1. focuses geometry if spatial;
2. opens relevant semantic depth;
3. isolates causal neighbourhood.

---

# 42. Command Palette

Examples:

```text
Explain selection
Show upstream
Show downstream
Show controlling parameters
Show constraints
Show affected geometry
Enter pattern
Show implementation
Show AI changes
Compare before/after
Trace to OCCT
Trace from sketch
Collapse to patterns
Fit causal neighbourhood
```

---

# 43. Visual Language

Visual hierarchy should prioritise:

1. selected object;
2. direct causes;
3. direct effects;
4. constraints;
5. secondary context;
6. implementation details.

Avoid:

- saturated node colours;
- excessive sockets;
- spaghetti wires;
- permanent minimap dependence;
- ornamental graph backgrounds;
- dense Grasshopper-style canvases;
- information visible merely because it exists.

The graph should feel like an explanatory drawing.

---

# 44. Node Types

Initial UI node families:

```text
Entity
Pattern
Parameter
Field
Rule
Constraint
Affector
Assembly
Connection
Material
Measurement
Representation
Output
Operator
AI Change
Sketch Intent
```

Each semantic family gets a restrained but recognisable visual grammar.

Do not create a unique decorative node appearance for every subtype.

---

# 45. Graph Editing

Direct graph editing is allowed only where semantics are clear.

Examples:

Dragging:

```text
SketchField
```

onto:

```text
VariableAperture
```

may open:

```text
Apply as:

○ driver
○ modifier
○ limiter
○ target selector
```

The resulting relationship is created through validated semantic commands.

Never infer destructive semantic operations solely from a visual wire drop when ambiguity exists.

---

# 46. AI Proposed Graph Changes

AI additions display as provisional.

Example:

```text
Existing        solid
Proposed        dashed / provisional
Removed         faded / struck relationship
Changed         before/after value
```

User can:

```text
Apply
Reject
Modify
Explain
Preview geometry
Inspect impact
```

---

# 47. Provenance

Every semantic node can reveal:

```text
created by
modified by
pattern origin
version
snapshot
AI ChangeSet
sketch source
upstream semantic objects
operator provenance
```

A generated object should always be traceable backward.

---

# 48. Required Queries

Backend query layer must support at minimum:

```text
explain(objectId)
upstream(objectId, radius)
downstream(objectId, radius)
controllingParameters(objectId)
patternsAffecting(objectId)
constraintsAffecting(objectId)
operatorsGenerating(objectId)
geometryAffectedBy(semanticId)
semanticObjectsForGeometry(repTopologyId)
trace(from, to)
impact(changeSet)
patternGraph(patternId)
executionGraph(objectId)
history(objectId)
provenance(objectId)
```

UI must not attempt to reconstruct these relationships itself.

---

# 49. Required Synchronisation Contract

Three.js and React Flow communicate only through semantic IDs.

Example:

```text
Three.js pick
→ semanticId = y:184
→ central selection store
→ React Flow projection selects y:184

React Flow select VariableAperture
→ semanticId = pattern:variable-aperture:3
→ central selection store
→ geometry query
→ Three.js highlights affected components
```

No direct Three.js → React Flow component references.

---

# 50. Central Selection Context

Implement a shared semantic selection model:

```ts
interface SemanticSelection {
  primaryId?: SemanticId;
  secondaryIds: SemanticId[];
  source:
    | "viewport"
    | "graph"
    | "search"
    | "ai"
    | "history"
    | "sketch";

  intent?: SelectionIntent;
}
```

All views subscribe selectively.

---

# 51. Accessibility and Navigation

Graph must support:

- keyboard node traversal;
- readable relationship labels;
- reduced motion;
- non-colour state encoding;
- zoom-independent selection visibility;
- screen-reader node summaries where practical.

---

# 52. Mobile / Tablet Behaviour

Desktop:

```text
viewport + graph pane
```

Tablet:

```text
viewport
↓
bottom semantic sheet
↓ expand
graph workspace
```

Apple Pencil sketching must remain accessible without graph UI occupying the design viewport.

On tablet, selecting geometry can invoke a compact causal strip before full graph expansion.

---

# 53. Implementation Phases

## Phase SD1 — Semantic Projection Foundation

Implement:

- GraphProjection contract;
- React Flow adapter;
- semantic ID mapping;
- central selection;
- basic entity/pattern nodes;
- typed relationship edges;
- Three.js ↔ graph selection sync.

**Gate:** selecting a Y in Three.js highlights it in the semantic graph and vice versa.

---

## Phase SD2 — Explain Selection

Implement:

- upstream query;
- downstream query;
- causal radius;
- causal neighbourhood projection;
- auto layout;
- geometry highlighting;
- Explain Selection command.

**Gate:** user can select a generated component and understand immediate cause/effect without viewing the whole model.

---

## Phase SD3 — Pattern Inspector

Implement:

- pattern summary node;
- semantic zoom;
- enter pattern;
- breadcrumbs;
- subpatterns;
- parameters;
- rules;
- affectors;
- operator bindings hidden by default.

**Gate:** user can understand a pattern without seeing implementation operators.

---

## Phase SD4 — Dependency Explorer

Implement:

- upstream/downstream distinction;
- impact highlighting;
- relationship filtering;
- dependency lenses;
- aggregate instance nodes.

**Gate:** user can identify the minimum downstream system affected by a parameter change.

---

## Phase SD5 — Why / What Controls This

Implement:

- value provenance;
- causal trace;
- controlling parameter query;
- constraint path;
- human-readable trace.

**Gate:** user can ask why a generated dimension has its current value and receive an inspectable causal chain.

---

## Phase SD6 — Fields and Constraints

Implement:

- graph field node;
- Three.js field overlay;
- constraint node;
- constraint threshold visualisation;
- bidirectional field/geometry selection.

**Gate:** selecting a field in the graph visualises its influence spatially.

---

## Phase SD7 — AI Navigation

Implement AI tools:

```text
focusGraph
explainSelection
showUpstream
showDownstream
trace
enterPattern
showConstraints
showExecution
```

No mutations yet.

**Gate:** AI can guide user to the relevant causal system without altering design.

---

## Phase SD8 — AI Graph Changes

Implement:

- proposed ChangeSet projection;
- provisional nodes/edges;
- before/intervention/after;
- impact preview;
- accept/reject;
- branch creation.

**Gate:** user can see exactly how an AI proposal modifies semantic logic before regeneration is committed.

---

## Phase SD9 — Sketch Semantic Integration

Implement:

- SketchIntent node;
- semantic hit region;
- SketchField;
- sketch provenance;
- proposed pattern composition;
- viewport↔graph trace.

**Gate:** user sketches a region, requests a modification, and sees the proposed semantic intervention graphically before applying it.

---

## Phase SD10 — Execution Depth

Implement:

- operator nodes;
- execution DAG;
- cache state;
- invalidation state;
- timings;
- warnings;
- tolerance provenance;
- trace to OCCT.

**Gate:** advanced user can trace a semantic component to deterministic geometry generation.

---

## Phase SD11 — History + Variants

Implement:

- graph delta history;
- semantic compare;
- variant selection;
- history/variant distinction;
- geometry comparison.

**Gate:** historical modification and intentional variant cannot be confused in either UI or data.

---

## Phase SD12 — Scale and Performance

Benchmark with:

```text
1k semantic objects
10k semantic objects
100k semantic objects
```

The UI must remain responsive because it projects only relevant semantic neighbourhoods rather than rendering full models.

Measure:

- projection query time;
- layout time;
- React render time;
- geometry highlight latency;
- causal expansion latency;
- AI navigation latency.

---

# 54. Non-Goals

Do not build:

- a Grasshopper clone;
- an unrestricted visual programming environment;
- a second semantic model inside React Flow;
- geometry state in React Flow;
- model persistence from graph coordinates;
- automatic full-model graph rendering;
- opaque AI rewiring;
- direct B-rep editing through node wires;
- execution nodes as the default interface.

---

# 55. Product Benchmarks

The interface succeeds when a user unfamiliar with node programming can:

### Test A

Select one object and answer:

> Why does this exist?

within two interactions.

### Test B

Determine:

> What controls its size?

without opening execution view.

### Test C

Understand what will change before editing a parameter.

### Test D

See why an AI modification was proposed.

### Test E

Trace any generated part back to:

```text
design intent
→ pattern
→ rule / dependency
→ operator
→ OCCT result
```

### Test F

Modify sophisticated procedural behaviour without manually wiring low-level geometry operations.

---

# 56. World-Leading UX Principle

The target is not:

> make visual programming easier.

The target is:

> make computational design causality understandable.

The architect should normally interact with:

```text
form
intent
patterns
relationships
constraints
fields
```

The computational implementation exists beneath those concepts and remains available whenever deeper inspection is required.

---

# 57. Architectural Decision

**Adopt React Flow (`@xyflow/react`) as the initial graph UI substrate.**

Do so behind a strict projection boundary:

```text
SPDS
  semantic model
  pattern engine
  dependency graph
  execution DAG
        ↓
Graph Projection API
        ↓
@xyflow/react
```

If React Flow is replaced in the future, the semantic architecture must remain unchanged.

React Flow is an interface dependency.

It is not a design-system dependency.

---

# 58. Final Principle

The system should feel as though the user can look **into** the geometry.

At first they see the thing.

Then:

```text
why
↓
what system
↓
what relationship
↓
what rule
↓
what computation
↓
what geometry operation
```

Each descent increases precision without requiring the user to abandon the object they were originally thinking about.

**Geometry remains the surface.  
Semantics explain it.  
Patterns organise it.  
Dependencies reveal causality.  
Operators execute it.  
AI helps navigate and modify it.**