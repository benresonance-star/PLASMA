# PLS-INF-01 — Bounded Interpretation and Escalation Protocol
Version: 0.1.0 candidate. Status: specified in consolidation candidate; not implemented or qualified.
This protocol extends PLS-13/14/10/15/16 and PLS-GR-01. It creates no kernel primitive, independent world store, mandatory model or deployment layer.

## Foundation principle
Plasma separates interpretation, domain evaluation and authoritative state mutation.
Intelligence proposes interpretations. Domain evaluators establish validity within declared assumptions. Governed transactions establish accepted project state. Evidence connects that state to reality.
Deterministic computation is not proof that inputs, physical models, regulatory applicability or inferred intent are correct.
Bounded interpretation may use deterministic methods, heuristics or learned models selected according to demonstrated capability, context requirements and execution budgets.
Explicit input outranks predicted intent. Unknown, unavailable and conflicting values remain explicit. Confidence never waives authority, required validation or conservative dependency coverage.

## Placement in the existing stack
| Owner | Responsibility |
|---|---|
| PLS-13 intent/reasoning | Typed observation, interpretation, question, proposal and disposition |
| PLS-14 interaction | Explicit tool semantics, stable suggestions, alternative previews and user clarification |
| PLS-10 bounded runtime | Admission, cancellation, gesture ordering and aggregate interaction budgets |
| PLS-15 orchestration | Context expansion, provider selection, bounded attempts and work scheduling |
| PLS-GR-01 resolver | Consume hypotheses; resolve and validate isolated candidates |
| PLS-16 pathology guard | Advisory triage with mandatory checks independent of suspicion |
| Evidence/persistence | Decision-relevant provenance and immutable output/disposition records |
| Kernel | Revision, authority, invariant and atomic publication enforcement |

A reflex is a bounded observation-to-interpretation capability, not an agent with goals or its own durable project state. Disposable caches and temporal windows must declare inputs, versions, expiry and reset semantics.

## Execution and routing
The explanatory L0–L5 ladder is not a mandatory sequence. Capability, execution class, provider, placement and qualification are separate dimensions.
Execution classes: interaction, release-time, background. Provider classes: deterministic, heuristic, learned, human.
Routes: reuse, infer, expand_context, resolve_candidate, ask_user, escalate, abstain, hold.
Choose the least costly qualified route satisfying purpose, context, consequence and latency; skip intermediate providers when inappropriate.
A router assesses scope, reversibility, materiality, dependency depth, project stage, authority, context sufficiency, uncertainty, applicability, privacy constraints and resources.
Caller risk estimates are hints; independently derived impact and governing policy determine required checks.
Policy pins maximum attempts, total deadline, cost, CPU/GPU/memory budget and terminal disposition. Budget exhaustion yields unknown/held/abstained, never a fabricated answer. Never silently send local-only data to a remote provider.

Required context is task-specific. A provider cannot establish completeness merely by asserting it. The domain contract and runtime check required references and conservative impact scope; missing or uncertain context may require expansion or a held proposal.
Human clarification is a valid terminal route. Repeated escalation is not mandatory.

## Data contracts
[inference-contracts.ts](inference-contracts.ts) defines the proposed typed contracts. They complement the existing six structural schemas and require the semantic validators below.
InterpretationProposal carries candidates, provenance, input and context identity, sequence, expiry and explicit uncertainty.
IntentField records explicit/inferred/assumed/unknown/unavailable/conflicting origins per value.
RoutingDecision records policy, reason codes, route, selected provider/context and bounded budget.
InterpretationDisposition separately records selection, dismissal, clarification or supersession. Selecting an interpretation is not a WorldTransaction commit.
The existing producer envelope is extended for inference with nullable model/calibration references. Model-free implementations are valid.

A calibrated probability is bounded to [0,1] and cites calibration evidence for the relevant task/population. Ranking scores have no universal probability interpretation. Scores can be absent; different providers' scores are not directly comparable.
Out-of-distribution is a detector claim, not guaranteed knowledge. The system can remain unknown about domain membership.
A rejected candidate is recorded by disposition; a provider cannot mark its own interpretation accepted or authorised.

## Runtime interfaces
- interpret(request, context, budget) → InterpretationProposal
- route(proposal, consequenceAssessment, policy, resources) → RoutingDecision
- resolveCandidate(selectedCandidate, resolverContext) → ResolutionResult
- recordDisposition(proposalRef, disposition, actor) → EvidenceRef

These are contracts, not deployed endpoints. The resolver and transaction interfaces remain existing authorities.
No inference path may write accepted semantic state, mutate provider geometry in place as canonical state, weaken a tolerance policy, suppress a hard invariant or authorize a side effect.

## Geometry and interaction
An explicit MoveBoundary tool already defines the verb. Do not invoke a classifier to rediscover it.
For ambiguous untyped input, preserve alternatives and resolve cheap candidates for comparison. A circle's fit residual establishes fit under that metric, not architectural meaning.
Classification may rank strategy/binding hints; exact reference correspondence, postconditions and tolerance checks remain mandatory.
Keep one stable active interpretation per gesture, with policy-defined hysteresis or explicit switching. No unnoticed mid-drag substitution of MOVE with EXTEND.
Pointer release creates/evaluates a proposal. Exact geometry and commit-critical validation occur before authoritative acceptance.
Check world revision, request input digest, interaction ID and interaction sequence for late results. A same-revision result from an earlier gesture is still stale.
Disabling inference or losing a provider must preserve normal explicit editing.

## Causal scope and pathology
Learned relevance and dependency predictions may rank work, prefetch or suggest expansion. They cannot certify closure or remove applicable hard checks.
Required integrity, authority and hard-invariant checks run regardless of learned suspicion.
An unknown detector outcome is not evidence of absence. Evaluate false negatives as well as false positives.
Keep severity, likelihood, novelty and blocking authority independent. Unusual design is not automatically erroneous.
Use evaluator-specific influence certificates and existing CausalImpactSet computed scope for correctness.

## Evidence retention and replay
Transient pointer/audio buffers are bounded. Promote decision-relevant observations under an explicit retention policy; do not append every sample to canonical history.
An ObservationEnvelope identifies modality, timestamps, sample window, world/camera/coordinate transforms when applicable, selection, revision and capture method. It records whether raw evidence is retained, summarised or unavailable.
Retain actual proposal outputs and selected/rejected alternatives with producer/configuration/model references. Historical replay uses the recorded outputs. Re-execution of a model is a new result and does not silently replace them.
Human acceptance is feedback, not automatic correctness or training truth. No automatic model update is authorised by this protocol.
Private model chain-of-thought is neither required nor stored as the audit contract.

## Qualification and resource policy
Latency bands such as 1–10 ms are workload-specific targets, not guarantees or provider capability definitions.
Measure queue + preprocessing + inference + validation + transfer + UI costs, warm and cold start, p50/p95/p99 and rendering/solver contention.
Aggregate budgets govern all predictors together. Cancel obsolete work, cap prefetch/cache memory and protect explicit interaction.
Promote a learned provider only after comparison against deterministic/heuristic baselines for wrong confident suggestions, abstention, user corrections, missed detections, latency, resource use and complete-task improvement.
Calibration and model changes are versioned capabilities governed by Foundry. Pinned projects/runs do not silently adopt changed behaviour.

## Acceptance corpus — M1 extension
| ID | Fixture | Required outcome |
|---|---|---|
| INF-A01 | Explicit wall drag with inference disabled | Existing tool semantics, preview and transaction workflow remain available |
| INF-A02 | “Make this bedroom larger” | Magnitude stays unknown; no invented numeric instruction |
| INF-A03 | W17/B03/C04 alternative at +150 mm | Label as proposed fixture alternative, not the original user's stated magnitude or a statutory rule |
| INF-A04 | Ambiguous move versus resize | Distinct previews; unresolved consequential ambiguity cannot silently commit |
| INF-A05 | Same revision, older gesture sequence | Discard late proposal; never replace the current gesture |
| INF-A06 | High model score, missing project commitment | Expand context or hold despite high confidence |
| INF-A07 | Detector reports no suspicion but hard rule fails | Mandatory validator blocks acceptance |
| INF-A08 | Classifier oscillates during drag | Stable active semantics; switching is visible and governed |
| INF-A09 | Escalation exhausts attempts or budget | Terminal clarification/abstention/hold; no endless routing |
| INF-A10 | Geometrically valid wrong interpretation | Semantic postcondition or explicit-input mismatch blocks acceptance |
| INF-A11 | Many cheap predictors plus rendering load | Aggregate budget/cancellation enforced; no implied pass from missing work |
| INF-A12 | Replay after model upgrade | Recorded proposal and disposition remain addressable; new inference has new provenance |

No acceptance test in this table has been executed by this specification update.

## Sequence and deferrals
M1: contracts, explicit-input bypass, unknown-preserving extraction and the wall corpus. A deterministic/heuristic reference implementation is sufficient.
M2: reuse unchanged protocol for terrain context, anchors, influence and stale results under T1/T1R.
Then consider learned intent hints, geometry alternatives, representation prefetch, advisory anti-pattern triage, explanation relevance and finally impact prioritisation, in that order.
Defer model fleets, standalone reflex services, mandatory local LLMs, every-pointer inference, automatic learning, universal confidence thresholds and learned authority over hard checks/tolerances/causal closure.
Do not displace M1 durability and exact OCCT gates.

## Source and attribution
Desert Ant Shapes documents a compact stroke classifier followed by classical geometric fitting/regularisation and a residual rejection gate, with a single-stroke domain.
Source reviewed 14 September 2026: [Shapes SDK documentation](https://desertant.com/docs/shapes/).
That bounded recognition example motivates this proposal. Plasma's general routing and authority protocol is a project-specific architectural inference, not an assertion that Desert Ant implements the Plasma architecture.

## Structural semantic validation
IDs/references must resolve; digests use their declared canonical encoding. Scores and budgets are finite; probabilities lie in [0,1]; counts and sequence numbers are nonnegative integers; attempts are at least one. Candidate IDs are unique; candidate status has at least one candidate and ambiguous/conflicting status has at least two distinct alternatives. Retained raw evidence requires an artifact reference; absent raw evidence must not claim exact replay. A selected disposition or resolve_candidate route requires a candidate ID from the referenced proposal; other dispositions cannot imply selection. Reuse and escalation require valid result/provider references and context compatibility. Expiry is checked alongside revision, input digest and interaction sequence. Producer-selected hints do not establish actor authority.

## Relationship to PLS-INT-01
[Interaction Session Runtime](interaction.md) owns gesture sessions, ephemeral overlays, fast visual feedback and reconciliation. PLS-INF-01 may offer hypotheses under those budgets; no inference is required for ordinary explicit manipulation. The two uses of “reflex” describe different bounded capabilities within the same stack, not independent layers.
