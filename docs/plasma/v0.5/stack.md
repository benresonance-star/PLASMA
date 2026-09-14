# Plasma stack v0.1 — consolidated candidate
These are responsibilities and interfaces, not a claim that each layer is implemented.

| Layer | Responsibility | Principal interface | Explicit non-goal |
|---|---|---|---|
| Workbench | Model-dominant 2D/3D, precision input, selection and local feedback | Edit session, query, preview, propose, accept | Own accepted project state |
| Intent and operations | Compile human/AI verbs into bounded typed operations | OperationPlan → Transform | Infer authority or silently rewrite hard rules |
| Semantic kernel | Identity, revisions, invariants, candidate isolation and atomic publication | WorldTransaction / WorldSnapshot | Contain every domain solver |
| Evaluation and orchestration | Invalidation, work dependencies, cancellation, cycles, resource budgets | CausalImpactSet / WorkItem / RefinementPlan | Treat task success as project truth |
| Representations and geometry resolver | Purpose-specific requests, tolerances, reference binding and provider routing | RepresentationRequest / RepresentationResponse / PLS-GR-01 | Make meshes or B-reps canonical identity |
| Domain capabilities | Terrain, buildings, material behaviour, cost, fabrication and analysis | Typed domain Transform and evaluator contracts | Imply universal solver validity |
| Provider adapters | Execute exact geometry, rendering, analysis and exchange | Capability declaration and versioned result envelopes | Bypass kernel commit |
| Persistence and evidence | Immutable artifacts, revisions, recovery and provenance | Transactional store and evidence/artifact references | Equate a checksum with authenticated proof |
| Foundry | Govern capability changes, replay affected projects and assess evidence | Candidate capability version and promotion record | Silently mutate its own authority machinery |

The semantic kernel is a logical authority boundary; durable publication depends on the persistence adapter's transaction guarantees. It is not a sequence of independently authoritative databases.

Initial technology posture inherited from v0.4.26: TypeScript/browser interaction; Three.js for interactive/render representations; OpenCascade for exact B-rep execution behind an adapter. NVIDIA, USD, GPU compute and specialist CAD/CAM are optional integrations. They do not become prerequisites for proving the first editing loop.
Native versus WASM OCCT, worker process placement, durable storage implementation and deployment topology remain implementation selections tied to evidence and workload budgets. This baseline does not claim those selections have been qualified.

Do not implement all layers as separate services by default. Keep contracts explicit and deploy the smallest arrangement that proves the first workflow.

## PLS-INF-01 placement
Bounded interpretation is a protocol across the existing intent, workbench, runtime, orchestration, resolver and evidence responsibilities. Reflex is an execution class, not another layer or state owner. Model placement is a policy choice; local and frontier models are optional qualified providers. See [inference protocol](inference.md).

## PLS-INT-01 placement
[Interaction sessions and overlays](interaction.md) implement the fast path inside PLS-10/PLS-14. They feed existing domain resolvers and WorldTransactions. PLS-INF-01 supplies optional interpretation; PLS-INT-01 works without it. Separately scheduled rates do not relax causal or commit-critical validation requirements.
