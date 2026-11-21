# ADR-006 — Northstar is a first-class Fusion workstream

**Status:** implemented experimental slice, not production qualified.

## Decision

Northstar is not a final UI veneer on independent Loft/Build applications. It is the main adaptive human interface over Plasma's authoritative semantic model, derived representations, site observations and revision evidence.

Deliver the interface **concurrently** with source/entity/geometry integration. The original Plasma designer remains accessible while Northstar capabilities are qualified.

## F02 workspace implementation

- **Place:** locally preview a user-supplied photo or video beside model geometry. Record filename and original media timestamp. No server upload, coordinate registration, survey confidence or Gaussian reconstruction claim.
- **Design:** reuse the live Plasma Three.js viewport and semantic selection model. Imported Loft occurrences appear in the source browser, not as exact geometry until a supported preview is requested.
- **Reason:** show typed relationships and source references, select an editable Build parameter, optionally select an explicit Loft parameter mapping, then request a revision-head and source-hash guarded impact preview. Show unresolved gates; never auto-commit.
- **Worldline:** show real session events and the current branch head, identified correctly as **session history**, not an issued BIM revision register.

F02 change proposals require the exact live branch head and the exact source-content hashes. Typed parameter domains and editability are checked, and a shared Loft Part definition invalidates all of its occurrences. The proposed change remains uncommitted; exact B-rep, documentation, rules and fabrication are unvalidated.

## F03a geometric bridge

One explicitly bound Loft occurrence may be evaluated with Plasma's deterministic exact-adapter when the source history consists of exactly one centred XY rectangular sketch and one positive linear extrude, without plane offsets or other transforms.

- Interpret Loft's centred rectangular sketch and mm-based occurrence translation.
- Produce kernel-neutral geometry.extrude@1.0.0 operation using Plasma's existing contract.
- Compile a candidate tessellated mesh with InProcessGeometryKernel; preserve semantic owner.
- Fail closed on unsupported shapes, unbound identity, missing source, extra features, ambiguous expression, unsupported transformations or stale branch/source.

The UI may display this candidate but **does not certify native OpenCascade B-rep equivalence**. Full F03 requires the existing native OCCT adapter, topology proofs, curves, Booleans, assemblies and parametric regeneration.

## Revised parallel roadmap

| Phase | Core integration | UI deliverable | Acceptance |
|---|---|---|---|
| F01 | Version-preserving Build/Loft source reconciliation | Explicit binding preview | No duplicate semantic authority |
| F02 | Parameter proposals and impact review, source/head guards | Place/Design/Reason/Worldline Northstar workspace | A change traces into all bound occurrences without publishing |
| F03 | Qualified exact Loft operations in Plasma | Live source-aware geometry editing and causal cross-selection | B-rep parity, stable topology, rollback |
| F04 | Build hosts, assemblies, construction rules | Contextual systems inspector | Wall/window/slab edits propagate or explicitly fail |
| F05 | PLS-DOC-01 associative documentation | Multiscale 1to10-inspired drawing authoring | 1:5 and 1:50 details survive model revision |
| F06 | Reality registration, survey, georeferenced media, Gaussian splats | Grounded Place navigation with camera/evidence links | Quantified registration uncertainty, observation vs design clearly separated |
| F07 | Agent proposals, causal impact and revision branches | Causal Fabric and Worldline graph | Proposals/gates/evidence/alternate branches inspectable |
| F08 | Hotel-scale integration, IFC and device qualification | Consolidated professional desktop/tablet/mobile interface | Coherent model + plans + sections + details + verified handoff |

### Non-goals of F02

This is not a visually rebranded professional BIM release, georeferenced digital twin, real Gaussian viewer, IFC interchange or certified manufacturing environment. The first Northstar workspace is useful as an instrument for existing data, and remains honest about unproven capabilities.

## Review criteria

- Source IDs remain deterministic after parameter edits.
- F02 rejects stale source hashes, stale branch heads, out-of-domain parameters and unsupported implicit parameter links.
- F03a rejects every unsupported geometric feature rather than inventing a mesh.
- Northstar works at desktop and narrow/mobile widths without replacing the core designer.
- Actual user content is shown as observed material, never described as survey-registered without evidence.
- Full original CI remains separately visible; focused fusion checks do not weaken pre-existing benchmark gates.

## Testing

Focused GitHub Actions workflow: Fusion 02 Northstar Integration. This compiles backend and frontend dependencies and runs import-core, API and UI checks independently from unrelated repository-wide timing benchmarks.

Physical Windows and iPhone acceptance, actual live Gaussian/photogrammetry registration, hotel-scale tests and native B-rep lineage remain open.
