# Determinism policy (G0A.3)

| Class | Meaning | Typical outputs |
|-------|---------|-----------------|
| D0 | Semantic hash stable for canonical semantic input | model snapshot hash |
| D1 | PIR/DAG stable for resolved state + operator versions | PIR program, execution DAG |
| D2 | Geometry equivalent within tolerance policy | B-rep mass props, watertight solids |
| D3 | Byte-identical artifact when serializer supports it | canonical STEP/JSON where available |

Benchmarks and manifests must declare which class applies. Never claim D3 when only D2 is guaranteed.

Canonical hashing: `@spds/reproducibility` `sha256Canonical` (sorted keys).
Tolerance policy version participates in cache keys via `@spds/shared-units` `TOLERANCE_POLICY_VERSION`.
