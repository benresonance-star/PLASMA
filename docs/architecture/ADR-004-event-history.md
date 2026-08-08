# ADR-004: Event history and non-destructive restore

## Status

Accepted (G0.2)

## Context

Users and agents need snapshots, branches, compare, and restore without rewriting history.

## Decision

1. Every accepted mutation appends an immutable change event.
2. Materialized semantic state is updated transactionally with the event.
3. Restore creates a new head from an old snapshot; history is never destructively rewritten as the normal workflow.
4. v1.2 `DesignTransaction` / candidate / publication layers sit on top of this event model.

## Consequences

- `version-core` owns events/snapshots/branches.
- Undo/redo uses compensating commands (v1.2), not snapshot deletion.
