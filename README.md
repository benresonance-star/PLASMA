# SPDS — Semantic Parametric Design System

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
