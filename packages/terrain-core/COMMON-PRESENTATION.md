# Common-contract and presentation increment

Status: bounded mapping and headless presentation consumer implemented; no live viewport.

This stage follows PLS-IPS-01/0.1.0 in v0.5 candidate.4
(spec commit 15b37afb9ac2c0c83e120bf0b22e69efd69eb3bc).
The specification subtree is brought into this feature branch without replacing
terrain implementation files. No main-branch merge or deployment is performed.

## Plan completed in this increment

1. Map the existing point overlay into InteractionOverlay using explicit host
   world/actor/entity/control-anchor/delta references.
2. Map a validated terrain mesh into RepresentationResponse without inventing
   tolerance or completeness claims.
3. Add a bounded, read-only presentation consumer with generation/frame/view and
   anchor-map checks, input observation return, and visual-handle release.
4. Exercise ownership, stale picks, unresolved anchors, unavailable rendering and
   conservative representation semantics.

## Host registration boundary

Import from `@spds/terrain-core/common-contracts`.

`mapTerrainOverlay(local, binding)` checks the terrain branch/world/proposal/entity
pin against host registration. The host must resolve and register actual
WorldSnapshot/world revision, actor, entity and typed control anchor references,
plus the canonical domain delta artifact and its SHA-256 operation digest.
The registered delta coordinates must match the requested point position.
Numeric terrain revisions are never converted into pretend snapshot IDs.

The map preserves pending/unknown assessment. It does not invent a full surface
preview, a proposal receipt or commit readiness. These require their existing
host stages. Cancelled overlays remain cancelled.

`mapTerrainSurface(source, surface, request, binding)` validates the domain mesh
and checks the explicit host world and artifact registration. The host must first
validate the complete RepresentationRequest schema and register its artifact bytes,
SHA-256 digest, versioned producer, input digests, evidence and timestamp.
This adapter does not hash/store artifacts or validate the full request schema.

The resulting interactive-mesh RepresentationResponse deliberately uses
`status: unknown`, empty achieved tolerances and no fabricated validation checks.
Source topology passing alone does not satisfy all requested representation
tolerances. This first adapter does not promote a result to current or permit
commit-critical/analysis-mesh requests. A host may expose this result only under
an explicitly labelled unqualified preview policy; it cannot silently render it
as a current accepted representation. Common-contract tolerance qualification is
the next representation gate.

`terrainInvalidationHints` returns pending domain claims with unknown impact
coverage. It is input to the existing dependency runtime, not a fake CausalImpactSet.
Only host expansion/evaluators can produce a complete impact set.

## Presentation consumer

Import from `@spds/terrain-core/presentation-consumer`.

`createPresentationConsumer` accepts a mount identity, capabilities, bounded
read-only projection resolver, synchronous render-only draw sink and visual-handle
release callback. It exposes present, observeInput and release from PLS-IPS-01,
plus observeHit for the host input dispatcher.

The host resolver supplies the exact frame-bound screen-space anchor projection.
It must resolve semantic anchors through the existing domain correspondence.
This first profile enables edits only for exact mappings. Reprojected, ambiguous
and lost anchors require inspection or repair; they cannot become editable by
setting a boolean. Reprojection acceptance policy remains a future extension.

Draw receives detached deeply frozen plain data. Accessors, functions, cycles,
typed/shared buffers and non-plain objects are rejected, with payload and listener
budgets. The consumer does not accept a WorldTransaction or store handle. This is
defensive ownership for trusted code, **not isolation from hostile same-realm
JavaScript**. Untrusted renderer/script execution still requires a real sandbox
and capability-safe message boundary before IPS-A01 can be fully qualified.

Present requires increasing frame sequences and matching surface generation,
snapshot, view and anchor map. Old hit maps cannot target a new representation.
The runtime still rechecks the returned semantic input observation, authorization
and gesture sequence; the consumer does not execute a Transform.

The draw sink returns transient handles synchronously. The release callback must
be nonthrowing and dispose only its own resources. Replacement/release disposes
handles and revokes picking. On draw failure the receipt is unavailable and no
picking map is retained; the host then selects an accessible fallback.
No DOM/SVG/Three.js/Rive backend or GPU resource isolation is installed here.

## Evidence and limits

Twelve focused behavioral cases executed successfully in V8 orchestration with
ESM imports injected and a plain-data clone substitute for structuredClone in
the surface mapper. They exercise detached input mutation, hostile getters,
stale frames/hits, unresolved anchors, input-only output, failed draws, release,
budgets, conservative mesh responses and incomplete impact hints.

The aggregate Node launcher now includes these cases alongside the earlier 51.
The previous 51 were not rerun in this increment. Node ESM execution, TypeScript,
a full JSON Schema validator, browser rendering, screen-reader/device tests,
untrusted-adapter sandboxing and the complete IPS-A01–14 corpus remain unverified.

## Next gate

Wire a minimal DOM/SVG or existing-renderer draw sink into the restored workbench.
Register genuine snapshot/delta/artifact references, implement measured tolerance
claims, and test semantic anchor refresh against real remeshing. Qualify actual
capability isolation and live input/visual performance before adding a Rive trial.
