# Interaction Reflex: first executable slice

One domain-neutral gesture session implements the existing PLS-INT-01 overlay and
preview contracts. It pins semantic identity and a base revision, publishes a
synchronous reflex frame, and schedules at most one active and one latest pending
preview. It has no terrain or WorldTransaction imports.

`begin`, `update`, `release`, `applyPreview`, `cancel`, `close` and `state` form the
runtime interface. A trusted domain adapter supplies `createOverlay` and
`requestPreview`; the host supplies `publishFrame`, `releaseOverlay` and
`releasePreview`. Published data is detached from the runtime. Callbacks must be
bounded; this same-realm interface is not a sandbox for hostile code.

The policy requires one in-flight and one queued request. This profile bounds
individual transient envelopes to 64 KiB by default; artifact storage and renderer
budgets are separately owned by the host. The complete PLS-INT-01 resource-policy
and performance contract is not qualified by this first slice.

An overlay uses the canonical session/revision/sequence/operation-digest tuple for
reconciliation. Pointer-up can carry the final meaningful observation. A current
released result becomes `awaiting_acceptance`; this package cannot commit it.
Cancellation drops queued work and releases late artifacts without republishing.

```sh
node --test packages/interaction-reflex/test/session.test.mjs
```

Fourteen native cases cover identity, sequencing, queue bounds, delayed and stale
results, cancellation, final input, failures/recovery, detached state, duplicate
results, cleanup and payload limits. Together with terrain adapter and browser
tests they exercise portions of INT-A01/A04/A06/A09/A12 and IPS-A02/A03/A04/A05;
they do not establish complete conformance or measured latency targets.
