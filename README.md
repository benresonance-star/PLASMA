# Plasma / SPDS repository

## Current Plasma specification

**Plasma Spec System v1** is now the canonical specification source under [`/spec`](spec/). Atlas v0.10.2, readiness/dependency reports and the generated Spec System view are derived from that graph. The existing [Plasma / Foundry v0.4.29](apps/system-atlas-preview/plasma-spec.html) rich HTML specification remains a checked legacy projection during migration. [PLS-19 / PLS-WALL-01@0.1.0](apps/system-atlas-preview/wall-contract.json) remains unproven; PLS-20 remains deferred research; and [PLS-21 / PLS-DIFF-01@0.1.0](apps/system-atlas-preview/differential-contract.json) remains deferred, non-authoritative and not started.

## First-class architectural documentation (specified, unimplemented)

The canonical Spec System now defines [PLS-DOC-01](spec/contracts/PLS-DOC-01/contract.yaml) and [PLS-22](spec/capabilities/PLS-22.yaml): authored drawing/view/detail/annotation/issue intent is first-class transaction-governed state; generated vector linework remains derived. [PLS-SLICE-DOC-01](spec/slices/multiscale-building-documentation/slice.yaml) specifies one slab–stud-wall–roof-truss plan/section/detail workflow at 1:1, 1:2, 1:5, 1:10, 1:20, 1:50, 1:100 and 1:200, with explicit documentation continuity and acceptance tests.

[PLS-CONT-01](spec/contracts/PLS-CONT-01/contract.yaml) and [PLS-23](spec/capabilities/PLS-23.yaml) specify a project-grounded, reversible editorial-continuity methodology inspired by Ben Affleck's InterPositive. Deterministic changes, cross-view checks, source-linked proposals and human approval come first; learned predictions/captions are optional, non-authoritative and never satisfy engineering or publication gates alone.

**These records are architecture/specification changes only.** The wall capability, first-class documentation, multiscale slice and editorial intelligence remain unimplemented/unverified until their applicable acceptance gates pass.

## Historical SPDS engineering baseline

**Spec:** [SPEC/SPDS_v1.2_build_candidate_spec.md](SPEC/SPDS_v1.2_build_candidate_spec.md)  
**Status:** v1.2 Build Candidate — greenfield monorepo (G0.1)

## Prerequisites

- Node.js ≥ 22
- pnpm 9.15.9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker Desktop (Postgres + MinIO via Compose)

If npm/pnpm TLS fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (corporate CA), set:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
```

## Commands

```powershell
$env:NODE_OPTIONS="--use-system-ca"
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm spec:build   # regenerate projections from /spec
pnpm spec:check   # fail on schema/dependency/projection drift
pnpm verify

docker compose up -d   # postgres:5432, minio:9000 / console:9001
docker compose ps
```

## Layout

```text
apps/           designer-web, api
packages/       semantic + v1.2 platform packages
services/       geometry-occt, meshing-adapter, import-worker, artifact-store, analysis-worker
patterns/       versioned pattern packages
fixtures/       D01 / A01 / F01 + test fixtures
docs/           architecture, governance, language
SPEC/           build-candidate specification
```

## Architecture invariant

The semantic parametric model is the source of truth. Geometry, meshes, and UI representations are derived.

## Correctness CI versus performance budgets

Correctness CI runs the test suites and asserts functional outputs. Absolute wall-clock microbenchmarks (5/20/25/75 ms) in schema assembly, feature resolution, compile parsing, agent proposals, parametric mapping and designer interaction are **diagnostic, not correctness proof**, because shared GitHub runners introduce CPU contention. Their original limits have **not** been relaxed or deleted: run them explicitly with `PLASMA_PERF_GATE=1` using the `performance-budgets (diagnostic)` workflow (`workflow_dispatch`). Failures there represent an open performance requirement, not a passing performance claim. Before making performance thresholds release-gating, benchmark on a pinned hardware/runtime environment with warmups and reproducible baselines.

B17 release recovery independently re-runs the pipeline and compares the **complete** manifest, including fabrication and exact-geometry hashes. A partial manifest must not pass as `exact`.

Graph projection PR checks always verify graph size, connectivity and bounded projections; hard wall-clock thresholds remain enforced via manual SD12 benchmark dispatch and the scheduled SD12 nightly benchmark. Shared-runner timing is not reported as proof of baseline performance.
