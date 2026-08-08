# ADR-001: Semantic model is the source of truth

## Status

Accepted (G0.2)

## Context

SPDS v1.2 requires that design intent live in a versioned semantic parametric graph, not in UI meshes, OCCT B-reps, or FEM meshes.

## Decision

1. All meaningful design objects have stable semantic IDs and typed envelopes.
2. Geometry, render meshes, analysis meshes, and fabrication artifacts are **derived representations**.
3. Business logic must not depend on Three.js object IDs, triangle indices, or OCCT transient topology IDs.
4. UI and workers may cache derived artifacts but must re-bind to semantic IDs after regeneration.

## Consequences

- Packages under `packages/` remain kernel- and renderer-neutral.
- Only `services/geometry-occt` may import OCCT APIs.
- Publication requires manifests that bind semantic snapshot hashes to derived artifact hashes (v1.2).
