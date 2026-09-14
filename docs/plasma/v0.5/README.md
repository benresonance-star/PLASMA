# Plasma Consolidated Baseline v0.5
Status: consolidation candidate, 14 September 2026. This is a specification baseline, not a qualified software release.

Start here for the current Plasma direction. Existing SPDS code remains an engineering ancestor pending selective migration.

## Read in this order
1. [Core and authority](core.md).
2. [Stack and boundaries](stack.md).
3. [Domain requirements](domains.md).
4. [Contract semantics](contracts.md) and [six draft JSON schemas](contracts.schema.json).
5. [Decision reconciliation](decisions.md).
6. [Implementation and evidence](implementation.md).
7. [Bounded interpretation and escalation](inference.md).
8. [Interaction sessions and speculative overlays](interaction.md).
9. [Interactive presentation surface](presentation.md).
10. [Milestones and acceptance gates](roadmap.md).

[baseline.json](baseline.json) identifies sources, precedence and exact-identity rules.
[sources/foundry-v0.4.26.json](sources/foundry-v0.4.26.json) preserves the complete extracted Foundry declaration, including all 27 loop entries, policies, audit, architecture updates and evidence claims.
[sources/terrain-v0.2.html](sources/terrain-v0.2.html) preserves the terrain companion.
[Source inventory](source-inventory.json) retains provenance and the distinction between original file identity and extracted text.

## What this baseline changes
- Establishes one entry point and an explicit precedence rule.
- Carries the terrain T1R gate into the central roadmap.
- Reconciles reported prototype progress with remaining verification gates.
- Captures the housing objective, cost perspectives, craft boundaries, botanical test and reality-depth requirements as proposed additions reconstructed from available thread summaries.
- Provides candidate WorldTransaction, WorldSnapshot, RepresentationRequest, RepresentationResponse, CausalImpactSet and RefinementPlan schema definitions. These are authored here, not recovered verbatim from unavailable chats.
- Preserves existing requirements by reference rather than silently replacing the large Foundry declaration with a summary.
- Keeps implemented, tested in a historical harness and independently qualified as separate states.

## What is not claimed
No production deployment, migration of the existing application, passing test run in this consolidation session, physical-device performance result or qualified OCCT integration is claimed.
The executable environment was unavailable. Git object publication and source/document checks do not qualify the runtime.
Historical evidence is imported as supporting evidence; its pass flags are not independent attestation.

## Editing rule
Change the relevant source document and decision record together. Name the affected contract IDs, status, superseded decision and required acceptance gate.
Do not overwrite historical evidence or silently migrate project knowledge baselines.
Use the enclosing Git commit to identify this exact baseline. A branch name or the highest filename version is not an immutable release identity.

## Readable edition
Run `node docs/plasma/v0.5/render.mjs` from the repository root to regenerate [index.html](index.html).
The renderer reads the Markdown chapters and full JSON sources; HTML is a derived reading copy.

## Candidate update — PLS-INF-01
Bounded interpretation, abstention and policy-based escalation now have one shared protocol within the existing stack. See CON-019, the inference types and M1 acceptance corpus. Learned models remain optional.

## Candidate update — PLS-INT-01
Interaction overlays, independently scheduled rates, bounded work and exact-result reconciliation are now specified within the existing runtime. Performance values are qualification targets; commit-critical validation still precedes acceptance. See CON-020 and the INT-A01–13 corpus.

## Candidate update — PLS-IPS-01
IPS is an existing-overlay/representation consumer inside PLS-14, with a small provider-neutral interface. No seventh representation schema or Rive dependency is introduced. CON-021 defines ownership, semantic anchors, field styling, fallback and 14 conformance cases. Rive's dated capability/licensing note distinguishes editor availability from experimental web APIs. No IPS runtime tests or device qualification are claimed.
