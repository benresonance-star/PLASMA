# ADR-003: Representations are derived

## Status

Accepted (G0.2)

## Context

One semantic entity may have many representations (B-rep, render mesh, fabrication part, analysis abstraction).

## Decision

1. Representation records include owner semantic ID, source snapshot, compiler version, status, and artifact hash/location.
2. Three.js meshes are disposable render representations.
3. A previous valid representation may be shown as `STALE` after invalidation; stale artifacts are never exported as current without explicit action.
4. Worker results are never treated as published until a `PublicationManifest` exists (v1.2).

## Consequences

- `representation-core` and `artifact-core` own metadata; object bytes live in the artifact store.
- Fabrication-ready requires validation gates, not mere geometry generation.
