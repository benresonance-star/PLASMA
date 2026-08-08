# Requirements traceability matrix (G0A.1)

Maps SPDS v1.0 / v1.1 / v1.2 requirement areas to owning modules and checkpoints. Ownerless rows are blockers.

| Requirement area | Owner module(s) | Checkpoint |
|------------------|-----------------|------------|
| Semantic SOT / invariants 5.x | semantic-core, ADRs | G0.2, G1 |
| PIR 5A.1 | parametric-ir | G3A.4 |
| Execution DAG 5A.2 | execution-dag | G3A.5 |
| Persistent naming 5A.3 / 5B.4 | topology-provenance, selectors | G3B, G6A |
| Selectors 5A.4 | selectors | G3A.1 |
| Topology domains 5A.5 | product-definition, topology-provenance | G3B.1, G10A |
| Composition / variants 5A.6-7 | composition-core | G3A.2-3 |
| Constraint taxonomy 5A.8 | semantic-core, validation-core, constraint-contracts | G1.4 |
| Query / EXPLAIN 5A.9-10 | semantic-query | G3B.4-5 |
| Capabilities / packages 5A.11-12 | semantic-core, package-core | G1, G14 |
| PMI 5A.13 | product-definition, dimension-core | G10A.2-3 |
| Gmsh proof 5A.14 | analysis-core, meshing-adapter | G10A.4-5 |
| AI loop / Why-WhatIf 5A.15-16 | ai-interface, designer-web | G13, G13A |
| DesignTransaction 5B.1 | transaction-core | G3C |
| Optimistic concurrency 5B.2 | concurrency-core | G3C.2 |
| Undo/redo 5B.3 | undo-redo | G3C.5 |
| Import/semanticisation 5B.5 | import-core, import-worker | G10B |
| Coordinate frames 5B.6 | coordinate-frames | G3D |
| Reproducibility manifest 5B.7 | reproducibility, release-core | G12A |
| Licence governance 5B.8 | dependency-governance | G0A.2 |
| Artifact store 5B.9 | artifact-core, artifact-store | G12A |
| Sketch constraint contract 5B.10 | constraint-contracts | G1.4 |
| Assembly/mates 5B.11 | assembly-core | G3D, G11 |
| Reference models D01/A01/F01 5B.12 | fixtures/* | G4-G14A |
| Scale tiers 5B.13 | benchmarks, api | G14B |
| Adversarial composition 5B.14 | composition-core | G14B.6 |
| Worker isolation 5B.15 | geometry-occt, meshing-adapter | G6, G14B |
| Determinism classes 5B.16 | reproducibility | G0A.3 |
| Failure taxonomy 5B.17 | failure-taxonomy | G0A.4 |
| Extensibility security 5B.18 | package-core | G14 |
| DesignRelease 5B.19 | release-core | G12A |
| Language 7 / Patterns 8 / Operators 9 | semantic-*, pattern-engine, operator-core | G1, G3 |
| Geometry kernel 12-13 | geometry-occt, validation-core | G6-G7 |
| Fabrication / connections 14-16 | fabrication-core, dimension-core | G10-G11 |
| Persistence / API / history 19-21 | api, version-core | G2, G12 |
| UI 23 / 21A | designer-web | G8-G13A |
| Tests / benches 26-27 / 22A-23A | fixtures, benchmarks | continuous |
| Complete criteria 39 + 30A | all gates | G0-G15 |

**Ownerless requirements:** none identified at G0A.1.
