# ADR-004: Geometry kernel binding (G6)

## Status

Accepted (build-candidate)

## Context

SPDS requires exact B-rep operations via an OCCT-backed geometry service with a hard process boundary. Host-native OCCT bindings are fragile on developer Windows environments; Docker-first delivery is the planned mitigation.

## Decision

1. All generic packages talk to geometry only through `@spds/geometry-contracts` DTOs and `@spds/geometry-client`.
2. `services/geometry-occt` is the sole geometry process boundary (Compose service on `:7080`).
3. **Default CI adapter:** deterministic `ExactKernelAdapter` implementing sweep/tessellate/shell/Y fixture generation behind the same HTTP API.
4. **OCCT WASM adapter:** `OcctWasmKernel` via `occt-import-js` (LGPL) for live STEP→mesh (`POST /v1/import/step`), selected by `GEOMETRY_KERNEL=occt-wasm`. Constructive sweep/shell still delegate to the exact adapter until a fuller OCCT API surface is wired.
5. Shell/Boolean failures return structured `SpdsFailure` payloads; imported STEP solids stay `fabricationReady: false` (reference-only).
6. **Schema compile contract (K0+):** All D01 display / AI accept / dual-viewport geometry enters through `GeometryCompileRequest` (PIR-neutral ops + `semanticOwner` / `pirOperationId` + schema `parameters`). Exact and OCCT mesh products share one compile hash.
7. **OCCT display meshes (K2):** `POST /v1/compile/meshes` maps compile sweeps → content-addressed STEP boxes → OCCT WASM tessellation, rebound to compile owners. HUD label: `OCCT WASM (STEP-tessellated)` — not native constructive B-rep until `occt-native`.
8. **Native constructive B-rep (N1):** `GEOMETRY_KERNEL=occt-native` uses **OpenCascade.js** (Node WASM, LGPL, server-only) for real sweep/tessellate/shell behind the same DTOs. Binding choice locked: OCJS in-process over a C++ sidecar for the first constructive slice; Compose profile `occt-native` is the Windows/Docker path. CI default remains `exact-adapter`. Viewport Layer B prefers native meshes when present, else K2 WASM STEP-tessellate — never silent exact-as-OCCT.
9. **Publish manifests (K3):** DesignRelease manifests carry `compileHash`, `pirHash`/`dagHash`, and `kernelArtifactHashes` (exact mesh hashes + optional OCCT STEP hashes or an explicit `occtNote`).
10. **Oriented sweep display model (N1.3b):** `geometry.sweep@1.0.0` carries an optional profile-up vector. Exact-adapter and `occt-native` construct deterministic rectangular prisms perpendicular to each path segment; native uses planar wires + OCCT prism/fuse operations. The STEP-remapping WASM fallback remains approximate.
11. **Native STEP (N1.7):** `STEPControl_Writer` exports constructive solids; hashes land in `kernelArtifactHashes.occtNative`. `fabricationReady` stays false; AP242 PMI still limited.
12. **Drift (N1.8):** exact↔native oriented-sweep extents use family-clustering tolerance (3 mm); WASM STEP-box path keeps a coarser 200 mm gate.
13. **Optional CI (N1.9):** `.github/workflows/geometry-native.yml` runs native tests with `continue-on-error`; default `ci.yml` stays exact-adapter.
14. **Planar profile extrusion:** `geometry.extrude@1.0.0` carries a kernel-neutral planar polygon, extrusion vector, semantic owner, and feature path. Exact-adapter triangulates convex or concave profiles deterministically; `occt-native` builds a closed wire, planar face, and constructive prism. Compile execution dispatches exhaustively over the geometry-op union. F01 panels use this operator instead of rectangular line-sweep approximation.
15. **Profile revolve and loft:** `geometry.revolve@1.0.0` rotates a closed planar profile around an explicit axis and angle; `geometry.loft@1.0.0` joins two or more compatible closed profiles. Exact-adapter emits deterministic triangle meshes and derives mesh mass properties. `occt-native` uses constructive revolve and through-sections B-reps. Initial loft conformance requires matching profile vertex counts and defaults to ruled sections.
16. **Dependency-aware solid Booleans:** `geometry.boolean@1.0.0` references two prior compile-operation IDs and supports union, cut, and intersect. Exact-adapter executes deterministic triangle-mesh BSP operations; `occt-native` executes OCCT Fuse, Cut, or Common. Compile operations are ordered, duplicate IDs and unresolved forward references fail, and construction-only operands may set `visibility: construction` so they remain available to downstream operations without emitting display meshes.
17. **Plane trim modifier:** `geometry.trim-plane@1.0.0` references a prior solid plus an explicit plane and retained half-space. Exact-adapter intersects against a deterministic clipping prism through the shared BSP path; `occt-native` constructs the same half-space prism and applies OCCT Common. The source may remain construction-only. Fillet and chamfer are gated on stable semantic edge-to-kernel topology resolution rather than positional edge indices.
18. **Semantic edge identity foundation:** Extrusion representations expose edge topology paths derived from source profile roles and indices (`profile-start`, `profile-end`, and `rail`), not OCCT explorer order. Both kernels emit the same paths and geometric bounds. The native adapter resolves each path to its `TopoDS_Edge` by geometric signature and makes that lookup available to downstream modifiers. This first topology-naming slice intentionally covers extrusion edges; unsupported operator topology must remain explicit until it has source-derived naming rules.
19. **Semantic edge fillet and chamfer:** `geometry.edge-fillet@1.0.0` and `geometry.edge-chamfer@1.0.0` reference a prior operation plus one or more semantic edge paths. `occt-native` resolves those paths to `TopoDS_Edge` values and applies constructive OCCT fillet/chamfer builders. The exact adapter intentionally preserves the source envelope as a display approximation, reports `geometry-approximated`, raises mesh deviation to at least the requested radius/distance, and remains fabrication-blocked. Unknown paths and native healing failures are explicit errors; kernel edge enumeration order is never accepted as an API selector.
20. **Semantic extrusion faces and open shells:** Extrusion topology also exposes source-derived start-cap, end-cap, and profile-segment side-face paths. `geometry.face-shell@1.0.0` references a prior solid and one or more semantic faces to remove. `occt-native` resolves them to `TopoDS_Face` values and constructs a joined OCCT thick solid with explicit inward/outward thickness. The exact adapter uses the same explicit `geometry-approximated` envelope policy as edge modifiers. Modified outputs do not claim stable downstream topology until operator-specific result naming is defined.
21. **Semantic face drafts:** `geometry.face-draft@1.0.0` references selected semantic faces, a pull direction, neutral plane, angle, and reversal flag. `occt-native` resolves the faces and applies an OCCT draft-angle feature. The exact adapter preserves the source envelope and publishes a conservative deviation bound computed from the furthest source-envelope point to the neutral plane multiplied by the draft-angle tangent. Angles are constrained to `(0, 45]` degrees and invalid directions, face paths, or native healing results fail explicitly.
22. **Ruled-loft topology identity:** Ruled lofts with matching profile vertex counts expose source-derived profile edges, inter-profile rails, end caps, and side faces keyed by profile section, interval, and source vertex/segment indices. Exact and native representations emit identical paths; `occt-native` resolves them to B-rep edges and faces by geometric signature. This enables the existing semantic fillet, chamfer, shell, and draft features on two-section and multi-section ruled lofts. Smooth lofts intentionally expose no topology paths until curve-aware naming rules are defined.


## Consequences

- G6 gates are enforceable without multi-hour native builds.
- Boundary tests continue to forbid OCCT imports outside allowlisted service paths.
- Replacing the adapter must preserve representation IDs, semantic owners, and validation states.
- Viewport dual-engine compare must not label exact-adapter tessellation as OpenCascade.
