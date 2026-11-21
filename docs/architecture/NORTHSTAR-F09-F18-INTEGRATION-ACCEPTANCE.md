# Plasma Northstar — route to an integrated professional BIM platform

**Decision:** one authoritative, versioned design graph with multiple coordinated representations. Loft remains the exact geometry engine, Build contributes construction intelligence, and Plasma governs identity, changes, evidence, human/AI actions and the work environment.

**Status as of 21 November 2026:** F01–F09 are bounded tested slices; F10 is a scoped native OpenCascade.js parity test under qualification. None constitutes a hotel-scale BIM release.

## Current versus concept benchmark

The reference Northstar image is the Riverside Hotel spatial interface. Its live Gaussian city, eight-storey hotel, assembly, documentation, AI evidence and full lifecycle Worldline are conceptual. A faithful product needs these to be **real, queryable, editable and causally synchronized**, not just visually similar.

- **Place** must handle site capture, cadastral/survey coordinates, terrain, measured confidence, photo/video, drone and 3D Gaussian splats, all registered in coordinate frames and dated. Every site overlay must indicate observed, inferred or proposed origin.
- **Design** must be a single BIM model with selectable exact topology, assembly levels, fragments, parametric family editors, multi-viewport/detail editing, plans/sections and fabrication views. Selection must remain stable across regeneration and LOD.
- **Reason** must show actual governing intents, constraints, alternatives, evidence, sources, change impacts, unresolved conflicts, and human/AI decision provenance.
- **Worldline** must show revision-persistent, multi-track Place → Design → Validate → Construct → Operate evidence, changes, forks and accepted decisions. The UI must never imply that a session log is a construction record.
- **Mobile** must offer deliberate Place/Design/Reason focus views, picking, annotations, review and inspection. Heavy modelling and high-volume scene compilation may remain desktop/worker-bound.

## Engineering increments and acceptance gates

| Stage | Work | Required proof and UI snapshot | Status |
|---|---|---|---|
| F01 | Import Build + Loft source identities into the Plasma semantic graph | No silent component correspondence or identity duplication | Scoped preview implemented |
| F02 | Typed parameter proposals, source hash and branch guard | Linked impact list, fail closed on stale or unbound sources | Scoped preview implemented |
| F03 | Single rectangle/extrude geometry adaptation and spatial preview | Source-bound geometry preview, explicit exact-adapter label | Scoped preview implemented |
| F04 | Hosting and construction relationship audit | Detect missing/broken hosts; no engineering certification | Scoped audit implemented |
| F05 | Source-derived 1:5 material section graphics | Before/after drawing changes; not construction-issued | Scoped SVG study implemented |
| F06 | Local image-to-XY control-point fit | Residual RMS, no false survey/georeference claim | Scoped 2D fit implemented |
| F07 | Bounded real causal graph traversal | No invented constraint/evidence edges | Scoped trace implemented |
| F08 | Hotel readiness report | Block release until genuine tests and schema validation exist | Blocked-gate report implemented |
| F09 | Versioned source workspace, exact-adapter geometry+section review, explicit accept/discard | One optimistic-concurrency event; stable IDs and reproducible before/after, mobile review | Focused CI and browser screenshots passed |
| F10 | Real native OpenCascade.js B-rep comparison for explicitly supported Loft feature | Native constructive service, topology owner, volume and bounds parity; no fallback | In progress in this PR |
| F11 | Native Loft feature-tree/part/assembly adapter, incremental dependency engine, robust persisted B-reps | Actual Loft G110 feature corpus, Boolean lineage, topology reconciliation, undo/redo and benchmarks | Open |
| F12 | Canonical Build construction compiler: walls, roofs, windows, joins, cladding, openings, assemblies, services | One accepted window edit propagates to hosts, penetrations, framing, quantities and analysis; rule failures block commit | Open |
| F13 | Full associative documents and details, sheet index, dimensions and callout identity | Change façade window → plan, section, 1:5 weather detail and material schedule update within one revision | Open |
| F14 | Reality registration and georeferenced spatial data | Surveyed transform + uncertainty, drone/video/point clouds and Gaussian splats correctly co-located with design | Open |
| F15 | Governed multi-agent causal changes | Planning/structure/weatherproofing/fitout agents propose explainable and independently validated changes; no autonomous unreviewed publication | Open |
| F16 | Consolidated Northstar workflow and professional UX | Native selection, contextual edit gizmos, drawing split views, assembly tree, multi-object edits, keyboard/pen/touch, mobile QA | Open |
| F17 | Hotel performance and IFC4X3 exchange | Real 8-storey model, thousands of components, latency/memory benchmarks, IFC schema round-trip, partial regen and drawing identity | Open |
| F18 | Release hardening | Physical Windows and iPhone, offline/recovery, migrations, security, collaboration, regression screenshots and complete green release gate | Open |

## The acceptance fixture

Use one **real** medium-scale hotel test project, not a synthetic thumbnail, at F11 onwards. Select a guestroom corner façade/window assembly and issue a controlled change from a human or governed agent:

1. Select a room, wall and window; inspect actual site and building coordinate frames.
2. Change window width and thermally broken frame option, preserving semantic identity.
3. Preview edited exact B-rep, connection details and constructor intents.
4. Recompute host wall opening, lintel/fire/acoustic/weather/thermal constraints and quantities.
5. Regenerate plans, elevations, sections, 1:5 details and schedules with stable annotation IDs.
6. Trace causal impacts across embodied carbon, energy, fire egress, cost and site constraints; indicate unverified calculations.
7. Review and accept to a new project head, capturing human/agent provenance and event evidence in Worldline.
8. Compare branch versions, reject/stash alternatives, restore and round-trip IFC with independent tools.

This is the **end-to-end definition of functional integration**. A realistic UI without that chain is only a shell.

## Release guardrails

- No uncontrolled writes: every accepted transaction checks the expected branch head, source integrity, identity mapping and compiled evidence; a stale preview never commits.
- Do not call a source bundle update a published building model. F09 explicitly accepts only source data; a canonical graph authority migration is necessary at F11/F12.
- No mock substitute may pass native OCC, surveyed-place, verified AI, IFR/IFC, weatherproofing/structural or hotel-scale performance gates.
- Evidence must come from actual program outputs and tested browser screenshots. Synthetic QA fixtures are always labelled.
- No paid deployment and no main merge during iterative work; review staged PRs first.

## Suggested implementation sequence after F10

Prioritize **F11/F12 together** to give Plasma one coherent construction-parametric object, then **F13** for associative documents, followed by **F14** for place-grounded reality, **F15/F16** for governed reasoning and adaptive UI, and **F17/F18** for scale and release. UI progress continues in each stage, not as a final skin.

The next meaningful Northstar screenshot should show a selected **real** Loft/BIM façade assembly with true B-rep component picking, a persistent 1:5 detail linked to the same parameter and an identifiable transaction in Worldline—not another static hotel illustration.
