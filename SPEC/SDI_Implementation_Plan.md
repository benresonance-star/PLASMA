# SPDS Semantic Depth Interface — Implementation Plan

**Status:** Proposed implementation plan against `SPEC/SPDS Semantic Depth Interface.md`  
**Scope:** Progressive semantic-depth UX (D0–D4), graph projection, causal navigation  
**Primary principle (inherited):** The graph explains the design. The graph does not own the design.  
**Date:** 2026-08-09

---

## 0. Baseline — What Exists Today

### Already strong (reuse, do not rebuild)

| Capability | Location | SDI mapping |
|---|---|---|
| Mesh pick → `semanticOwner` | `apps/designer-web/src/ui/ViewportCanvas.tsx`, `three-scene.ts` | §4 Geometry First (partial) |
| Central selection sync | `apps/designer-web/src/selection-sync.ts` | §49–§50 (partial; 3 sources only) |
| Display meshes bound to semantic owners | `packages/geometry-contracts`, `reference-pipeline`, `mesh-bridge.ts` | §4 representation → semantic |
| Dual-engine viewport + highlight | `ViewportCanvas.tsx`, `three-scene.ts` | D0 FORM |
| Measure on semantic feature paths | `measure-tool.ts`, `@spds/geometry-contracts/measure` | unrelated to SDI graph; keep separate |
| `explainObject` / `traceLineage` | `packages/semantic-query` | §5 / §48 seed |
| Graph `upstream` / `downstream` | `packages/semantic-core/src/graph.ts` | §14 seed (1-hop only today) |
| Dependency explorer view-model | `apps/designer-web/src/dependency-explorer.ts` | §14 UI stub |
| Pattern inspector view-model | `apps/designer-web/src/pattern-inspector.ts` | §9–§11 stub |
| Pipeline / execution stub | `apps/designer-web/src/pipeline-view.ts` | §28 stub |
| API explain / query / trace (fixture) | `apps/api/src/server.ts` | §48 partial |
| AI `why` / impact preview tools | `packages/ai-interface` | §16 / §15 seed |
| ChangeSet accept path | `apps/api` + designer AI panel | §21 / §46 seed |
| UI prefs persistence | `ui-preferences.ts` + Postgres | layout prefs hook (§33) |
| ADR-001 semantic source of truth | `docs/architecture/ADR-001-*.md` | forbids triangle/RF identity ownership |

### Explicit gaps (must build)

1. No `@xyflow/react`, no graph pane, no `GraphProjection`
2. No causal-radius neighbourhood queries (multi-hop typed)
3. `SelectionStore` lacks `graph` / `search` / `ai` / `history` / `sketch` sources and `intent`
4. Relationship vocabulary mismatch: core uses kebab-case (`depends-on`, `generated-from`); SDI §7 uses `GENERATES`, `DRIVES`, etc.
5. No Explain Selection command, depth rail, overlay peek, command palette
6. No field overlays, constraint spatial viz, sketch semantic integration
7. No AI graph-focus tools or provisional ChangeSet graph projection
8. Explain/query APIs are fixture-backed, not live model-backed
9. No ELK/Dagre layout; no stable-layout cache
10. No SD12-scale benchmarks or neighbourhood projection caches

### Architecture constraints (from codebase + ADR)

```text
SPDS semantic model / pattern engine / dependency graph / execution DAG
        ↓
packages/graph-projection  (NEW — kernel-neutral GraphProjection API)
        ↓
apps/designer-web graph adapter  (@xyflow/react ONLY here)
        ↓
React Flow view (disposable IDs; always retain semanticId)
```

- React Flow must not enter `packages/*`
- Layout preferences persist separately from semantic state (extend `workspace` UI prefs)
- Selection is semantic-ID only; Three.js and React Flow never hold direct component references
- Do not build GPU ID-buffer picking as part of SDI (out of scope; current raycast → semanticOwner is sufficient for SD1–SD11 gates)

### Hard rule — Live substrate (removes fixture + fake What-if risk)

**Product gates and demos must use system-generated geometry and the model’s semantic graph — never dummy/demo meshes as evidence of done.**

| Layer | Allowed for product gates | Allowed for unit tests only |
|---|---|---|
| Geometry | Display meshes from `buildD01DisplayMeshes` / geometry-occt compile+tessellate path (`/references/d01/display-meshes` or model-bound regenerate) | Hand-built `demo-meshes` / AABB stubs |
| Semantics | Objects + relationships loaded for a real `modelId` (version store / `semantic_objects` + `relationships`) | In-memory G3b-style graphs |
| Explain / upstream / Why | Queries over that model graph + provenance tied to generated parts | Pure function tests with tiny graphs |
| What-if / Impact preview | Transient branch → invalidate → **regenerate preview meshes through the same pipeline** → constraint eval → deltas | Mock impact counts |

**Gate evidence rule:** A phase gate PR must include at least one integration/smoke test that:

1. creates or loads a model,
2. generates display meshes via the geometry pipeline (not `demo-meshes.ts`),
3. runs the SDI command (select / explain / impact / what-if),
4. asserts on semantic IDs that appear on those generated meshes.

Fixtures remain for fast pure-unit tests. **Fixture-only green is not a pass.**

**What-if rule:** Ghost/opacity layers are a viewport presentation detail only. SD8 is incomplete until preview meshes are produced by a transient regenerate. Client-only faded clones of current meshes are explicitly **not** §18.

---

## 1. Cross-Cutting Conventions

### 1.1 Package / module layout

| New unit | Responsibility |
|---|---|
| `packages/graph-projection` | Projection contracts, neighbourhood queries, layout hints, RF-agnostic view model |
| `packages/semantic-query` (extend) | §48 query suite over live `IndexedSemanticGraph` |
| `packages/semantic-core` (extend) | Relationship vocabulary alias map §7 ↔ core types |
| `apps/designer-web/src/sdi/*` | React Flow adapter, depth chrome, commands, overlay peek |
| `apps/api` routes | Thin HTTP over semantic-query |

### 1.2 Test / benchmark policy (every subphase)

| Kind | Requirement |
|---|---|
| **Unit** | Pure projection/query/layout functions; no DOM where avoidable |
| **Contract** | Zod / TypeScript gates that projection nodes retain `semanticId`, `semanticType`, `projectionRole` |
| **Integration** | API route + designer session sync where applicable |
| **Gate test** | Named acceptance test matching the phase gate in SDI §53 |
| **Benchmark** | Vitest/bench or scripted micro-bench with recorded budgets (see §SD12) |

Default latency budgets (tighten in SD12):

| Metric | Budget |
|---|---|
| Selection sync (viewport ↔ graph) | ≤ 100 ms (already in `selection-sync` comment) |
| Neighbourhood projection (radius ≤ 2, ≤ 200 nodes) | ≤ 50 ms |
| Auto-layout (≤ 200 nodes) | ≤ 150 ms |
| Geometry highlight after graph select | ≤ 100 ms |
| Explain Selection end-to-end (live D01-scale model) | ≤ 500 ms (fixture unit path ≤ 250 ms) |

### 1.3 Relationship vocabulary bridge (do once, early)

Map SDI §7 presentation types onto core / namespaced types. Example:

| SDI presentation | Core / namespaced storage |
|---|---|
| `DEPENDS_ON` | `depends-on` |
| `DERIVES_FROM` / `GENERATES` | `generated-from` / `produces` |
| `AFFECTS` | `affected-by` |
| `CONSTRAINS` / `LIMITS` | `governed-by` + `constraint.limits` |
| `CONTAINS` / `COMPOSES` | `part-of` / `pattern.composes` |
| `REPRESENTS` | `represented-by` |
| `EXECUTES_AS` | `execution.executes-as` |
| … | namespaced `domain.relation` for remainder |

Projection edges always carry stable relationship `id` (§7).

---

## 2. Phased Plan

Phases follow SDI §53 (SD1–SD12). Each phase is split into small subphases that can land as reviewable PRs.

### Build order (locked)

**Do live substrate first, then the rest of this plan.** Do not start React Flow / Explain UI until the substrate smoke is green.

```text
Wave 0  — Live substrate (THIS FIRST)
          SD0.1 vocab aliases
          SD0.2 live D01 mesh↔graph extract + CI smoke
          SD0.3 model-scoped query routes (no global G3b product path)
          SD2.0 explain/upstream on modelId for a generated semanticOwner
                ↑ blocking for any SD2 UI gate

Wave 1  — SDI UI foundation (SPEC phases SD1 → SD5 + shell)
          SD1 GraphProjection + RF + selection sync on generated meshes
          SD2 Explain Selection / causal radius / layout
          SD3–SD5 pattern / dependency / Why

Wave 2  — Deeper SDI (SD6 → SD11) as in this document

Wave 3  — SD8.4 What-if regenerate (with SD8, not before Wave 1)
          SD12 scale benches (generators can start during Wave 1)
```

| Do first | Do not front-load |
|---|---|
| Model-scoped graph + D01 generated meshes + explain on real owners | Full `@xyflow` chrome before substrate exists |
| CI live smoke (`skipIf` OCCT only) | SD8.4 What-if regenerate before SD1–SD5 |
| Vocab bridge SD0.1 | Treating demo-meshes as an interim product path |

Rationale: graph UI built on fixtures/demo meshes creates throwaway sync tests and reintroduces the fixture risk. Substrate-first makes every later gate honest.

---

# Phase SD0 — Prefactors (repo readiness)

> Not in the spec numbering; **Wave 0 — required before SD1 UI**.

### SD0.1 — Relationship vocabulary aliases

- **Goal:** Bidirectional map between SDI presentation types and core `relationType` strings; edges keep stable IDs.
- **Implement:** `packages/semantic-core` alias table + presentation helpers.
- **Tests:** Round-trip every §7 type ↔ storage; unknown custom namespaced types pass through.
- **Benchmarks:** N/A (table lookup < 1 µs).
- **Exit:** Downstream packages can render `drives` labels without inventing a second model.

### SD0.2 — Unit fixture (fast only) + live D01 semantic extract

- **Goal:** Keep a small deterministic unit fixture for pure graph tests **and** define the canonical live substrate: D01 (then F01) model whose display meshes come from the geometry pipeline and whose semantic graph is addressable by `modelId`.
- **Implement:**
  - Unit: extend G3b fixture in `packages/semantic-query` (≥ 30 objects) — **unit only**.
  - Live: API helper that, for a model, returns `{ graph, dependencyEdges, provenance, displayMeshes }` where `displayMeshes` are from `buildD01DisplayMeshesMaybeCompare` / compile path, and graph nodes include the same `semanticOwner` ids as the meshes.
- **Tests:**
  - Unit fixture connectivity (non-gate).
  - **Live substrate smoke:** generate D01 meshes → every mesh `semanticOwner` exists in the model graph → `explain(owner)` non-empty for at least one generated Y/component.
- **Benchmarks:** Fixture build < 20 ms; live D01 mesh+graph assemble recorded (no hard fail yet).
- **Exit:** No SDI feature work proceeds until live substrate smoke is green in CI (geometry service may be optional-skip only when OCCT unavailable; then gate is `skipIf` — not a silent pass on demo meshes).

### SD0.3 — Query API bound to modelId (not global fixture)

- **Goal:** Scaffold §48 routes so handlers resolve graph from `modelId` / version store; remove “always `buildG3bFixture()`” as the product path.
- **Implement:** `apps/api` route table + typed clients in `api-client.ts`; shared `loadModelQueryContext(modelId)` used by explain/query/trace.
- **Tests:** Route registration; explain on unknown model → 404; explain on seeded live model → packet for a generated semantic id.
- **Benchmarks:** N/A.
- **Exit:** Designer-web clients always pass `modelId`; fixture is not the default server singleton for product routes.

---

# Phase SD1 — Semantic Projection Foundation

**Spec gate:** Selecting a Y in Three.js highlights it in the semantic graph and vice versa.

### SD1.1 — `GraphProjection` contract package

- **Goal:** Kernel-neutral `GraphProjection`, `GraphViewNode`, `GraphViewEdge`, `SemanticDepth`, `LayoutHints` (§31).
- **Implement:** `packages/graph-projection` with Zod schemas; nodes require `semanticId`, `semanticType`, `projectionRole`.
- **Tests:** Schema rejects missing `semanticId`; disposable RF id ≠ semantic id; depth enum D0–D4.
- **Benchmarks:** Serialize 1k-node projection < 10 ms.
- **Exit:** Package publishable; no React dependency.

### SD1.2 — Extend `SemanticSelection`

- **Goal:** Spec §50 selection model without breaking G8 sync.
- **Implement:** Evolve `selection-sync.ts`: add sources `graph | search | ai | history | sketch`; `secondaryIds`; optional `intent`; keep ≤100 ms sync invariant.
- **Tests:** Atomic sync across viewport/explorer/inspector/graph; regen preserve still works.
- **Benchmarks:** 10k select operations < 50 ms total in unit bench.
- **Exit:** `appSelect` / `appFocusGeometry` accept new sources.

### SD1.3 — Identity projection (no layout yet)

- **Goal:** Project selected object + direct 1-hop neighbours into `GraphProjection` (radius 1, entity/pattern nodes only).
- **Implement:** `projectCausalNeighbourhood(graph, focusIds, { radius: 1 })` in `graph-projection`.
- **Tests:** Focus node present; edges retain relationship ids; filter by relation types.
- **Benchmarks:** Radius-1 on fixture < 5 ms.
- **Exit:** Pure function usable by API and UI.

### SD1.4 — React Flow adapter (read-only)

- **Goal:** Render projection in designer-web; RF owns pan/zoom/node visuals only (§30).
- **Implement:** Add `@xyflow/react`; `sdi/GraphPane.tsx` + node/edge components for Entity/Pattern; map RF selection → semantic selection.
- **Tests:** Adapter unit: projection → RF elements round-trip `semanticId`; drag does not emit model commands.
- **Benchmarks:** Mount 200-node graph < 100 ms (jsdom/perf stub ok).
- **Exit:** Graph pane mounts beside viewport (collapsed by default) (§38).

### SD1.5 — Three.js ↔ graph selection sync (GATE)

- **Goal:** Bidirectional highlight via semantic IDs only (§49) on **pipeline-generated** meshes.
- **Implement:** Wire graph select → `appFocusGeometry`; viewport pick → projection focus + RF selected nodes; geometry highlight for multi-id sets. Session under test must load live D01 display meshes (same path as designer bootstrap), not `demo-meshes`.
- **Tests:** **Gate test** `sdi-sd1-gate.test.ts` (live substrate): pick generated Y `semanticOwner` → graph selects same id; graph select → viewport `highlightedIds` contains that owner. Demo-mesh-only variant is non-gating.
- **Benchmarks:** Sync latency ≤ 100 ms measured in session clock (`lastSyncAtMs`).
- **Exit:** SD1 gate green **only** with live substrate evidence.

---

# Phase SD2 — Explain Selection

**Spec gate:** User can select a generated component and understand immediate cause/effect without viewing the whole model.

### SD2.0 — Live explain/upstream on generated model (BLOCKING)

- **Goal:** Product explain/upstream/downstream read the live model graph; selected geometry ids from generated meshes resolve in that graph.
- **Implement:** Finish `loadModelQueryContext(modelId)`; seed/publish path that writes D01 semantic objects + relationships alongside mesh generation; delete or quarantine product use of process-global `g3b` for these routes.
- **Tests:** Integration: create model → generate D01 → `POST .../explain` with a mesh `semanticOwner` → `whyExists` non-empty; demo/fixture ids must not be required.
- **Benchmarks:** Explain on D01-scale ≤ 500 ms.
- **Exit:** **Hard block** — SD2.4 gate cannot merge without this green.

### SD2.1 — Multi-hop upstream / downstream queries

- **Goal:** `upstream(id, radius)`, `downstream(id, radius)` with typed edge filters (§14, §48).
- **Implement:** Extend `semantic-query` / `graph-projection` BFS with radius + relation allow-list; API handlers use `loadModelQueryContext`.
- **Tests:** Radius 0/1/2/∞ on unit graphs; live D01 radius-1 non-empty for generated component.
- **Benchmarks:** Radius 2 on 10k-edge synthetic graph < 20 ms.
- **Exit:** API routes `/models/:id/upstream`, `/downstream` are model-scoped.

### SD2.2 — Causal radius controls + projection modes

- **Goal:** Direct / Context / System / Model controls (§6); default Direct or Context; never default full model.
- **Implement:** Projection options + UI segmented control; Model mode requires explicit confirm when node count > N.
- **Tests:** Default radius; Model mode caps / warns; focus remains in `focusObjectIds`.
- **Benchmarks:** Context (r=2) projection < 50 ms on fixture.
- **Exit:** Expanding radius preserves prior focus ids.

### SD2.3 — Auto-layout (causal neighbourhood)

- **Goal:** Centred causal layout; selected node anchored (§33–§34).
- **Implement:** Start with Dagre or simple layered layout; store positions as layout prefs only.
- **Tests:** Deterministic layout for fixture seed; selected node near centre; expand adds nodes with limited displacement of existing (position delta budget).
- **Benchmarks:** Layout ≤ 200 nodes < 150 ms.
- **Exit:** No manual layout required for Explain Selection.

### SD2.4 — Explain Selection command + geometry highlight (GATE)

- **Goal:** Primary command computes smallest meaningful causal neighbourhood (§5) for a **pipeline-generated** part.
- **Implement:** Command palette entry + toolbar; calls model-scoped explain + neighbourhood projection; highlights affected geometry.
- **Tests:** **Gate:** load live D01 meshes → select generated part → Explain → graph shows cause chain without unrelated nodes; highlights match query downstream set. **Fails CI if only fixture/demo path is exercised.**
- **Benchmarks:** E2E live explain ≤ 500 ms; unit neighbourhood ≤ 250 ms.
- **Exit:** Product Test A path on system geometry (two interactions: select + Explain). Depends on SD2.0.

---

# Phase SD3 — Pattern Inspector

**Spec gate:** User can understand a pattern without seeing implementation operators.

### SD3.1 — Pattern summary cards (Level A/B)

- **Goal:** Pattern nodes show intent-first cards (§9–§10, §11 A–B).
- **Implement:** Lift `pattern-inspector.ts` into projection roles; RF custom node.
- **Tests:** Card fields present; operators absent at depth ≤ SYSTEM.
- **Benchmarks:** Render 50 pattern cards < 50 ms.
- **Exit:** Pattern readable at SYSTEM depth.

### SD3.2 — Semantic zoom levels C–E (data only)

- **Goal:** Projection attaches zoom-level payloads; UI reveals progressively (§11).
- **Implement:** `detailLevel: A|B|C|D|E` on view nodes driven by RF zoom or depth rail.
- **Tests:** Level thresholds; E includes operator bindings; C does not.
- **Benchmarks:** Switching detail level does not rebuild full graph (patch < 10 ms).
- **Exit:** Zoom changes content, not merely scale.

### SD3.3 — Enter pattern + breadcrumbs

- **Goal:** Enter pattern as semantic space; breadcrumb back restores context (§12–§13).
- **Implement:** Projection stack (`patternGraph(patternId)`); breadcrumb chrome; viewport camera/selection restore via UI prefs snapshot.
- **Tests:** Enter/back restores projection id + selection; nesting uses model containment not RF `parentId` as source of truth.
- **Benchmarks:** Enter pattern projection < 50 ms.
- **Exit:** Operators still hidden by default.

### SD3.4 — Pattern inspector GATE

- **Goal:** Meet SD3 gate without execution nodes.
- **Tests:** **Gate:** open Variable-Aperture-like pattern → see inputs/params/rules/affectors; no Operator nodes until depth EXECUTION or Level E.
- **Benchmarks:** N/A beyond SD3.1–3.3.
- **Exit:** SD3 gate green.

---

# Phase SD4 — Dependency Explorer

**Spec gate:** User can identify the minimum downstream system affected by a parameter change.

### SD4.1 — Upstream / downstream visual split

- **Goal:** Clear directional layout (§14).
- **Implement:** Layout hints `mode: 'dependency'`; upstream above/left, downstream below/right.
- **Tests:** Directional partitions disjoint except focus; dense fixture remains legible (max edge crossings heuristic optional).
- **Benchmarks:** Layout 200 nodes < 150 ms.
- **Exit:** Both directions readable in one view.

### SD4.2 — Filter lenses

- **Goal:** Patterns / Dependencies / Constraints / Fields / Fabrication / … (§37).
- **Implement:** Client-side filters on projection edges/nodes (not separate graphs).
- **Tests:** Each lens reduces node set; composing lenses is AND; empty lens shows empty-state not full model.
- **Benchmarks:** Filter toggle < 16 ms for 500 nodes.
- **Exit:** Lenses do not refetch full model.

### SD4.3 — Aggregate instance nodes

- **Goal:** `Y Components · 186 instances` aggregates (§35–§36).
- **Implement:** Clustering in projection; expand by region / family / rule / constraint / instance.
- **Tests:** Aggregate count correct; expand emits instance nodes with stable semantic ids; collapse restores aggregate.
- **Benchmarks:** Project 10k instances as aggregates < 30 ms; never mount 10k RF nodes.
- **Exit:** Graph does not explode on patterned instances.

### SD4.4 — Impact highlighting for parameter focus (GATE)

- **Goal:** Selecting/editing a parameter previews downstream set (§15 lite, full in SD5/SD8).
- **Implement:** Reuse `computeInvalidationSet` + geometry highlight.
- **Tests:** **Gate:** parameter node → minimum downstream set listed + highlighted in viewport.
- **Benchmarks:** Impact set compute < 20 ms on fixture.
- **Exit:** Product Test C path starts working.

---

# Phase SD5 — Why / What Controls This

**Spec gate:** User can ask why a generated dimension has its current value and receive an inspectable causal chain.

### SD5.1 — Human-readable value provenance

- **Goal:** “Why is Aperture 47 714 mm?” trace (§16).
- **Implement:** Extend explain packet with value steps (field → mapping → request → rationalise → actual); UI trace list.
- **Tests:** Ordered steps; each step links `semanticId`; missing provenance returns explicit incomplete state (not empty success).
- **Benchmarks:** Trace build < 20 ms.
- **Exit:** Why panel works from inspector + graph context menu.

### SD5.2 — Controlling parameters query

- **Goal:** `controllingParameters(objectId)` minimum control graph (§17, §48).
- **Implement:** Query + “What controls this?” action; inline parameter edit affordance (preview only).
- **Tests:** Returns drivers/limiters; excludes unrelated params.
- **Benchmarks:** < 20 ms on fixture.
- **Exit:** Product Test B satisfiable without EXECUTION depth.

### SD5.3 — Constraint path in Why chain

- **Goal:** Constraints appear as visible participants in traces (§24 partial).
- **Implement:** Include constraint nodes/edges in control graphs; status enum stub (`safe|approaching|at_limit|violating`).
- **Tests:** Constraint limiting a value appears in Why chain.
- **Benchmarks:** N/A.
- **Exit:** SD5 gate green with inspectable chain.

---

# Phase SD6 — Fields and Constraints

**Spec gate:** Selecting a field in the graph visualises its influence spatially.

### SD6.1 — Field graph nodes + dual selection

- **Goal:** Field as first-class node family (§23, §44).
- **Implement:** Projection role `Field`; selection sync both ways.
- **Tests:** Select field node → selection store primaryId is field; geometry owners marked secondary.
- **Benchmarks:** Sync ≤ 100 ms.

### SD6.2 — Three.js field overlay

- **Goal:** Scalar/contour/influence overlay in viewport (§23).
- **Implement:** Overlay layer in `three-scene` driven by field sample grid from API (start with analytic fixture field).
- **Tests:** Overlay mesh created/disposed; hidden when field deselected.
- **Benchmarks:** Overlay update 64×64 samples < 33 ms.
- **Exit:** Gate path for field selection → spatial viz.

### SD6.3 — Constraint nodes + threshold viz (GATE)

- **Goal:** Constraints visible in graph; threshold states in viewport (§24).
- **Implement:** Constraint node type; tint geometry by constraint state; inspect limits in inspector.
- **Tests:** **Gate:** select field → overlay visible; select constraint → affected geometry state colours.
- **Benchmarks:** State colour pass ≤ 100 ms for 1k meshes.
- **Exit:** SD6 gate green.

---

# Phase SD7 — AI Navigation (read-only)

**Spec gate:** AI can guide user to the relevant causal system without altering design.

### SD7.1 — Graph focus instruction schema

- **Goal:** AI returns structured focus ops, not prose-only (§20).
- **Implement:** `focusGraph`, `explainSelection`, `showUpstream`, `showDownstream`, `trace`, `enterPattern`, `showConstraints`, `showExecution` tool results → `GraphFocusCommand`.
- **Tests:** Commands are pure; applying them never calls ChangeSet mutate APIs.
- **Benchmarks:** Apply focus command < 50 ms after query returns.

### SD7.2 — Designer-web AI → SDI bridge

- **Goal:** AI panel can drive depth rail + projection + selection.
- **Implement:** Map tool results into session actions.
- **Tests:** Golden transcripts for 5 example prompts in §20.
- **Benchmarks:** Navigation latency budget recorded (network excluded in unit tests).
- **Exit:** No mutations yet (enforced by test that mutate tools are unreachable in this mode).

### SD7.3 — AI navigation GATE

- **Tests:** **Gate:** “Show me what controls these members” → selection + control graph projection; model hash unchanged.
- **Exit:** SD7 gate green.

---

# Phase SD8 — AI Graph Changes

**Spec gate:** User can see exactly how an AI proposal modifies semantic logic before regeneration is committed.

### SD8.1 — Provisional ChangeSet projection

- **Goal:** Proposed nodes/edges dashed; removed faded; changed before/after (§46, §19).
- **Implement:** `projectChangeSetDelta(base, changeSet)` → projection annotations.
- **Tests:** Before / intervention / after partitions; no RF persistence of proposal.
- **Benchmarks:** Delta project < 50 ms for 100-op ChangeSet.

### SD8.2 — Impact preview panel

- **Goal:** Full §15 impact card (counts, validation, reveal paths).
- **Implement:** Extend `impactPreview` from ai-interface; wire UI.
- **Tests:** Counts match invalidation set; unchanged categories listed.
- **Benchmarks:** Impact compute < 50 ms fixture.

### SD8.3 — Provisional graph + accept/reject (no fake What-if)

- **Goal:** Proposal visible as provisional graph; accept runs ChangeSet accept; reject drops provisional projection (§46). Viewport may dim current meshes, but this subphase does **not** claim §18 What-if.
- **Implement:** Reuse accept API; provisional RF styling; optional dimming of current layer only.
- **Tests:** Accept mutates model; reject leaves model unchanged; assertion that no “what-if preview meshes” are advertised without SD8.4.
- **Benchmarks:** Accept path D01-scale recorded.
- **Exit:** Tests C (impact card) + D (AI delta) paths; **not** Test C “before editing” via regenerated preview.

### SD8.4 — What-if session via transient regenerate (GATE for §18)

- **Goal:** Full §18: fork transient state → invalidate → run preview → show **regenerated** ghost meshes → evaluate constraints → report deltas → accept merges / reject discards.
- **Implement:** API `what-if` (or draft branch) session: clone model branch in version store; apply parameter/ChangeSet draft; re-run D01/display-mesh pipeline into a preview artifact set; return preview meshes + impact + validation; designer renders preview in ghost channel. **Forbidden:** cloning current Three.js buffers and calling it What-if.
- **Tests:** **Gate:** change `max` (or equivalent) → preview mesh extents/ids differ from baseline where expected → constraints report → reject restores baseline model hash → accept commits. CI uses geometry pipeline (skipIf OCCT down — not demo-mesh substitute).
- **Benchmarks:** What-if preview regenerate D01-scale budget recorded (target < 5s local OCCT; tighten later).
- **Exit:** §18 satisfied; fake-ghost risk eliminated by test.

---

# Phase SD9 — Sketch Semantic Integration

**Spec gate:** User sketches a region, requests a modification, and sees the proposed semantic intervention graphically before applying it.

### SD9.1 — SketchIntent capture

- **Goal:** Sketch as first-class spatial intent (§22).
- **Implement:** Viewport sketch tool → `SketchIntent` semantic object (draft); hit region → affected cell ids query.
- **Tests:** Hit region resolution deterministic on fixture dome/cells.
- **Benchmarks:** Hit test 1k cells < 20 ms.

### SD9.2 — SketchField + proposed composition

- **Goal:** Sketch → Distance Field → compose onto pattern; provisional graph (§22–§23).
- **Implement:** AI/proposal path creates provisional nodes; projection shows composition edge.
- **Tests:** Provenance links sketch → field → pattern.
- **Benchmarks:** Proposal projection < 50 ms.

### SD9.3 — GATE

- **Tests:** **Gate:** sketch + “more generous here” → provisional SketchDistanceField composition visible before apply.
- **Exit:** SD9 gate green; Pencil/tablet sheet behaviour deferred to SD9.4 if needed.

### SD9.4 — Tablet sheet chrome (optional slice)

- **Goal:** §52 tablet: bottom semantic sheet; sketch without graph occupying viewport.
- **Tests:** Layout breakpoints; graph collapsed by default on narrow widths.
- **Benchmarks:** N/A.
- **Exit:** Responsive shell matches §52 desktop/tablet split.

---

# Phase SD10 — Execution Depth

**Spec gate:** Advanced user can trace a semantic component to deterministic geometry generation.

### SD10.1 — Execution DAG projection

- **Goal:** Operator nodes + edges from `execution-dag` / PIR (§28).
- **Implement:** `executionGraph(objectId)` query + Level E / D4 projection.
- **Tests:** Default depths omit operators; EXECUTION includes them; hashes/timings optional fields nullable.
- **Benchmarks:** Build execution projection < 50 ms.

### SD10.2 — Diagnostics overlays

- **Goal:** cached / recomputed / invalidated / failed / warning / expensive (§29).
- **Implement:** Edge/node badges from execution records.
- **Tests:** State encoding non-colour-only (glyph + label) (§51).
- **Benchmarks:** Overlay patch < 16 ms.

### SD10.3 — Trace to OCCT (GATE)

- **Goal:** Path design intent → … → operator → OCCT/kernel result (§55 Test E).
- **Implement:** Join provenance + compile mesh `pirOperationId` / `kernel` already on display meshes.
- **Tests:** **Gate:** from selected Y, EXECUTION depth shows operator chain ending at kernel tessellation/measure identity.
- **Benchmarks:** Trace join < 30 ms.
- **Exit:** SD10 gate green; operators still not default UI (§54).

---

# Phase SD11 — History + Variants

**Spec gate:** Historical modification and intentional variant cannot be confused in either UI or data.

### SD11.1 — Graph delta history

- **Goal:** History answers “what happened?” with graph + geometry deltas (§27).
- **Implement:** History events → delta projection; distinct from variants in schema.
- **Tests:** Selecting history event does not change active variant; restore is explicit.
- **Benchmarks:** Delta for adjacent versions < 50 ms.

### SD11.2 — Variant view

- **Goal:** Active alternative selection without rewriting history (§26).
- **Implement:** Variant groups UI; compare semantic + geometry.
- **Tests:** Schema/UI labels enforce History ≠ Variant; switching variant is not a history append.
- **Benchmarks:** Variant switch projection < 100 ms.

### SD11.3 — GATE

- **Tests:** **Gate:** automated test that variant switch and history scrub produce different event types and UI copy.
- **Exit:** SD11 gate green.

---

# Phase SD12 — Scale and Performance

**Spec gate:** UI remains responsive by projecting neighbourhoods, not full models.

### SD12.1 — Synthetic graph generators

- **Goal:** Deterministic graphs at 1k / 10k / 100k semantic objects (§53 SD12).
- **Implement:** Generator in `graph-projection` or `semantic-query` test fixtures.
- **Tests:** Size assertions; connectivity sanity.
- **Benchmarks:** Generation time recorded (not a product budget).

### SD12.2 — Neighbourhood projection benchmarks

- **Goal:** Measure projection query, layout, React render proxy, highlight, causal expansion, AI nav (§53).
- **Implement:** Bench suite with thresholds:

| Scale | Projection r≤2 | Layout | Highlight |
|---|---|---|---|
| 1k objects | ≤ 20 ms | ≤ 50 ms | ≤ 50 ms |
| 10k objects | ≤ 50 ms | ≤ 150 ms | ≤ 100 ms |
| 100k objects | ≤ 100 ms | ≤ 300 ms (≤ 500 nodes projected) | ≤ 150 ms |

- **Hard rule:** Never project > 500 nodes without aggregate clustering.
- **Exit:** CI bench job (or nightly) fails on regression > 20%.

### SD12.3 — Caching + memoisation

- **Goal:** Derived graph caches, collapsed patterns, targeted subscriptions (§35).
- **Implement:** Memo keys on `(modelVersion, focusIds, radius, lenses, depth)`; RF node memo.
- **Tests:** Cache hit avoids recompute; model version bump invalidates.
- **Benchmarks:** Cache hit path < 2 ms.
- **Exit:** 100k model interactive under budgets via neighbourhood-only projection.

---

## 3. Shell / UX Subsystem (parallel track)

These cut across phases; schedule earliest useful slice beside the matching SD phase.

| Slice | Earliest phase | Spec |
|---|---|---|
| Combined viewport + collapsible graph pane | SD1.4 | §38 |
| Depth rail FORM→EXECUTION | SD2.4 | §40 |
| Overlay “peek” causal strip | SD2.4 | §39 |
| Command palette (SDI commands) | SD2.4 | §42 |
| Global semantic search | SD4.2 | §41 |
| Graph edit mode (explicit) | SD8.1 | §32, §45 |
| Accessibility pass | SD3.1 + SD12 hardening | §51 |
| Visual language polish | SD3–SD4 | §43–§44 |

---

## 4. Suggested PR Sequencing (first 8 weeks)

| Week | Wave | Land |
|---|---|---|
| 1 | 0 | SD0.1–0.3 live substrate smoke |
| 2 | 0 | SD2.0 model-scoped explain/upstream on generated owners (**block**) |
| 3 | 1 | SD1.1–1.3 GraphProjection + selection + neighbourhood |
| 4 | 1 | SD1.4–1.5 **(SD1 gate on live meshes)** |
| 5 | 1 | SD2.1–2.2 causal radius |
| 6 | 1 | SD2.3–2.4 **(SD2 gate)** + depth rail + Explain |
| 7 | 1 | SD3.1–3.2 |
| 8 | 1 | SD3.3–3.4 **(SD3 gate)**; start SD4 |

Later: SD4–SD5 finish Wave 1; SD6+ Wave 2; SD8.4 only with SD8 (Wave 2/3). SD12 generators may start in week 4.

---

## 5. Stress Test Against Spec Deliverables

Legend: **Covered** / **Partial** / **Deferred** / **Gap** (plan must fix).

### 5.1 Spec sections §1–§58

| Spec area | Plan coverage | Notes |
|---|---|---|
| §1 Product goal questions | Covered | Spread across SD2–SD10 commands |
| §2 Depths D0–D4 | Covered | Depth rail SD2.4; enforcement in projection |
| §3 Interaction model | Covered | Geometry-first retained; Explain descends |
| §4 Geometry first + sync | Covered | SD1.5; measure remains separate |
| §5 Explain Selection | Covered | SD2.4 |
| §6 Causal radius | Covered | SD2.2 |
| §7 Relationship types | Covered | SD0.1 bridge (critical) |
| §8 Edge presentation | Partial | Basic labels SD1–SD2; zoom-dependent edge chrome in SD3.2 |
| §9–§11 Pattern view / cards / semantic zoom | Covered | SD3 |
| §12–§13 Enter pattern / nested graphs | Covered | SD3.3; RF parentId presentation-only |
| §14 Dependency view | Covered | SD4.1 |
| §15 Impact preview | Covered | SD4.4 lite + SD8.2 full |
| §16 Why? | Covered | SD5.1 |
| §17 What controls this? | Covered | SD5.2 |
| §18 What if? | Partial | Ghost preview in SD8.3; full transient fork may need model-layer what-if branch — call out below |
| §19 Before/Intervention/After | Covered | SD8.1 |
| §20 AI navigator | Covered | SD7 |
| §21 AI graph editor | Covered | SD8; ChangeSets only |
| §22 Sketch integration | Covered | SD9 |
| §23 Spatial fields | Covered | SD6 |
| §24 Constraints visible | Covered | SD5.3 + SD6.3 |
| §25 Composition vs specialisation | Partial | Needs explicit projection roles in SD3.1 / SD4.2 — add acceptance checks |
| §26 Variants | Covered | SD11.2 |
| §27 History | Covered | SD11.1 |
| §28–§29 Execution + diagnostics | Covered | SD10 |
| §30 React Flow decision | Covered | SD1.4 boundary tests |
| §31 Projection architecture | Covered | SD1.1 |
| §32 Read-only default | Covered | SD1.4; edit mode SD8 |
| §33–§34 Layout + stable mental map | Covered | SD2.3; expand displacement tests |
| §35–§36 Performance + aggregates | Covered | SD4.3 + SD12 |
| §37 Filter lenses | Covered | SD4.2 |
| §38 Combined view | Covered | SD1.4 shell |
| §39 Overlay peek | Covered | Shell track @ SD2.4 |
| §40 Depth navigation | Covered | Shell track @ SD2.4 |
| §41 Search | Covered | Shell track @ SD4.2 |
| §42 Command palette | Covered | Shell track @ SD2.4 |
| §43–§44 Visual language / node types | Partial | Incremental node families; full set by SD10 |
| §45 Graph editing gestures | Covered | SD8 + explicit edit mode |
| §46 AI proposed graph changes | Covered | SD8 |
| §47 Provenance | Partial | Seed in explain; full panel SD5/SD10 |
| §48 Required queries | Covered | SD0.3 scaffold → filled SD2–SD11 |
| §49 Sync contract | Covered | SD1.5 |
| §50 Central selection | Covered | SD1.2 |
| §51 Accessibility | Partial | Explicit hardening pass noted; not a full phase |
| §52 Mobile/tablet | Partial | SD9.4 optional; desktop-first |
| §53 Phases SD1–SD12 | Covered | This document |
| §54 Non-goals | Covered | Enforced via negative tests (no full-model default, no RF ownership, no operators default) |
| §55 Product benchmarks A–F | Covered | Mapped below |
| §56–§58 Principles | Covered | Architecture section |

### 5.2 Phase gates (§53)

| Gate | Subphase | Stress result |
|---|---|---|
| SD1 sync Y ↔ graph | SD1.5 | Covered |
| SD2 cause/effect without full model | SD2.4 | Covered |
| SD3 pattern without operators | SD3.4 | Covered |
| SD4 minimum downstream of param | SD4.4 | Covered |
| SD5 why dimension | SD5.3 | Covered |
| SD6 field → spatial viz | SD6.3 | Covered |
| SD7 AI nav no mutate | SD7.3 | Covered |
| SD8 AI proposal before commit | SD8.3 | Covered |
| SD9 sketch → provisional composition | SD9.3 | Covered |
| SD10 trace to OCCT | SD10.3 | Covered |
| SD11 history ≠ variant | SD11.3 | Covered |
| SD12 1k/10k/100k responsive | SD12.2–12.3 | Covered |

### 5.3 Product benchmarks (§55)

| Test | Plan path | Stress result |
|---|---|---|
| **A** Why does this exist? (≤2 interactions) | Select + Explain (SD2.4) | Covered |
| **B** What controls size? (no execution) | What controls this (SD5.2) at ≤ SYSTEM/LOGIC | Covered |
| **C** Understand change before edit | SD4.4 + SD8.2 impact | Covered |
| **D** Why AI modification proposed | SD8.1 before/intervention/after | Covered |
| **E** Trace intent → pattern → rule → operator → OCCT | SD3 + SD5 + SD10.3 | Covered |
| **F** Modify procedural behaviour without low-level wires | SD8 edit via ChangeSets + pattern compose; not RF wiring | Covered |

### 5.4 Required queries (§48) ownership

| Query | Introduced | Stress |
|---|---|---|
| `explain` | exists → SD2.4 UI | Covered |
| `upstream` / `downstream` | SD2.1 | Covered |
| `controllingParameters` | SD5.2 | Covered |
| `patternsAffecting` | SD3.1 | Covered |
| `constraintsAffecting` | SD5.3 | Covered |
| `operatorsGenerating` | SD10.1 | Covered |
| `geometryAffectedBy` | SD1.5 / SD4.4 | Covered |
| `semanticObjectsForGeometry` | SD1.5 (rep → owner; sub-element later) | Partial — owner-level now; sub-element pick not required for gates |
| `trace` | exists → SD5/SD10 | Covered |
| `impact` | SD8.2 | Covered |
| `patternGraph` | SD3.3 | Covered |
| `executionGraph` | SD10.1 | Covered |
| `history` | SD11.1 | Covered |
| `provenance` | SD5.1 / SD10 | Covered |

### 5.5 Non-goals (§54) — negative tests to add

| Non-goal | Enforcement |
|---|---|
| No Grasshopper clone / unrestricted VPL | Graph edit mode off by default; ambiguous drops require chooser (SD8/§45) |
| No second semantic model in RF | Adapter tests: RF id changes do not change model hash |
| No geometry state in RF | Projection has no vertex buffers |
| No persistence of graph coordinates as design | Layout prefs key separate (`workspace.huds` / `workspace.graphLayout`) |
| No automatic full-model graph | Default radius; Model mode warning (SD2.2) |
| No opaque AI rewiring | Provisional projection mandatory (SD8) |
| No direct B-rep edit via wires | Reject commands that bypass ChangeSet |
| Operators not default | Depth/zoom guards (SD3.4, SD10.1) |

### 5.6 Residual gaps (non fixture / non What-if)

Fixture-only and fake-What-if risks are **closed by policy** (Live substrate hard rule + SD0.2/0.3 + SD2.0 + SD8.4). Remaining polish gaps:

1. **Composition vs specialisation visuals (§25)** — acceptance checks in **SD3.1**; **SD4.2b** composition lens.
2. **Edge presentation at zoom (§8)** — fold into **SD3.2** (label / arrow / glyph levels).
3. **Accessibility (§51)** — **SD3.1a** keyboard + non-colour encoding; **SD12.4** a11y audit.
4. **Sub-element geometry↔semantic** — owner-level for SD1; **SD2.5** optional featurePath on pick when `subElementPaths` exist (no GPU ID buffer).
5. **Node family completeness (§44)** — checklist on SD10 exit (Field, Constraint, Affector, SketchIntent, Operator, AI Change).

### 5.7 Stress-test verdict

| Question | Answer |
|---|---|
| Does the plan implement the proposed SDI phases? | **Yes** — SD1–SD12 preserved with implementable subphases |
| Are gates testable? | **Yes** — each has a named gate test; product gates require live D01 substrate |
| Are product tests A–F reachable? | **Yes** — Test C preview completeness requires SD8.4 regenerate |
| Fixture-only risk? | **Removed** if Live substrate rule enforced in CI |
| Fake What-if risk? | **Removed** — SD8.3 cannot claim §18; SD8.4 requires pipeline regenerate |
| Out of scope correctly? | GPU pick buffers, Grasshopper VPL, full-model graph — excluded |

---

## 6. Definition of Done (v1.3 SDI MVP)

Ship-quality “architect can look into geometry” MVP = **through SD5 + shell chrome**, all product gates on **live D01-generated geometry**:

- SD0 complete (vocab + unit fixture + **live substrate smoke** + model-scoped routes)
- SD1 gate green (sync on generated meshes)
- SD2.0 green (explain/upstream on `modelId`, not global fixture)
- SD2 gate green (Explain Selection on generated part)
- SD3–SD5 gates green on same substrate
- Depth rail + command palette + collapsible graph pane
- Negative tests for §54 non-goals
- CI rule: gate jobs fail if they only touch `demo-meshes` / process-global G3b
- Benches at 1k objects green (full 100k can trail in SD12)

§18 What-if is **not** in MVP; when SD8 ships, SD8.4 regenerate gate is mandatory.

Everything from SD6–SD11 is world-leading completion; SD12 is the scalability certification.

---

## 7. Locked decisions

1. **Layout:** Dagre (or simple layered) first for SD2; ELK for hierarchical pattern graphs in SD3.
2. **Query vs projection:** Neighbourhood BFS / §48 queries live in `semantic-query`; RF-agnostic view-model mapping in `graph-projection`.
3. **What-if:** API transient branch + **pipeline regenerate** for preview meshes (SD8.4). Client-only ghost clones are forbidden as §18 evidence.
4. **Live vs fixture:** Model-scoped live graph + generated meshes from SD0.2/SD2.0; fixtures are unit-only and never product-gate evidence.
