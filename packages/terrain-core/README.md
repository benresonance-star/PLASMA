# Plasma terrain core — T1 source controls

Status: bounded implementation, **not full T1 completion or live-site integration**.

This package advances the terrain v0.2 companion and PLS-INT-01 with registered
design controls, a boundary, one breakline, multi-operation proposal preparation,
and ephemeral point interaction. It has no dependencies and no world-state store.

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
  It rejects unresolved arrangements instead of silently snapping, splitting,
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

The package deliberately provides **no commit function**, persistent request
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
  arrangements, surface triangulation and source replacement are not implemented.
- The source parser/transport must bound bytes before constructing these objects.
- This is not evidence of 100,000-control scalability, 60 fps, physical-device
  latency, durable commits or T1R completion.

## Validation

Run without installing dependencies:

```sh
node packages/terrain-core/test/run.mjs
```

Or use `pnpm --filter @spds/terrain-core test`.

The implementation and 20 behavioral cases were executed in the available V8
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
Then implement a constrained surface evaluator with constraint lineage,
boundary-preserving validation and explicit unresolved/failure states.

T1R remains the gate before broad T2/T3 expansion: arrangements and conflicts,
rapid drags under contention, long histories, source replacement, concurrent
edits/undo, conservative influence, incremental/full differential correctness,
100,000-control context and real-device measurements.

Source inspection: `Plasma-Design-and-Site-Editing-Kernel-v0.3.html`,
saved 2026-09-12, still requires `step=2000,nx=12,ny=18,points.length=247`
and rejects other surveys with "Import requires a separate registration adapter."
Its readable bundled main/worker sources duplicate that restriction. No live-site
code was modified by this increment.
