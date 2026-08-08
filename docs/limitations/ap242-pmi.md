# AP242 PMI export limitations (G10A.3)

SPDS v1 exports a **supported subset** of AP242 product data. Full semantic PMI
round-trip through STEP is **not** claimed.

## Supported

- Product structure (assembly / part)
- Exact B-rep geometry when produced by the geometry service
- Validation properties (mass/volume) when measurements exist

## Not supported in STEP export (retained in SPDS)

- Semantic PMI datums
- Semantic PMI tolerances
- Presentation PMI annotations

Unsupported PMI objects remain in the semantic product store. Export reports
list gaps explicitly so there is no silent data loss (§5A.13).
