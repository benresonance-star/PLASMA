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

## Commands

```sh
pnpm spec:build
pnpm spec:check
```

`spec:check` validates identity, status values, hard dependency cycles, dependency direction, research isolation, exact-fallback rules, legacy manifest drift and generated-output drift.
