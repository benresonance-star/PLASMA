# ADR-004: Geometry kernel binding (G6)

## Status

Accepted (build-candidate)

## Context

SPDS requires exact B-rep operations via an OCCT-backed geometry service with a hard process boundary. Host-native OCCT bindings are fragile on developer Windows environments; Docker-first delivery is the planned mitigation.

## Decision

1. All generic packages talk to geometry only through `@spds/geometry-contracts` DTOs and `@spds/geometry-client`.
2. `services/geometry-occt` is the sole geometry process boundary (Compose service on `:7080`).
3. **Current CI/runtime adapter:** deterministic `ExactKernelAdapter` implementing sweep/tessellate/shell/Y fixture generation behind the same HTTP API.
4. **Target production adapter:** OCCT WASM (`opencascade.js`) or native OCCT inside the same service image, selected by env `GEOMETRY_KERNEL=occt-wasm|exact-adapter` without changing contracts.
5. Shell/Boolean failures return structured `SpdsFailure` payloads; `fabricationReady` stays false.

## Consequences

- G6 gates are enforceable without multi-hour native builds.
- Boundary tests continue to forbid OCCT imports outside allowlisted service paths.
- Replacing the adapter must preserve representation IDs, semantic owners, and validation states.
