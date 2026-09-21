# PLS-KERNEL-01 Live RC-02 Integration Contract v0.1

**Status:** Browser-integrated acceptance slice  
**Kernel:** PLS-KERNEL-01/0.1.0  
**App:** Plasma Design and Site Editing — Kernel v0.2

## Purpose

Prove that the existing fast RC-02 bedroom-boundary direct manipulation can use the seven-primitive Plasma Kernel contract without putting kernel work into the pointer hot path.

## Boundary

```text
POINTER MOVE
  → existing lightweight RC-02 local geometry preview
  → local corridor hard check

POINTER RELEASE / checked proposal
  → kernel bridge declares MoveBoundary Transform
  → expands W17/B03/C04 SET_STATE operations
  → constructs isolated candidate State
  → evaluates intersecting Invariants
  → preserves conflicted candidate or marks approved

KEEP CHANGES
  → existing application accept succeeds
  → bridge atomically publishes immutable kernel revision
  → Event + Evidence lineage appended

UNDO
  → existing application undo succeeds
  → bridge publishes inverse MoveBoundary Transform as a new revision
```

The integration deliberately does **not** add kernel transaction processing to every pointermove. Interactive geometry feedback stays local and cheap; canonical mutation occurs only at the governed release/accept boundary.

## Kernel mapping

- **Entity:** `W17`, `B03`, `C04`
- **State:** wall offset, bedroom width, corridor width per immutable revision
- **Relation:** `W17 BOUNDS B03`, `W17 BOUNDS C04`
- **Transform:** `MoveBoundary(W17, delta_mm)`
- **Invariant:** hard `C04.width_mm >= 1000`; preference `B03.width_mm >= 3600`
- **Event:** preview/conflict/release/commit/undo outcomes
- **Evidence:** corridor target and bedroom preference source records

Legacy RC-02 `ChangeSet`, `SpeculativeRevision`, `ConstraintEvaluation`, `CommittedRevision` and related structures remain application/runtime implementation forms. They do not expand the kernel ontology.

## Acceptance sequence

### A — Conflicted preview

Drag bedroom boundary +500 mm.

Required:

- app shows B03 candidate 4000 mm;
- app shows C04 candidate 650 mm;
- kernel transaction is `conflicted`;
- `INV-C04-MIN` fails;
- canonical kernel head remains `R0`;
- requested speculative geometry remains inspectable.

### B — Exact hard-limit commit

Choose the deterministic hard-limit alternative +150 mm, then click **Keep changes**.

Required kernel `R1`:

```text
W17.offset_mm = 150
B03.width_mm   = 3650
C04.width_mm   = 1000
```

Required:

- app acceptance succeeds first;
- kernel commit occurs only after that success;
- `R1.parentRevisionId = R0`;
- committed Event records R0 → R1;
- application checkpoint and kernel checkpoint are both written.

### C — Undo

Click Undo.

Required kernel `R2`:

```text
W17.offset_mm = 0
B03.width_mm   = 3500
C04.width_mm   = 1150
```

Required:

- inverse `MoveBoundary` Transform is appended;
- `R2.parentRevisionId = R1`;
- R0 and R1 remain addressable;
- no history deletion.

## Evidence

`PLS-KERNEL-01_LIVE_BROWSER_EVIDENCE.json` proves, in headless Chromium:

- conflicted preview leaves canonical head R0;
- exact hard-limit action commits R1;
- app checkpoint write succeeds;
- kernel checkpoint write succeeds;
- undo commits inverse R2;
- no runtime exceptions.

`PLS-KERNEL-01_LIVE_POINTER_EVIDENCE.json` reruns the existing desktop/mobile synthetic PointerEvent suite against the kernel-integrated HTML and verifies that hot-path preview/release performance remains in the same low-millisecond class with no runtime exceptions.

## Evidence boundary

The browser harness cannot navigate localhost/file origins in the current environment. To exercise the application's real checkpoint code under `Page.setDocumentContent`, the test installs an in-memory `localStorage` shim.

Therefore this evidence proves:

- actual browser UI event path;
- actual RC-02 checked-draft/accept/undo path;
- kernel bridge transaction semantics;
- checkpoint serialization calls.

It does **not** yet prove:

- native browser-origin persistence and reopen;
- database persistence;
- multi-user concurrency;
- OCCT exact geometry acceptance;
- worker scheduling;
- physical iPhone/workstation latency;
- NVIDIA/OpenUSD integration.

## Promotion gate

The next promotion step is to replace the bridge's in-memory semantic store with the production persistent kernel stores while leaving the UI contract and seven primitives unchanged. The same +500 / +150 / undo acceptance sequence must pass without changing the kernel ontology.