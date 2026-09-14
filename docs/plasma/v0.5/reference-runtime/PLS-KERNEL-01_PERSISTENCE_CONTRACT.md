# PLS-KERNEL-01 Persistent Runtime Contract v0.2

**Status:** Browser-persistent acceptance slice  
**Kernel:** PLS-KERNEL-01/0.1.0  
**Runtime:** PLS-KERNEL-01/persistent-runtime/0.2.0  
**Application:** Plasma Design and Site Editing — Kernel v0.3

## Purpose

Move the seven-primitive Plasma Kernel from an in-memory/browser bridge into an explicit persistent runtime boundary without changing the domain ontology or the direct-manipulation UX.

The kernel remains limited to:

- Entity
- State
- Relation
- Transform
- Invariant
- Event
- Evidence

Persistence, snapshots, indexes, checkpoints, ChangeSets and application-specific undo structures are runtime mechanisms, not new kernel primitives.

## Persistence boundary

```text
POINTER MOVE
  → local RC-02 preview only

POINTER RELEASE
  → typed MoveBoundary Transform
  → isolated candidate State
  → Invariant evaluation
  → material proposal persisted

KEEP CHANGES
  → application accept succeeds
  → immutable kernel revision created
  → Event/Evidence lineage appended
  → one versioned store envelope persisted atomically

REOPEN
  → validate envelope schema + contract + checksum
  → validate kernel identity/relation/revision invariants
  → recover branch head + immutable states + history
  → application checkpoint and kernel head must agree

UNDO
  → inverse Transform
  → new immutable revision
  → persistence generation advances
```

## Store envelope

The browser reference store is one atomic serialized envelope:

```text
schema          plasma-kernel-store/0.2.0
contract        PLS-KERNEL-01/0.1.0
runtimeVersion  PLS-KERNEL-01/persistent-runtime/0.2.0
generation      monotonic persistence generation
savedAt         timestamp
headRevision    accepted branch head
kernel          seven-primitive world + revisions/transactions
checksum        deterministic envelope checksum
```

The current browser adapter uses `localStorage.setItem()` on a single canonical key as the smallest synchronous atomic publication primitive. The storage API is deliberately replaceable; database/object-store implementations must preserve the same validation, revision and transaction semantics.

## Storage keys

Primary:

`plasma-kernel-runtime-v0.2`

Backup:

`plasma-kernel-runtime-v0.2.backup`

Legacy migration input:

`plasma-kernel-live-v0.1`

## Validation before acceptance

A recovered store is accepted only when all required checks pass:

1. Store schema and kernel contract match.
2. Envelope checksum matches serialized content.
3. Kernel schema and contract match.
4. Entity identifiers are unique.
5. Relations do not reference missing Entities.
6. The branch head references a stored immutable State revision.
7. Revision ancestry is acyclic.
8. `revisionCounter` is not behind stored revision IDs.
9. Root revision `R0` exists.
10. Required hard invariants remain addressable.

Invalid persisted bytes must never silently become canonical state.

## Recovery order

```text
PRIMARY
  valid → load
  invalid ↓
BACKUP
  valid → recover + expose diagnostic
  invalid ↓
LEGACY V0.1
  compatible → migrate + validate
  invalid ↓
BOOTSTRAP
  create new R0
```

Recovery source and diagnostics are inspectable through `storeStatus()`.

## Commit semantics

A canonical commit is valid only if:

- the Transaction base revision equals the current branch head;
- the candidate has no blocking hard Invariant failure;
- application acceptance has succeeded;
- all canonical State changes publish together;
- the new revision references its parent;
- the committed Event references the Transform;
- the resulting store envelope validates before it is treated as durable.

For the reference wall slice:

```text
R0
W17 =   0 mm
B03 = 3500 mm
C04 = 1150 mm

MoveBoundary +150 mm

R1
W17 = +150 mm
B03 = 3650 mm
C04 = 1000 mm
```

## Reopen semantics

A fresh runtime must be reconstructable from persisted bytes without relying on the previous in-memory kernel object.

Required after reopen:

- branch head is R1;
- R0 and R1 remain addressable;
- B03 is 3650 mm in both Plasma application state and kernel State;
- checksum and kernel validation pass;
- Event/Transform lineage remains present;
- Undo can append R2 rather than rewriting R1.

## Undo after reopen

Undo remains a forward historical action:

```text
R0 → R1 → R2
```

`R2` is produced by an inverse `MoveBoundary` Transform. `R0` and `R1` remain immutable and addressable.

Expected R2:

```text
W17 =   0 mm
B03 = 3500 mm
C04 = 1150 mm
```

## Backup recovery

Before replacing the primary envelope, the previous valid primary is retained as the backup envelope.

If the primary fails checksum or structural validation, Plasma may recover the valid backup and must expose:

- primary invalid status;
- validation errors;
- recovery source = backup;
- recovered branch head.

Recovery must not hide the failure.

## Evidence

`PLS-KERNEL-01_PERSISTENCE_REOPEN_EVIDENCE.json` proves across two fresh browser JS realms:

- conflicted +500 mm leaves canonical R0 unchanged;
- +150 mm persists accepted R1;
- the persisted envelope validates;
- a fresh runtime reconstructs R1 solely from serialized bytes;
- application checkpoint reconstructs the same accepted bedroom state;
- Undo after reopen appends R2;
- R1 remains addressable;
- persistence generation advances;
- no runtime exceptions occur.

`PLS-KERNEL-01_BACKUP_RECOVERY_EVIDENCE.json` proves:

- a corrupted primary checksum is rejected;
- a valid backup envelope is recovered;
- recovered head remains R1;
- application accepted state remains aligned with R1;
- the corruption and recovery are exposed in diagnostics.

`PLS-KERNEL-01_PERSISTENT_POINTER_EVIDENCE.json` reruns the existing desktop/mobile synthetic PointerEvent suite against the persistent runtime build, ensuring persistence has not been inserted into the pointer hot path.

## Evidence boundary

The execution environment blocks browser navigation to both localhost and file origins. Therefore the persistence/reopen harness creates two separate browser JS realms and passes only serialized storage bytes between them using a localStorage-compatible shim.

This proves serialization, validation, reconstruction and recovery semantics. It does not directly prove OS/browser durability of a normal web origin.

Still unproven:

- production database persistence;
- multi-user optimistic concurrency against a shared store;
- crash consistency across process/machine failure;
- OCCT exact geometry publication;
- worker scheduling;
- physical iPhone/workstation latency;
- NVIDIA/OpenUSD adapters.

## Promotion gate

The next kernel gate is no longer “can Plasma persist its semantic world?” The next gate is:

> Can the same unchanged seven-primitives transaction publish **authoritative exact geometry** and survive shared-store concurrency?

The recommended next vertical slice is therefore `MoveBoundary → OCCT candidate BRep → topology validation → semantic + exact-geometry atomic publication`, followed by stale-base tests against a shared persistent store.