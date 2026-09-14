# PLS-KERNEL-01 Wall Reference Slice v0.1

**Status:** Reference acceptance contract  
**Kernel:** PLS-KERNEL-01/0.1.0  
**Purpose:** Prove the seven kernel primitives and transaction semantics with the smallest meaningful architectural edit.

## Fixture

The accepted world at `R0` contains three Entities:

- `W17` — Boundary
- `B03` — Bedroom Space, width 3500 mm
- `C04` — Corridor Space, width 1150 mm

Relations:

- `W17 BOUNDS B03`
- `W17 BOUNDS C04`

Invariants:

- hard: `C04.width_mm >= 1000`
- preference: `B03.width_mm >= 3600`

Evidence records support the base geometry, corridor rule and bedroom preference.

## Reference Transform

`MoveBoundary(W17, delta_mm)` is a domain Transform. It expands to primitive `SET_STATE` operations affecting `W17`, `B03` and `C04`; it does not directly mutate accepted state.

For the fixture:

```text
B03.width' = B03.width + delta
C04.width' = C04.width - delta
W17.offset' = W17.offset + delta
```

## Required transaction path

```text
BEGIN
  pin immutable base revision
DECLARE
  typed MoveBoundary Transform + rationale/evidence
EXPAND
  primitive SET_STATE operations
IMPACT
  W17 + B03 + C04 + intersecting invariants
APPLY
  isolated candidate world
DERIVE
  mark mesh/area/width projections stale as applicable
EVALUATE
  hard + preference invariants
RESOLVE
  pass / soft / hard / unknown + typed alternatives
COMMIT
  atomic immutable revision, or no accepted mutation
EMIT
  Event + Evidence lineage + invalidation notifications
```

## Acceptance cases

### A — Conflicted preview

Request `+500 mm`.

Expected candidate:

- B03 = 4000 mm
- C04 = 650 mm
- W17 offset = +500 mm

Expected:

- hard invariant fails by 350 mm;
- accepted world remains R0;
- requested speculative state remains inspectable;
- resolver offers `+150 mm` as the exact single-wall hard-limit alternative;
- a preview Event may be emitted; no committed Event/revision is created.

### B — Exact hard-limit commit

Request `+150 mm`.

Expected accepted R1:

- B03 = 3650 mm
- C04 = 1000 mm
- W17 offset = +150 mm
- hard invariant passes;
- preference passes;
- one atomic commit Event records actor, Transform, R0 → R1 and evidence refs.

### C — Optimistic concurrency

Create two transactions from R0. Commit A first. B must not silently apply to R1. It must return `REVISION_CONFLICT`, rebase explicitly, or branch.

### D — Branch isolation

Fork `branch-option-a` from R0. Advancing main to R1 must not advance the option branch head.

### E — Undo

Undo is an inverse `MoveBoundary` Transform committed as a new revision. History remains R0 → R1 → R2; no prior Event or revision is deleted.

## Kernel/non-kernel boundary

The following are **not** new kernel primitives:

- `MoveBoundary` (domain Transform type)
- wall/room/corridor schemas
- exact geometry/BRep
- mesh
- area/width evaluators
- UI drag gesture
- alternative generator

All are consumers or specialisations of the seven primitives.

## Performance rule

The pointer loop may use a local preview reducer, but release/commit must reconcile through the same kernel transaction contract. The UI is never allowed to become a second canonical write path.

## Acceptance command

```bash
node plasma-kernel-wall.test.mjs
```

The reference suite must pass before a later domain (terrain, window, planning, OpenUSD/NVIDIA, robotics) is allowed to claim kernel conformance.