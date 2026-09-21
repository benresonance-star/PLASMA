# PLASMA repository and Foundry v0.4.9 review

Reviewed 9 September 2026. Repository: [benresonance-star/PLASMA](https://github.com/benresonance-star/PLASMA). Pinned commit: [b7c9b17733cebde3a4d19ac8f66125123d86a7ac](https://github.com/benresonance-star/PLASMA/commit/b7c9b17733cebde3a4d19ac8f66125123d86a7ac).

## Outcome and scope

The recoverable pending task was the package-level migration audit named in the Foundry specification. This review completes the initial source-based classification of all 15 named targets. Migration implementation, full repository testing and release qualification remain separate work.

**Recommendation: retain the repository as an engineering ancestor, selectively adapt its mechanisms, and keep current Plasma/Foundry architecture authoritative.** The repository contains substantial code, including actual OpenCascade calls, but some apparently complete pipelines still contain fixtures, approximations or defaults. “Implemented,” “runs,” “faithful to the input,” and “verified for architectural use” must be separate claims.

Read the supplied `plasma-foundry-v04-9.html`, inspected the complete repository file tree, read selected implementation and test files at the pinned commit, and inspected both available CI runs and their failure logs. This is a focused source audit, not an exhaustive security review or a claim that the app was run end-to-end. Five isolated probes executed actual fabrication functions and extracted Foundry functions; results appear below. No repository changes or GitHub comments were published.

## Specification assessment

The five performance boundaries are already present in PLS-10: Active World, Dirty Frontier, Dependency Horizon, Representation LOD and Consistency Horizon. They also appear in policy. The epistemic layer, contextual representation, morphology and protected capability/project state distinction are consistent reasons to avoid adopting SPDS wholesale.

The README still declares the semantic parametric model the source of truth. That is a useful design-state principle, but insufficient as the whole world model when surveys, assumptions, accepted commitments and disputed interpretations need distinct authority. Keep stable semantic identity while introducing typed claims and governed acceptance. [Repository doctrine](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/README.md).

The spec correctly marks most Plasma runtime loops planned and reproducibility not yet proven. Its legacy audit nevertheless describes lower-level mechanisms as “proven.” Replace that description with “candidate mechanisms with evidence of varying strength,” until specific implementation/version/fixture evidence establishes more.

Important prototype defects found in the HTML:

- **Proof can be asserted by imported state.** `evidenceStats` accepts `verification === 'verified'` or `verified === true`; `derivedProof` then promotes the loop. The import route accepts this state. An isolated probe demonstrated promotion with a flag and no digest/evaluator/environment evidence. A display prototype can accept imported claims, but must label them unverified until an independent verifier attests to the claim and exact revision.
- **Manifest export loses requirements.** `buildManifest` omits `legacy_implementation_audit` and selects only a subset of loop fields, dropping PLS-10's structured `performance_boundaries`, `performance_axiom` and loop flows. Policy prose and the repository reference survive; the detailed audit does not. The top-level portable-state export is a different path and should not be confused with this finding.
- **Identity drift.** Embedded schema/meta say 0.4.9; the document title says 0.4.1 and header/status copy says 0.4.0. The declared manifest schema under versioning is also 0.4.0. Schema and application versions may differ intentionally, but that relationship needs an explicit compatibility rule.
- **Pattern ID collision.** “Local Failure Containment” and “Evidence Before Truth” both use pattern ID 12. Notes or controls keyed by ID can collide.
- **Apparent precision exceeds evidence.** Stage completion dots are synthesized from a loop-level status score and stage order. They are not individually verified stage results.

These findings make a lossless contract export and trustworthy evidence display immediate prerequisites for using Foundry to govern other agents.

## Package migration decisions

“Reuse” means retain a narrowly bounded mechanism subject to its acceptance gate; it does not mean production-certified. No whole package needs wholesale abandonment based on this audit. Retire conflicting assumptions and isolate fixtures explicitly.

| Target | Decision | Source basis and required adaptation |
|---|---|---|
| [packages/dependency-graph](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/dependency-graph/src/invalidation.ts) | Refactor | Rebuilds adjacency from every supplied edge, then takes full downstream closure. Preserve as a correctness oracle; add persistent indexes, spatial/semantic scope and boundary summaries. |
| [packages/dependency-governance](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/dependency-governance/src/index.ts) | Reuse, narrowly | Dependency licence metadata and a small classification guard. This is third-party dependency governance, not reactive-world dependency scheduling. |
| [packages/execution-dag](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/execution-dag/src/dag.ts) | Refactor | Deterministic DAG construction and caching are useful; executor is sequential, cache keys omit explicit upstream result digests, and invalidation planning is separate from cache eviction. |
| [packages/constraint-contracts](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/constraint-contracts/src/index.ts) | Split | Retain geometric vocabulary and adapter contract. Default adapter explicitly reports unsupported; create separate architectural/epistemic constraint contracts. |
| [packages/geometry-contracts](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/geometry-contracts/src/dto.ts) | Split | Useful typed requests and validation. Package also mixes DTOs, kernels, compilation and mesh operations; retain exact-geometry domain without making it the world schema. |
| [packages/geometry-client](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/geometry-client/src/client.ts) | Wrap | Good HTTP boundary with parsing, timeouts and cancellation hook. Add revision/producer envelopes, capability negotiation and already-aborted signal handling. |
| [packages/ai-interface](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/ai-interface/src/repair.ts) | Split | Keep bounded proposals, feedback and audit patterns. Extract demo-specific IDs/parameters, generalize actor contract, bind validation to independently produced evidence. |
| [packages/concurrency-core](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/concurrency-core/src/head.ts) | Reuse, narrowly | Expected-head guard is useful. It is not an atomic multi-command transaction or a coherent-world scheduler; rebase eligibility is presently unconditional on conflict. |
| [packages/fabrication-core](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/fabrication-core/src/index.ts) | Split | Keep BOM/cut-list structures, semantic dimension anchors and explicit rationalisation. Replace hard-coded steel/angles, bounding-box cut lengths and encoded-byte metadata. |
| [packages/analysis-core](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/analysis-core/src/index.ts) | Split | Keep solver-neutral contracts and indicative labels. Move Y-network examples/mock imports to fixtures; add result provenance, units, revisions and solver validity. |
| [services/geometry-occt](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/geometry-occt/src/occt-native-kernel.ts) | Wrap | Actual OpenCascade.js B-rep operations exist. Pin and record binding; separately qualify native/WASM/fallback paths, topology naming and supported operations. |
| [services/meshing-adapter](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/meshing-adapter/src/gmsh-runner.ts) | Refactor | Preserve process boundary. Current live runner meshes a fixed box, fallback can succeed, and quality values are constants. Require actual input geometry and measured quality. |
| [services/analysis-worker](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/analysis-worker/src/index.ts) | Replace production worker; retain fixture | Creates steel/Y-member model and utilization values 0.2 + i × 0.05. Useful orchestration fixture, not a physical analysis implementation. |
| [services/import-worker](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/import-worker/src/index.ts) | Refactor | Preserve import job and asset provenance ideas. Failed STEP import can fall through to synthetic sweep probes and still succeed; distinguish probe readiness from faithful import. |
| [services/artifact-store](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/artifact-store/src/minio-store.ts) | Wrap/refactor | Content-addressed storage and integrity checks are useful. MinIO adapter metadata lives in process memory; make metadata/recovery durable and bind exact byte identity. |

Also inspect [transaction-core](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/transaction-core/src/engine.ts) before reusing concurrency in production. It is outside the 15 initial targets but materially affects their safety.

## Highest-priority technical findings

### 1. Publication is not yet a proven atomic boundary

`TransactionEngine.compile()` falls back to `mockCompile()` without an adapter. That can create a gated manifest. `publicationGate()` checks transaction status and the expected head; it does not distinguish mock evidence from an independently verified result.

`commit()` calls `store.applyMutation()` separately for each command. No enclosing batch rollback appears in this engine. A later failure could leave earlier mutations persisted unless the backing store provides a stronger external transaction. This requires a fault-injection test against the actual store, not a claim of atomic publication based on the class name.

The live compile path also does not apply the mock path's stale-worker-generation rejection, and publication does not recheck generation. Inspect and test generation changes during asynchronous compilation. [Transaction implementation](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/transaction-core/src/engine.ts).

Acceptance: fail the second mutation in a two-command change; head, objects and published view must remain mutually consistent. Prohibit mock manifests on authoritative branches. Reject superseded worker results at publication, with exact input/producer binding.

### 2. The existing DAG is not the bounded reactive runtime

`computeInvalidationSet` builds adjacency over the entire supplied edge list on every call, then visits the downstream closure. The closure is useful, but there is no boundary-summary stopping condition here. Supplying a pre-scoped graph could help; the caller must establish that scope soundly.

`runOperatorDag` awaits operators in sequence. The “parallel-ready” config label does not implement a worker pool. `topoSort` scans operations for each emitted node. This is a starting point, not evidence of responsive large-world editing. [Invalidation](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/dependency-graph/src/invalidation.ts); [DAG execution](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/execution-dag/src/dag.ts).

A further cache-contract concern: node keys include operator, own input hash, tolerance and compiler config, but no explicit upstream output digest or operator implementation digest. A changed upstream result with unchanged downstream input references can leave a downstream key unchanged. `planIncrementalInvalidation` returns IDs; execution does not itself evict those keys. Correctness may depend on callers doing so. Verify that integration before retaining this cache design.

Acceptance: a changed upstream result must recompute dependents even when their input references are stable; unchanged boundary summaries should stop propagation; superseded results must never overwrite newer state.

### 3. Successful pipeline status can exceed what was actually computed

The mesher's live Gmsh path generates `Box(1) = {0,0,0, 100,40,40}`. The geometry hash does not load the requested geometry. A live Gmsh success therefore establishes that Gmsh can mesh this fixture, not that the project's shape was meshed. The public result drops execution mode and reports constant quality values. The “live” test allows deterministic fallback unless a special environment flag requires otherwise. [Gmsh runner](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/meshing-adapter/src/gmsh-runner.ts); [Mesh result](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/meshing-adapter/src/index.ts); [Live test](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/meshing-adapter/src/gmsh-live.test.ts).

Analysis utilization is generated from the member index, not solved physics. STEP import can mask a failed import with synthetic sweeps. These are legitimate fixtures when explicitly labelled; they must not feed decision-grade world claims. [Analysis worker](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/analysis-worker/src/index.ts); [Import worker](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/import-worker/src/index.ts).

Acceptance: two geometrically different inputs must produce correspondingly different actual meshes; missing backends and malformed imports must remain unavailable/failed for authoritative work. Preserve backend, fidelity, source digest and measured quality in every result.

### 4. Fabrication must be generalized before manufacturing use

The live-representation helper derives length from the bounding-box diagonal, supplies steel density, assigns a 60° member angle and 30° end cuts. For a 100 × 40 × 40 mm box it reports **114.891 mm** as the cut length. That is a diagonal, not a valid generic member length.

`exportBinaryArtifact` hashes and counts a string containing a base64 wrapper. A three-byte input is reported as **11 bytes**. This could be defined as an envelope identity, but it must not be presented as the raw CAD artifact's size/digest. Part-family clustering uses length proximity and does not establish geometric or manufacturing equivalence. [Fabrication implementation](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/packages/fabrication-core/src/index.ts).

Acceptance: cut dimensions come from semantic fabrication geometry, material properties are explicit, families account for shape/material/process, and artifact digest/length match actual exported bytes.

### 5. There is valuable exact-geometry engineering

The native kernel contains actual B-rep operations: extrusion, revolution, loft, booleans, fillets/chamfers, shell/draft, tessellation and STEP export. It leaves fabrication readiness false, which is a useful separation. This is a strong candidate to retain behind a narrow adapter.

However, the default binding is `exact-adapter`; native and import-WASM paths are distinct. A passing default test cannot establish native-kernel support or topology stability. [Native kernel](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/geometry-occt/src/occt-native-kernel.ts); [Binding selection](https://github.com/benresonance-star/PLASMA/blob/b7c9b17733cebde3a4d19ac8f66125123d86a7ac/services/geometry-occt/src/kernel-factory.ts).

Acceptance: pinned backend/toolchain tests for supported geometry, reference persistence after topology changes, actual exported-byte checks, and explicit unsupported behavior.

## CI and executed evidence

At the inspected commit, both available workflows failed:

| Run | Observed failure | Implication |
|---|---|---|
| [CI 34350427121](https://github.com/benresonance-star/PLASMA/actions/runs/34350427121) | Lint invokes an unquoted `node -e process.exit(0)` script in boundary-check; Linux shell rejects `(`. Typecheck, tests and build are skipped. | No successful main-workflow test/build evidence at this commit. This failure alone does not demonstrate application defects. |
| [Graph benchmark 34350427345](https://github.com/benresonance-star/PLASMA/actions/runs/34350427345) | Vitest cannot resolve the entry for `@spds/semantic-query`. | Benchmark did not establish performance. Repair workspace build/resolution before interpreting scale claims. |

Five isolated Node 24.19 probes passed their assertions, confirming the issues described above:

1. Foundry manifest export omits the detailed legacy audit.
2. It omits PLS-10 structured performance boundaries.
3. An imported verified flag promotes a loop without independent proof.
4. The fabrication helper reports 114.89125293076057 mm for a 100 × 40 × 40 box.
5. Three raw bytes become an 11-byte reported artifact wrapper.

These are narrow reproductions, not the repository's test suite. Other code risks above are source-inspection findings or explicitly identified hypotheses.

## Recommended next milestone

**One honest, responsive terrain → driveway → pad transaction.**

First fix contract/evidence fidelity and restore CI so that subsequent claims are reviewable. Then adapt a minimal runtime around the existing exact-geometry service:

1. Represent survey observations, inferred terrain and chosen pad levels with distinct epistemic status, source and revision.
2. Give human dragging/numeric edits and AI proposals the same typed change contract.
3. Preview a pad-level change immediately; recalculate affected driveway segments and terrain tiles locally.
4. Show grade/cut-fill results with currentness and uncertainty; pending global checks remain visible.
5. Run an older task deliberately late and prove it cannot publish.
6. Commit or undo a complete coherent change atomically; interrupted multi-command updates must not leak partial state.
7. Record the five performance boundaries, touched entities, preview latency and convergence latency. Repeat with unrelated project content added to establish whether ordinary edit cost stays local.

Defer generic sculpting depth, a universal execution language and a full agent operating system until this slice proves the shared mutation, evidence and scheduling contracts.

For another AI's red team: prioritize fabricated/assumed results being promoted as evidence, transaction interruption, upstream-cache invalidation, false locality boundaries, and measurement identity. Require an exact file/function, a counterexample and a testable correction for every major claim.
