# Atlas comprehension surface — first implementation

Atlas is a **whole-system understanding surface**, not a set of unrelated dashboards. It is a presentation projection of canonical `/spec` records; it never decides, verifies or modifies canonical world state.

## What is implemented

- **Stable ten-system map** at `#overview`. All ten components are always present, including Documentation, Differential Compute and Editorial Continuity. Selecting a system opens its existing authoritative specification/relationship/evidence Inspector.
- **Five architectural lenses** share the same spatial arrangement: Architecture, Data & Authority, Implementation, Dependencies, Decisions & Evidence. A lens changes emphasis and explanation **only**. Even dimmed components remain visible and selectable. Lens choice is remembered locally.
- **Wall-thickness walkthrough** is a five-step *illustrative* explanation of proposal, acceptance, checks, candidate resolution and derived publication. It highlights affected planes but does not claim an executing end-to-end workflow. Illustrative stages are expressly labelled.
- **Inspectable declared boundaries** are keyboard-addressable targets in the map (or via the expandable cross-system contract ledger). Each boundary's Inspector exposes payload, authority semantics, associated contract and failure behavior.
- **Five primary workspaces** (Map, Flows, Assure, Library, Council) replace ten competing header tabs. A collapsible left-hand **All detailed views** menu retains every old route and its records.
- **Integrated rationale**: the system Inspector summarizes why the component exists and a leading strength/risk, backed by the canonical `spec/references/catalog.yaml`; the full reference card remains one click away.
- **Readable layout**: intentional mobile horizontal panning instead of auto-shrinking the diagram; larger system and inspector type; less header clutter.

## Integrity rules

1. Map components and declared connections come from `atlas.json`, which is generated from the canonical specification. Do **not** invent diagram edges to improve its appearance.
2. The reference library (`references.json`) and Architecture Council (`council.json`) remain generated projections, not independently edited front-end state.
3. Lens choice and wall walkthrough state are **presentation state only**. Do not add them to the authoritative event log or infer implementation status from a UI highlight.
4. Architecture status is not verification status. An installed dependency is not evidence that an end-to-end feature works. Council reviews that have not run remain explicitly unexecuted.
5. Existing routes such as `#contracts/parametric-wall`, `#references/technology/opencascade`, and `#integration/link/…` remain valid for external links and source evidence references.
6. Relationship hit targets and all lens/trace controls must be keyboard operable; legends must not rely on colour alone.

## Verification

`node apps/system-atlas-preview/atlas-validate.mjs` checks the generated records. `node apps/system-atlas-preview/atlas-smoke.mjs` covers the five-workspace shell, all ten system nodes, stable node coordinates across lens changes, the explanatory wall trace, inspectable relationship links and the unchanged deep-detail routes.

## Deferred — not claimed implemented

- A validated natural-language explanation engine that automatically composes arbitrary multi-hop flows from typed dependencies and proven runtime edges.
- A dynamically computed end-to-end change-impact traversal across every dependency and external service.
- Evidence freshness overlays with independent repository checkpoint reconciliation across all components.
- Responsive topology-preserving scene-layout optimization and minimap navigation for small screens.

These need their own contracts and tests; they should not be simulated as completed by hardcoded illustrative sequences.
