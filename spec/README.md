# Plasma Spec System v1

This directory is the canonical machine-readable specification source for Plasma.

## Format

Files use the **JSON-compatible subset of YAML 1.2**. JSON is valid YAML 1.2, while Node can parse it without an additional parser dependency. Spec System v1 intentionally rejects non-JSON YAML syntax.

## Authority

- `/spec` is canonical specification state.
- `/generated/spec-system` is derived.
- `apps/system-atlas-preview/atlas.json` and `repository-evidence.json` are generated projections.
- The existing rich `plasma-spec.html` remains a checked legacy projection during migration; its embedded loop manifest must agree with canonical capability records.

## Status

Architecture, specification, implementation, verification and release are independent axes. Readiness is derived by the compiler.

## Architectural documentation and project-grounded editorial intelligence

- `PLS-DOC-01` is the first-class documentation contract. It distinguishes governed authored document intent from building truth and derived 2D linework. It requires revision coherence, stable semantic anchors, approved exceptions and immutable issued packages.
- `PLS-22` is the documentation capability; `PLS-DOM-DOC` is its optional domain pack.
- `PLS-SLICE-DOC-01` is the focused slab–stud-wall–roof-truss plan/section/detail MVP spanning 1:1 through 1:200; ten executable acceptance tests are specified, not yet run.
- `PLS-CONT-01` and `PLS-23` define project-grounded, non-destructive editorial variation and cross-view continuity inspired by InterPositive; deterministic and human-governed first, optional learned assistance later.
- The previously defined Minimum Trusted Building Loop now requires a coherent model-linked plan/section before claiming completion.

All of these remain not started/unverified in the tracked readiness axes. No new kernel primitive, independent 2D building authority, runtime feature or certified performance is implied.

## Commands

```sh
pnpm spec:build
pnpm spec:check
```

`spec:check` validates identity, status values, hard dependency cycles, dependency direction, research isolation, exact-fallback rules, legacy manifest drift and generated-output drift.
