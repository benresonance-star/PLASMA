# PLS-IPS-01 — Interactive Presentation Surface
Version 0.1.0 candidate. Specification only; no renderer implementation or performance qualification.
Owner: PLS-14 Adaptive Interaction Lens Runtime / Workbench, consuming PLS-INT-01 and PLS-09 representation contracts. PLS-10 governs scheduling and resource budgets.

## Decision: C plus a small presentation interface
IPS is a renderer/consumer of the existing InteractionOverlay, with a small vendor-neutral PresentationFrame/PresentationReceipt interface. It is the visual execution role of the existing workbench, not a new stack layer, world model, service or seventh foundational representation schema.

A large InteractivePresentationRequest would duplicate representation production, fidelity, freshness and provenance. Extending every RepresentationRequest with pointer and widget state would couple durable/purpose-specific artifacts to frame-frequency input. Neither is necessary. Use the existing representation contracts unchanged; an optional reflex-purpose usage profile is described below, not a new protocol.

PLS-14 still chooses what matters through representation, interaction and evaluation lenses. IPS executes that choice visually. PLS-INT-01 still interprets input, owns the ephemeral overlay and submits typed operations. The kernel/domain systems still validate and commit.

## Authority and responsibility
The Interactive Presentation Surface may represent World State but must never own World State.
Rive State Machine is not Plasma World State. This applies equally to a DOM tree, Three.js scene graph, native widget tree or future renderer.

The adapter receives immutable read projections and explicitly scoped artifact/render handles. It receives no writable world objects, transaction capability, evaluator authority, raw database handle or privileged commit closure. Selection, hover, pointer capture and animation progress may be ephemeral presentation state. Geometry, semantics, constraints, evidence, causal closure and acceptance are not.

Visual state cannot change permissions, soften a hard constraint, decide that unknown means valid or persist a modified geometric entity. A handle move, edited dimension or annotation sends a bounded input observation back to the interaction runtime. That runtime resolves semantic targets and authority and produces the existing typed proposal/WorldTransaction. Merely making the same-process interface read-only is not a security boundary: untrusted adapters/assets/scripts require isolation and a message bridge without ambient mutation authority. Copy or immutable ownership of buffers is required; a writable shared view is not an immutable projection.

Accepted lens definitions, gesture maps and appearance recipes can be versioned project/user artifacts under existing governance. Their currently executing state is not a new semantic store. Persisting a preference or annotation takes its appropriate existing governed path.

## Exact placement and data flow

| Existing responsibility | Owns | IPS relationship |
| --- | --- | --- |
| PLS-14 Workbench / adaptive lenses | Contextual disclosure, affordances and inspect modes | Selects adapter, lens and appearance recipe |
| PLS-INT-01 / PLS-10 | Input sequence, session, overlay, preview scheduling and reconciliation | Publishes immutable frames; receives hit/input observations |
| Representation subsystem / PLS-09 | Requests, artifacts, tolerances, producer provenance and topology correspondence | Supplies accepted/candidate responses or reflex-grade artifacts |
| PLS-GR-01 and domain evaluators | Geometry, constraints, semantic binding, fields and validity | IPS displays their results; cannot certify them |
| Semantic kernel and persistence | WorldTransactions, accepted state, events and evidence | No mutation interface is exposed to IPS |
| Provider adapters | Device/backend-specific rendering | Rive, WebGPU, Three.js overlays, DOM/SVG, native UI or future Plasma renderer |

The fast loop is human input → interaction runtime → ephemeral overlay → IPS → feedback.
In parallel, the runtime submits intent/operation → domain resolution and required validation → WorldTransaction → accepted state. Subsequent invalidation/refinement refreshes presentation. Required geometry and commit-critical checks precede acceptance; the diagram does not defer them until after commit.

The primary large architectural scene remains with Three.js/WebGPU or a qualified future Plasma renderer. IPS may share that renderer or composite with it; it need not be an additional canvas. Alternate primary renderers require comparative evidence.

## Small presentation interface
[presentation-contracts.ts](presentation-contracts.ts) specifies a reference-only frame envelope and adapter ports. It imports InteractionOverlay rather than redefining it. References resolve through the existing host; they are not global read/write object pointers.

A frame pins the surface generation and frame sequence, world/snapshot and view identity, existing RepresentationResponses, overlay, semantic anchors, lens/style policy and latency profile. Small selection/tool/input projections are scoped references. Optional constraint/range/field/epistemic views carry their originating response or assessment references. Do not duplicate their authoritative values or interpret missing values as zero.

The frame can display selection/hover, handles, spatial HUDs, snap marks, ranges, constraint envelopes, ghost geometry, affected regions/falloff, scalar/vector fields, validity/warnings, freshness/confidence/provenance, dimensions/editable annotations, procedural appearance and transient animation. Pointer, touch and pen/Pencil support is capability-negotiated; unsupported pressure/tilt/hover stays unavailable.

Outputs are submitted/pending/unavailable status, owned visual handles, hit-region and anchor-map references, optional representation demand hints, diagnostics and measured submission timing. Visual handles cover overlays, preview surfaces, fields and animations; they are not new persistent artifacts or accepted geometry. GPU submission is not proof of display or input-to-photon latency.

Input is owned by one runtime dispatcher per gesture. Adapters may report hit observations with exact frame/view/session context. They do not independently reinterpret the same pointer stream or emit commits. UI animation completion is never an acceptance signal.

## Relationship to RepresentationRequest/Response
IPS consumes and decorates existing responses. The response retains world_revision, request_input_digest, artifact_digest, producer, achieved tolerances, validation, correspondence and status. IPS must not relabel stale/approximate content as current/exact. Response-level currentness does not erase claim-level pending/unknown state.

If content is absent, IPS emits a demand hint naming subject/purpose/quality. The host coalesces, budgets and resolves it through the existing RepresentationRequest path. The adapter cannot launch unbounded production on every pointer event.

A reflex-purpose usage profile can set purpose to interactive_feedback, use interactive_mesh/field/sdf/drawing/material as applicable, view_context_ref, screen-space tolerance where appropriate, a short latency_budget_ms, required_for_commit=false, allow_stale_preview and approximate_preview only under the existing policy. Units and metrics remain explicit. The profile does not add schema fields or turn screen-space error into geometric correctness.

InteractionOverlay.speculativeGeometry may reference a transient proxy with no RepresentationResponse yet. It must retain the overlay's contract, revision, input sequence and fidelity. This is a session preview, not a fabricated response. To promote it to a reusable representation, use normal request/provider validation and provenance. Candidate-snapshot representations may coexist with the accepted base only with explicit role/revision labels; never require a candidate response to pretend it belongs to the accepted snapshot.

## Ownership, lifecycle and reconciliation
1. Mount an adapter with declared device/render capabilities and budgets. Allocate a surface generation; choose an accessible fallback before interaction starts.
2. The runtime sends monotonically sequenced frames. Coalesce intermediate frames without dropping final input, cancellation or reconciliation. Keep at most the policy's bounded work and resources.
3. Present cached/proxy content immediately. Bind world and candidate roles, view transform, coordinate frame, clip/depth policy and screen pixel scaling explicitly.
4. Discard late results from old surface generations, frame/view contexts or superseded interaction sequences. Mixed revisions may be shown only as policy-labelled stale/candidate content, never silently spliced.
5. On commit, bind the new accepted response and reconcile the overlay once. If the accepted geometry is unavailable, retain a labelled preview/pending state tied to the committed revision. Never double-apply a delta or reset the camera.
6. Cancellation discards the visual proposal according to PLS-INT-01. A commit race reports its actual outcome; IPS cannot promise rollback.
7. On unmount/context loss, revoke hit maps, release owned GPU buffers/textures and subscriptions, cancel optional animation and reject late callbacks. Shared artifacts are reference-counted by the host, not destroyed by an arbitrary adapter.

Adapter replacement must preserve current runtime selection, explicit gesture semantics, numeric input and pending proposal identity. It must not serialize Rive/native animation state as the only way to recover an edit.

## Semantic anchors and hit testing
Anchor identity comes from domain semantics: entity/control/feature identity or an existing typed surface/edge/chainage/intersection anchor. Mesh vertex index, Rive artboard/node ID, pixel position and GPU buffer offset cannot serve as persistent semantic identity.

The host resolves anchors for each representation revision using topology_correspondence_ref and domain anchor rules. Return exact, reprojected, ambiguous or lost with source/target response, displacement/evidence and candidate mappings. These are projections of existing resolver outcomes, not new domain truth. The terrain companion's EXACT/REPROJECTED/AMBIGUOUS/LOST vocabulary maps directly.

A proven exact mapping retains a handle. Reprojection follows a declared displacement/error policy and may require user confirmation. Ambiguous/lost mappings disable geometry-changing handles and expose repair/alternatives while preserving camera and inspection. Never bind to the nearest mesh vertex silently. A regenerated boundary can have the same semantic anchor and entirely different tessellation.

Hit regions identify semantic anchor, frame/view generation, role, occlusion/depth and input modality. The runtime revalidates the hit against the current mapping and authorization before an operation. A stale hit cannot select or edit a different object after remeshing. Screen/world conversion, device-pixel ratio, clipping and camera matrices are explicit and revision-bound; adapter-specific picking tolerances do not become domain snapping tolerances.

## Geometry-aware visual fields
Reuse the existing domain field/appearance representation system. BoundaryField, CurvatureField, StressField, DistanceField, SelectionField, ValidityField, FreshnessField and ConfidenceField are supported semantic field roles, not eight mandatory new services or storage schemas.

A field binding references its representation/assessment, semantic anchors, units, coordinate space, normalization/range, evaluator provenance, uncertainty and currentness. Selection is a runtime projection; stress is an evaluator result; confidence is an epistemic indication. They must not masquerade as one another.

A boundary-distance field may drive a gradient; constraint proximity may map to normal/caution/limit. These are styling operations. The source field must come from the relevant validated/labelled projection. A shader-produced visual estimate remains approximate and cannot become the source for hard limits or solver evidence.

No-data, unknown, stale and invalid samples have distinct styles; none map to safe/zero by default. Preserve sign, scalar/vector meaning and units under transformation. Render normals and vectors using the declared transform convention. Field interpolation and colour mapping never upgrade confidence, accuracy or completeness.

Semantic edge → derived distance field → shader gradient is allowed. Animated warning disappearance → cleared constraint is forbidden. Permanent material/appearance edits still require their ordinary WorldTransaction.

## Latency and quality classes
These classes specialize the existing PLS-INT-01 performance profile; there is no separate IPS frame-rate promise.

| Class | Work | Target / required behaviour |
| --- | --- | --- |
| Reflex feedback | Cursor, hover, selection, handles, cached snap marks | Event-to-visible <16 ms target; p95 frame interval ≤16.67 ms for a declared 60 Hz profile |
| Local speculative presentation | Proxies, local fields, ghost geometry | Latest-input-to-preview <50 ms desirable; cursor/handles continue while pending |
| Validated/accepted representation refresh | Exact/domain result and commit reconciliation | Async, revision-bound; preserve existing <100 ms local solve and <250 ms ordinary commit targets where qualified; measure acknowledgement-to-visible separately |
| Background refinement | Dense fields, analysis, photorealism, documents | Budgeted eventual completion with explicit currentness; never blocks the reflex loop |

Authoritative acceptance is a transaction property, not a special renderer. Reduced visual quality cannot relax commit gates. Measure upload/copy time, shader warmup, GPU occupancy, memory, queue age and context loss alongside frame latency. Do not claim isolation merely because drawing is GPU-native or occurs on another thread.

At overload: stop optional animation/prefetch, simplify decoration and previews, preserve essential controls and warnings, then select the declared fallback. Keep final gesture samples and required validation. PLS-INT-01's named hardware, sample counts, contention tests and physical-device evidence remain required.

## Minimalist, accessible hidden depth
Default to model + direct manipulation + transient spatial intelligence. Reveal concise controls and consequences beside the selected object/operation; let incidental detail recede when no longer relevant.

This does not remove PLS-14's Neutral/Inspect/Structure view, conventional hierarchy, precise numeric entry, discoverable commands or keyboard/screen-reader alternatives. Material hard warnings must remain discoverable while unresolved. Do not hide them just because hover ends or a timer expires. Avoid purely colour/animation-dependent meaning; respect reduced motion, focus, touch target and accessible text requirements. Touch adaptation changes affordances, not operation semantics or authority.

## Fallback and provider independence
Interchangeable candidates include Rive GPU Canvas, direct WebGPU, Three.js/WebGPU overlays, DOM/SVG, native UI and a future Plasma renderer. GPU-native is an optimization preference, not a prerequisite for valid basic interaction.

On missing runtime/assets, unsupported shader/backend, device loss or budget exhaustion, choose a qualified provider and disclose reduced fidelity. A DOM/SVG/native fallback must retain selection, numeric edits, basic handles or equivalent controls, validity/currentness, cancellation and acceptance paths. If a semantic preview cannot be reproduced, show unavailable/pending and keep inspection; do not fake geometry.

No authoritative Plasma data or operation may require .riv assets or a Rive state machine. Adapter-private assets cannot be the sole repository of operation IDs, domain values, warnings, anchors or accessibility labels. Primary 3D scene and IPS compositing need tested depth, colour/alpha, texture/context ownership and input arbitration.

## Rive GPU Canvas candidate — evidence note, 14 September 2026
Rive is an optional initial experiment for selected spatial controls, HUDs, procedural visual fields and micro-interactions. No package/runtime is added to Plasma by this specification.

Rive documents WGSL shaders targeting GPU Canvas, with restrictions for backend compatibility. This supports investigation of procedural effects and interactive compositions; Plasma field/anchor correctness still belongs to its contracts. [WGSL documentation](https://rive.app/docs/scripting/wgsl-shaders).

The web documentation specifies @rive-app/webgl2 2.42.0+, opt-in GPU Canvas, no Canvas2D support, useOffscreenRenderer=false and one context per canvas. It explicitly calls the API experimental, including possible minor-release API changes. Pin and qualify versions; do not create a Rive canvas per model object or assume shared WebGPU/Three.js textures and depth. [Web GPU Canvas documentation](https://rive.app/docs/runtimes/web/gpu-canvas).

Official runtimes are MIT-licensed and available for commercial use without a per-runtime deployment licence fee; preserve applicable notices. Paid authoring is separate. [Runtime licensing](https://rive.app/docs/runtimes/getting-started).
The pricing page lists Cadet at US$9/seat/month with .riv export and a three-seat maximum. Treat this as a dated commercial note, not a perpetual price or complete procurement rule. [Pricing](https://rive.app/pricing).

Cross-platform runtime availability does not establish GPU Canvas feature parity, zero-copy 2D/3D interoperation or supported device performance. Qualify each intended runtime/backend. Defer any primary architectural-scene renderer replacement. Benchmark the same small scene with existing overlays/DOM and Rive before selecting it.

## PR #2 terrain reconciliation
The terrain feature branch contains domain controls, a point overlay, surface evaluator and host/worker bridge; this is not proof of common v0.5 or IPS conformance. In particular its session/point shape and numeric world revisions are not the canonical multientity InteractionOverlay automatically.

| Terrain implementation item | Existing v0.5 destination | IPS treatment |
| --- | --- | --- |
| Host branch/world/proposal revision | Host-issued WorldSnapshot/candidate references | Explicit identity mapping; no string-cast invented snapshot |
| Point overlay position and target | PLS-INT-01 domain delta + entity/control semantic reference | Consume canonical overlay after adapter mapping |
| Checked triangle surface and constraints | RepresentationResponse for interactive_mesh with digest, producer, tolerance/validation and correspondence | Decorate artifact; never equate domain validation with every response claim |
| Broad invalidation labels | Runtime invalidation work / CausalImpactSet and per-claim currentness | Display pending/stale; do not assert complete dependency closure |
| commit bridge and receipt | Host WorldTransaction adapter | Remain outside IPS capability boundary |
| preview/input sequence and session | Overlay/frame compatibility keys | Drop stale presentation and hit maps |

No mapping may invent achieved error, complete impact scope or durable storage evidence. The implementation's bounded tests and simulated host do not qualify rendering, anchor migration, GPU Canvas or real persistence. Land the mappings as an implementation gate; this specification does not silently mark PR #2 compliant.

## Conformance corpus — IPS-A01 through IPS-A14
These are required tests, not executed test results. Each adapter must pass applicable cases against the same wall and terrain fixtures; record exact provider/version/device and artifacts.

| ID | Exercise | Required result |
| --- | --- | --- |
| IPS-A01 | Adapter writes input objects/buffers or calls mutation APIs; hostile script tries ambient store access | World head/entities/events/receipts unchanged; writes rejected or isolated; no mutation capability exposed |
| IPS-A02 | Handle/dimension/annotation input, including Rive state-machine callbacks | Only bounded input reaches runtime; typed validation and WorldTransaction are required; no animation-driven commit |
| IPS-A03 | Remesh with preserved, reprojected, ambiguous and lost anchors; click an old hit region | Exact mappings retained; policy-qualified reprojection; unsafe handles disabled; stale hits rejected |
| IPS-A04 | Out-of-order frames, old view matrix, changed world head and provider restart | No stale frame or hit map replaces current state; generation/sequence/context verified |
| IPS-A05 | Valid proxy differs from exact result, then commit/cancel races | Honest pending/acceptance, no double transform or camera reset; actual committed outcome reconciled |
| IPS-A06 | Missing/stale/unknown field, failed stress result and low confidence | Distinct evidence/currentness labels; no false safe/zero/confident styling |
| IPS-A07 | Missing .riv/runtime/shader/backend or GPU device loss | Basic manipulation/inspection and warnings remain through fallback; no authoritative data loss |
| IPS-A08 | CPU/GPU contention, shader compilation, uploads and multiple surfaces | PLS-INT-01 profile measured; bounded work/resources; optional effects shed first |
| IPS-A09 | Same intent through DOM/native, existing renderer and candidate Rive adapter | Same typed operation/authority and accepted outcome; only visual treatment differs |
| IPS-A10 | Pressure/hover unavailable; keyboard/screen reader/reduced motion | Equivalent commands, numeric input, focus and warnings; absent sensors stay unavailable |
| IPS-A11 | Repeated mount/unmount/cancel, resource eviction and context replacement | No stale callbacks, orphan hit maps, unbounded queues or retained GPU resources |
| IPS-A12 | Demand missing representation each frame | Host coalesces/budgets through existing protocol; no duplicate production system or request storm |
| IPS-A13 | Mix accepted/candidate revisions and refresh constraint ranges | Roles remain explicit; stale ranges cannot clamp/authorize edits; old cache entries invalidated |
| IPS-A14 | Hide/reveal lens depth, switch field view, replay without Rive assets | World unchanged; hierarchy/inspect path available; warnings and committed edit evidence remain understandable |

## Implementation sequence and deliberate deferrals
First map one wall and the PR #2 terrain slice to the common snapshot/overlay/response contracts. Implement a simple existing-renderer or DOM/SVG presentation consumer and the read-only capability boundary. Qualify IPS-A01–07 and IPS-A12–14 before provider experimentation.

Next qualify lifecycle, accessibility and contention cases IPS-A08–11 on named desktop/tablet/phone profiles. Then trial one Rive HUD/field/control composition behind the same interface. Compare usability, latency, memory/context count, fallback and authoring cost before adoption.

Defer a universal UI scene-description language, new field database, separate presentation service, per-object canvas architecture, custom primary 3D renderer, Rive-only gesture semantics, automatic UI redesign, broad shader marketplace and photorealistic IPS. None is needed to prove the direct-manipulation boundary.
