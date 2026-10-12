# Build viewer integration pilot

This branch fixes transaction authority defects and provides a portable synchronous graph-session adapter for the existing local Build viewer. It is not a merge of the wall-stage-1 branch or a claim that the browser runs the asynchronous Node TransactionEngine.

## Authority fixes
- Default compile requires a real adapter; mock manifests cannot commit.
- SET_PARAMETER writes an existing declared top-level path, rejects unsupported/prototype/identity paths, or preserves legacy parameter-value records when no path is supplied. Domain adapters remain responsible for typed values and units.
- A transaction commits its prepared candidate in one VersionStore mutation. The memory store mutates a clone before publication. PostgreSQL branch updates use an expected-head predicate and check returned rows.
- Worker generation is checked before and after real compilation and again at publication/mutation. Candidate snapshot hashes are checked. External transaction/candidate getter results are copies.

## Browser adapter
`@spds/transaction-core/portable` owns one accepted graph and compiles all candidates through an injected synchronous host compiler. It rejects invalid and stale proposals and uses one accepted-state assignment. Restoring a saved revision invalidates prepared candidate tokens. It deliberately does not claim durable writes, asynchronous worker authority, or cross-tab/multi-user locking: the host must supply persistence and concurrency policies.

`@spds/building-domain` defines a bounded graph for Build's fixed 6x4 fixture: building, slab, four walls, roof, door, window and nine dimensional parameters. Both openings are hosted by the front wall. Width/centre window commands and explicit downstream dependencies are provided. Build's existing compiler validates bounds/overlap and regenerates members. Geometry remains a derived consumer; no independent per-piece editing authority was introduced.

Graph coordinates are millimetres with Z up. The right-handed conversion from Build metres/Y-up is `[x,y,z] -> [1000x,-1000z,1000y]`; the inverse is explicit. Dimensional parameters retain their named local meanings, including window-centre X and sill height. No arbitrary wall path, slab footprint, multiple roof systems or product-exact connection generator is claimed.

## Reproduction
Run the transaction-core, version-core and building-domain tests, including authority-regression and portable-session. A focused audit source-alias configuration was used during development to run against source rather than stale workspace dist files. Focused TypeScript checking includes these packages and transitive source dependencies. Run PostgreSQL integration tests with DATABASE_URL configured before relying on database behaviour; no database was available for the development check.

Build the browser module from the repository root with `node scripts/build-build-runtime.mjs <absolute-output-directory>`. The bundle has no Node runtime imports and emits a source SHA-256 manifest. The Site retains the exact upstream commit and bundle/source hashes. This is explicit vendoring of a reviewed source revision, not a registry release.

## Compatibility
Calling compile without an adapter, or committing a mockCompile manifest, now fails by design. Legacy fixture/tests or metadata-only API paths that relied on mock publication need an explicit validating compiler; do not re-enable the fallback. A full application/API migration and live database regression are outside this pilot. Build uses the portable subpath, not those API endpoints.

Next: atomically persistent graph journals, cross-tab conflict detection, review/merge of wall prototype, general wall/slab/roof domain operations and first-class documentation authority.
