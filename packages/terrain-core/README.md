# Plasma terrain core — T1 source controls

Status: bounded implementation, **not full T1 completion or live-site integration**.

This package advances the terrain v0.2 companion and PLS-INT-01 with registered
design controls, a boundary, one breakline, multi-operation proposal preparation,
ephemeral point interaction, and a validated constrained surface evaluator. It has no dependencies and no world-state store.

## What it does

- Holds editable **design-ground controls** in one host-owned terrain entity.
  The original survey remains separate evidence. Copying a survey into controls
  does not turn synthetic data into a measured survey.
- Preserves explicit local frame, datum, source digest, importer and registration
  evidence references. The host importer must verify those references; this
  package cannot authenticate a caller-supplied digest.
- Resolves complete point and feature create/replace/delete commands atomically
  into a detached candidate. Failed batches leave the supplied snapshot unchanged.
- Uses the same `prepareTerrainEdit` path for human gestures and typed proposals.
- Guards branch, accepted revision, proposal revision and all source-feature
  revisions. T1 conservatively rejects all stale heads; no disjoint automatic rebase.
- Validates bounded integer coordinates with BigInt orientation/intersection
  predicates; rejects duplicate XY, malformed rings, crossing/overlapping
  constraints, dangling references and controls outside coverage.
- Requires explicit split controls where a point touches a constrained segment.
  It rejects unresolved source arrangements instead of silently snapping, splitting,
  merging conflicting heights, or dropping constraints.
- Supplies inverse operations for a new undo proposal, affected IDs and broad
  realization invalidations. The host remains responsible for the full causal closure.
- Coalesces pointer updates in a constant-size overlay; validation only runs on
  release. No AI, worker or world mutation is required to update that overlay.
- Adapts the currently saved prototype's 13 by 19 grid into design controls and
  a 60-control boundary without changing its survey object.

## Integration boundary

`snapshot` is a projection from the existing World State:

```js
{
  branchId: "main",
  worldRevision: 4,
  proposalRevision: null,
  terrain: terrainControlEntity
}
```

The host passes a capability obtained from its authorization system:

```js
{ terrainId: "terrain-1", allowedFeatureIds: ["control-17"] }
```

The caller's requested scope never creates that capability. Allowed IDs include
point IDs as well as boundary/breakline IDs in this bounded implementation.

1. Register source evidence and store the terrain-control entity through the
   host's normal WorldTransaction pipeline.
2. Use `beginTerrainPointInteraction` for plan, 3D or section handles. Convert
   screen coordinates through the workbench's registered frame before updating.
   Render its overlay as **unchecked speculative geometry**.
3. On release, obtain a fresh host snapshot. `release` calls the same resolver
   as `prepareTerrainEdit` and returns a candidate, not an accepted world revision.
4. The host checks durable request identity, current heads, authorization and
   the complete causal impact, then evaluates applicable hard constraints.
   A candidate does not prove a constrained surface or its downstream claims.
5. Install the candidate only through an atomic, durable WorldTransaction that
   includes its event, provenance, receipt and accepted revision. Recheck heads
   at commit. Do not write the candidate directly into the workbench state.
6. Schedule representations and noncritical evaluators with revision guards.
   Surface, contours, quantities, hydrology and attachments remain unresolved or
   stale until their own evaluators validate the new revision.
7. After reconciliation, dispose the overlay exactly once. Undo submits the
   inverse operations against a fresh snapshot and goes through the same checks.

The source resolver deliberately provides **no authoritative commit function**, persistent request
ledger, independent revision store or mesh fallback. Its revision counters are
host entity revisions. Recreated deleted IDs have fresh local control revisions;
the mandatory aggregate/world guards prevent treating them as the old state.
Persistent anchor resurrection policy remains a host integration requirement.

`terrainRequestKey` supplies normalized command content, not a cryptographic
digest or durable idempotency service. The host must record and compare that
content with each request receipt atomically. Retrying a committed request must
return its original receipt; changed content under the same ID must fail.

The new envelope is a strict **subset** of `plasma-terrain-edit/1`:
`point.create|replace|delete`, `boundary.create|replace|delete`,
`breakline.create|replace|delete`. Replace takes complete values, not patches.
This increment uses `scope.terrainId` with explicit target IDs. Unsupported
operations, limits, holes, grading planes and automatic acceptance are rejected;
they are not silently ignored. Existing `plasma-edit/1` semantics stay unchanged.

## Bounded numeric and resource contract

- One local registered frame; integer millimetres, coordinates within ±1,000 km.
- At most 512 controls, 128 vertices per feature, one ring and one breakline,
  64 commands per proposal, 32 evidence references per point.
- Exact integer topology predicates; these do not establish survey accuracy.
- Full bounded validation is quadratic and must run outside the pointer loop.
- Holes, submillimetre coordinates, external CRS conversion, automatic crossing
  arrangements, Delaunay refinement and source replacement are not implemented.
- The source parser/transport must bound bytes before constructing these objects.
- This is not evidence of 100,000-control scalability, 60 fps, physical-device
  latency, durable commits or T1R completion.

## Validation

Run without installing dependencies:

```sh
node packages/terrain-core/test/run.mjs
```

Or use `pnpm --filter @spds/terrain-core test`.

The implementation and 51 behavioral cases (20 control, 14 surface and 17 host/transport cases) were executed in the available V8
orchestration runtime, loading the source after removal of ESM export keywords.
The Node launcher, monorepo gates, browser, persistence and device tests were not
executed because the development environment could not initialize.

Tests include failed-batch immutability, stale reads, scope, frame/datum rejection,
duplicate observations, concave boundaries, constraint crossings and touches,
inverse edits, 10,000 coalesced updates, cancellation, shared human/typed results,
resource bounds, large-coordinate predicates and the actual legacy grid shape.

## Next terrain increment

Connect this package to the live host source and durable transaction adapter;
add point/boundary/breakline handles and exact level entry in plan, 3D and section.
Integrate the constrained surface evaluator described below, then add triangle-quality refinement and evaluator-specific quantities/contours with explicit currentness.

T1R remains the gate before broad T2/T3 expansion: arrangements and conflicts,
rapid drags under contention, long histories, source replacement, concurrent
edits/undo, conservative influence, incremental/full differential correctness,
100,000-control context and real-device measurements.

Source inspection: `Plasma-Design-and-Site-Editing-Kernel-v0.3.html`,
saved 2026-09-12, still requires `step=2000,nx=12,ny=18,points.length=247`
and rejects other surveys with "Import requires a separate registration adapter."
Its readable bundled main/worker sources duplicate that restriction. No live-site
code was modified by this increment.

## Constrained surface evaluator — second increment

Import `evaluateTerrainSurface` and `validateTerrainSurface` from
`@spds/terrain-core/surface`. Pass either the accepted terrain entity or the
detached candidate's terrain value:

```js
const candidate = prepareTerrainEdit(snapshot, request, hostCapability);
const surface = evaluateTerrainSurface(candidate.candidate);
// Publish only as a candidate representation; host commit checks still apply.
```

This produces a 2.5D piecewise-linear design surface. Every source control retains
its ID, XY and Z; no Steiner vertices or inferred heights are introduced.
Boundary ear clipping, interior point insertion and crossed-edge recovery preserve
the explicit boundary and each breakline segment. Convex-quadrilateral edge flips
recover the constrained edges. A 20,000-iteration cap per segment rejects stalled
or excessive recovery rather than hanging indefinitely.

This is constrained triangulation, **not constrained Delaunay triangulation**.
There is no minimum-angle, smoothness, drainage, slope or simulation-quality
guarantee. Full rebuilds and exhaustive validation are intentionally a bounded
correctness baseline. Schedule the evaluator outside the UI thread. A dedicated worker transport is supplied in the third increment; it has not been
installed in the live host.

A separate realization validator checks source/coordinate/elevation identity,
positive triangle orientation, exact total domain area, control completeness,
boundary/interior edge incidence, opposite shared-edge orientation, required
constraint edges and their feature/segment lineage, no crossing or unsplit
overlapping edges, domain containment and triangle connectivity.

The full normalized source key pins geometry, revisions, datum and evidence.
It is an identity key, not a cryptographic attestation. Never trust the returned
`validation` field on an externally supplied mesh; rerun the validator. The host
must additionally pin branch, world/proposal revisions and interaction sequence
before presenting an asynchronous result. Valid for a candidate does not mean
current for accepted World State.

The source-control resolver continues to return `surfaceStatus: unresolved`:
surface evaluation is a separate domain stage, and does not mutate that candidate
or establish its downstream claims. A valid surface does not validate its cut/fill,
hydrology, access, pad/threshold relationships or host invariants.

The legacy fixture realizes 247 controls as 432 triangles, with 60 boundary
segments and 14 explicitly split breakline segments. Tests also cover concave
boundaries, collinear controls, points on mesh edges, forced diagonal recovery,
multi-segment ridges, source order invariance, large offsets and deliberate
realization corruption. None are physical-device performance measurements.

Algorithm contract reference:
[CGAL 2D Triangulations manual](https://doc.cgal.org/latest/Triangulation_2/index.html)
documents constrained edges, oriented face adjacency and the convex-quadrilateral
condition for edge flips. This implementation adds no CGAL dependency and makes
no claim of equivalence to its production algorithms.

## Host and worker integration — third increment

[Host transaction and worker adapter](HOST-INTEGRATION.md) adds bounded preview scheduling,
a fresh transaction-time authorization/validation path, durable-receipt replay through
host ports, and a dedicated module-worker transport. The bridge delegates actual commits
to the host; it is not a second World State or a persistence engine.

The 17 new cases run against a simulated host and worker port. They do not establish
live integration or production durability. See the linked port contract before wiring
this adapter to the application. V8 harness execution substitutes a recursive plain-data
clone for unavailable structuredClone; Node/browser execution remains unverified.
