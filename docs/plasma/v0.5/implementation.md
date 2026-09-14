# Implementation and evidence
This matrix supersedes ambiguous progress copy in the inherited overview for this consolidation candidate.
All historical results remain scoped to their original fixture, producer and environment. None was rerun in this session.

| ID | Capability | Implementation position | Available evidence | Remaining limit / next gate |
|---|---|---|---|---|
| IMP-01 | Seven-primitive wall transaction | implemented reference | [historical 5-test pass](reference-runtime/PLS-KERNEL-01_WALL_REFERENCE_EVIDENCE.json) | Not rerun; in-memory semantics only; M1 |
| IMP-02 | RC-02 reducer | reported implemented | [historical 12-test pass](reference-runtime/plasma-rc02-runtime-evidence-v0.1.json) | Separate implementation; mapping to kernel and six schemas not qualified; M1 |
| IMP-03 | Direct manipulation | reported integrated prototype | [historical synthetic pointer run](reference-runtime/plasma-rc02-browser-evidence-v0.1.json) | Evidence file pertains to earlier RC-02 build; not proof of current live build or physical device; M1 |
| IMP-04 | Kernel bridge | implemented prototype source | [historical integration narrative](reference-runtime/PLS-KERNEL-01_LIVE_INTEGRATION_CONTRACT.md) | Not a new test run; persistence v0.2 is successor; M1 |
| IMP-05 | Persistence reopen | implemented prototype source | [historical fresh-realm byte handoff](reference-runtime/PLS-KERNEL-01_PERSISTENCE_REOPEN_EVIDENCE.json) | No native-origin durability, crash atomicity or shared store evidence; M1 |
| IMP-06 | Backup recovery | prototype test source | [historical checksum rejection and backup recovery](reference-runtime/PLS-KERNEL-01_BACKUP_RECOVERY_EVIDENCE.json) | Storage shim; not database failover or malicious-tamper verification; M1 |
| IMP-07 | Terrain pad driveway placement | reported schematic prototype | [companion reports all 16 test files passed](sources/terrain-v0.2.html) | Live source/build and test reports not reverified; quantities sampled; synthetic site; M2 |
| IMP-08 | Terrain T1R | specified | [none inspected](sources/terrain-v0.2.html) | Proof gate remains open; M2 |
| IMP-09 | Exact geometry resolver | specified; legacy OCCT candidate exists | [legacy source audit](sources/repository-audit-2026-09-09.md) | No shared wall transaction/OCCT end-to-end proof; M1 |
| IMP-10 | Six unified contracts | new draft | [document checks only](contracts.md) | No validator execution, adapter implementation or compatibility freeze; M1-M2 |
| IMP-11 | Execution runtime/pathology/knowledge governance | specified | [none establishing general implementation](decisions.md) | Individual prototype mechanisms do not prove the full contract; M3 |
| IMP-12 | Cost/craft/reality/appearance | reconstructed proposal | [thread-summary intent only](decisions.md) | Original detailed chats not recovered; no implementation claim; M3 |
| IMP-13 | Botanical/planet/robotics tracks | research proposal | [none inspected](decisions.md) | No ecosystem-scale, biology or robot-control qualification; R1 |

Machine-readable references are in [implementation-matrix.json](implementation-matrix.json).
Library identifiers are provenance locators, not public executable URLs. Retrieve the exact source before attempting a browser build.

## Important corrections
- Building placement is reported implemented by the terrain companion; the inherited PLS-10 instruction to add it is stale as a status statement. Verification remains open.
- The real reference wall fixture has 3500 mm bedroom and 1150 mm corridor. Its 1000 mm hard target gives a +150 mm limit. The +315 mm case belongs to a different synthetic fixture.
- Persistence evidence transfers serialized bytes between fresh JavaScript realms. It does not observe browser-origin persistence after an actual process restart.
- Separate application and kernel checkpoints need fault-injection evidence of coherent recovery. Single-key atomicity is insufficient to establish cross-checkpoint atomicity.
- Existing source code and historical successful tests do not establish that the deployed application includes those versions.
- The repository ancestor remains pinned at b7c9b17733cebde3a4d19ac8f66125123d86a7ac. This consolidation adds documentation/reference material, not a migration of its runtime.

## Evidence required for a new claim
Record exact commit and artifact digests; fixture/input digests; evaluator version; execution environment; actual observations; limitations; and the claim's supported scope.
Keep a failed or unknown result visible. A mock, approximation or readiness probe cannot masquerade as a successful production computation.
