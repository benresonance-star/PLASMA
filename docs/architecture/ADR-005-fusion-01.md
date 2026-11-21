# ADR-005 — First Loft + Build + Plasma Fusion (FUSION-01)

**Status:** experimental, preview only; no production publication or native geometry transfer.

## Decision

Plasma's semantic parametric graph remains the design authority (ADR-001). This first fusion is a read-only, schema-validated reconciliation of:
- Build schemaVersion 2 exports containing authoritativeGraph.entities, .parameters and .relationships.
- Loft schemaVersion 2 (.loftproj.json) with units "mm", Part definitions, assemblies and flat Part occurrences.

The caller can explicitly link a Build element to a Loft occurrence with a represented-by relationship. No match is inferred from a similar name or physical proximity. The Loft Part stays a source-linked geometry definition, *not* a compiled exact B-rep. Unsupported input, orphan references, non-finite values, incompatible units, duplicate IDs and ambiguous correspondence fail closed.

**API:** POST /imports/fusion/preview

Request fields: buildProject (object), loftProject (object), optional bindings (array of buildEntityId, loftAssemblyId, loftInstanceId). The response includes semantic objects, typed Build parameters, relationships, hashes, stable Loft IDs, explicit bindings and unresolved gates. Rejected inputs return HTTP 422 with failureCode FUSION_RECONCILE_REJECTED.

**Studio:** Open Fusion from the Plasma designer header. Load Build and Loft JSON project exports, optionally select one Build entity and Loft occurrence, and run the preview. Inputs stay in the component's memory, and the preview cannot publish.

## Invariants

1. Preserve Build's actual semantic IDs, typed parameter units and existing relationship endpoints.
2. Create stable namespaced Loft IDs from project/Part/assembly/occurrence source identities; geometry parameter values never determine semantic identity.
3. Validate all Build relationship endpoints and parameter affects references, Loft referenced parts and explicit bindings.
4. Do not infer physical units from generic numeric Loft parameters; preserve them as raw source metadata.
5. Do not call the geometry worker, mutate the version store, publish IFC or claim structural and fabrication approval.
6. Only support the bounded browser intake; reject oversized files and unsupported source formats.

## Acceptance tests and commands

The controlled source-pair tests verify a joined graph, preserved identity across a Loft parameter edit, source hashes, explicit correspondence, and fail-closed handling of missing reference, unknown occurrence, duplicate binding or ambiguous units. API tests verify HTTP 200 for a valid read-only preview and HTTP 422 for rejected bindings.

Run: pnpm --filter @spds/import-core test; pnpm --filter @spds/import-core typecheck; pnpm --filter @spds/api test; pnpm --filter @spds/api typecheck; pnpm --filter @spds/designer-web typecheck.

**Open gate:** Test full real Build/Loft exports and actual native geometry worker evaluation; this slice only ingests source metadata.

## Follow-on phases

| Increment | Work | Acceptance |
|---|---|---|
| FUSION-02 | Versioned source mapping and transaction proposals | Head conflict and stale preview safety |
| FUSION-03 | Move qualified Loft exact operations behind Plasma's geometry contracts | B-rep/topology round-trip |
| FUSION-04 | Compile Build host/assembly construction intent into exact geometry | One building identity, shared component structure |
| FUSION-05 | Implement PLS-DOC-01 associative drawings | Edited window updates 1:5 and 1:50 views |
| FUSION-06 | Georeferenced media, survey and reality-layer registration | Evidence with transform/provenance/uncertainty |
| FUSION-07 | Connected Causal Fabric and Worldline interface | Cross-system impact and revision trace |
| FUSION-08 | Hotel, IFC and production acceptance | Real project scale and cross-view consistency |

FUSION-01 is a first source-identity bridge, **not** a completed merger or production BIM release.
