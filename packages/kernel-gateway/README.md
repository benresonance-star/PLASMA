# PLS-KERNEL-GATEWAY-01

Status: first transport-neutral contract slice. It does **not** own World State, persistence, geometry or authorization policy.

## Purpose

All replaceable capabilities — UI tools, solvers, AI agents, importers and external adapters — should reach authoritative Plasma state through one narrow gateway rather than receiving a mutable World State handle.

```text
capability / agent / UI tool
          |
          v
   Kernel Gateway
   - world.read
   - proposal.submit
   - proposal.get
   - history.get
   - proposal.publish  <-- authority-gated
          |
          v
   PLS-KERNEL-01 / WorldTransaction host
          |
          v
 authoritative World State + immutable history
```

The gateway deliberately has no `world.write`, arbitrary JSON Patch, snapshot-replacement or database API.

## Authority model

Identity is supplied by trusted transport/runtime context. Request data cannot self-declare `actor`, `principal` or `authority`.

A normal capability client exposes read, submit and inspection methods only. `proposal.publish` exists because a host/governor must be able to publish, but the gateway re-authorizes it server-side. Hiding the client method is convenience, not the security boundary: a capability that manually crafts a publish request must still be denied by policy.

The host remains responsible for the hard guarantees already required by `WorldTransaction`: exact-head compare-and-swap, complete invariant evaluation, atomic state/event/evidence publication, durable idempotency receipts and recovery.

## Proposal shape

A submitted proposal must bind to an exact immutable `baseRevision` and contain one or more typed transforms. `head` is deliberately rejected as a proposal base. Each transform contains:

- `type`
- optional `schemaVersion`
- `targetRefs`
- plain-data `payload`

Optional `evidenceRefs`, `intentRefs` and `runRef` link the proposal to evidence and consequential computation history without making those artifacts authoritative state.

Transform registration and semantic validation belong behind the gateway in the kernel/host. Passing gateway structure validation never implies a transform is valid or publishable.

## Transport neutrality

`createKernelGateway` accepts plain request/response records. `createInProcessTransport` is supplied only as the first adapter and test seam. HTTP, local RPC, WebSocket, worker, process or future Rust FFI adapters should preserve the same request semantics and trusted identity injection.

The boundary copies and validates data in one pass before method validation and authorization. Objects must have enumerable data properties; accessors, cycles and sparse arrays are rejected. Arrays cannot have extra properties. `history.get` requires exactly one supplied reference field containing a nonblank string.

## Current relation to terrain

The terrain T1 bridge already demonstrates the important host-side rules: injected authenticated actor, proposal-only preview, fresh commit authorization, hard validation, stale-head rejection, durable receipts and atomic host commit. This package extracts the reusable outer doorway so terrain is not the permanent API definition.

The next integration slice should adapt terrain `WorldTransaction` host calls through this gateway without changing terrain behavior, then prove a second unrelated capability (recommended: mock FEA thickness proposal) uses the same boundary with no gateway/kernel semantic change.

## Acceptance criteria for this slice

1. No general world-write method exists.
2. Untrusted request data cannot establish identity or authority.
3. Capability principal can read and submit a revision-pinned proposal.
4. Capability principal cannot publish, even by bypassing the convenience client.
5. Governor principal can publish an existing proposal only; publish cannot smuggle new transforms.
6. Proposal submission requires an exact base revision and idempotency key.
7. Unknown methods and unsupported fields fail closed.
8. Requests/results are plain-data cloned across the boundary.

The package tests exercise those API-level properties. They do not yet prove production persistence, process isolation, OS credentials, branch protection, or the real WorldTransaction implementation.
