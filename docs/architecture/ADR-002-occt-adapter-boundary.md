# ADR-002: OCCT adapter boundary

## Status

Accepted (G0.2)

## Context

Exact CAD requires OCCT, but OCCT must not become the product model or leak into domain packages.

## Decision

1. `services/geometry-occt` is the only module allowed to depend on OCCT-specific APIs.
2. `packages/geometry-contracts` and `packages/geometry-client` expose kernel-neutral DTOs/clients.
3. PIR operations name operators (e.g. `geometry.sweep@1.0.0`) without OCCT class names.
4. Geometry workers run in process/container isolation with timeouts and structured failures.

## Consequences

- Boundary tests fail CI if any generic package imports OCCT bindings.
- Binding choice (native container vs fallback) is localized to the geometry service.
