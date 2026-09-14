/** PLS-INF-01/0.1.0 candidate specification types; not a runtime implementation.
 * Enforce inference.md semantic constraints; TypeScript alone is insufficient.
 */
type Ref = string;
type Digest = string; // sha256:<64 hex>; canonical bytes defined by producer contract
type ExecutionClass = "interaction" | "release-time" | "background";

export type IntentField<T> =
  | { status: "explicit"; value: T; evidenceRefs: Ref[] }
  | { status: "inferred"; value: T; proposalRef: Ref }
  | { status: "assumed"; value: T; policyRef: Ref }
  | { status: "unknown" | "unavailable"; reason: string }
  | { status: "conflicting"; alternatives: T[]; evidenceRefs: Ref[] };

export interface InferenceProducer {
  id: Ref;
  version: string;
  implementationDigest: Digest;
  configurationDigest: Digest;
  modelArtifactRef: Ref | null;
  kind: "deterministic" | "heuristic" | "learned" | "human";
}
export type CandidateScore =
  | { kind: "ranking"; value: number; calibrationRef: null }
  | { kind: "calibrated_probability"; value: number; calibrationRef: Ref };

export interface ObservationEnvelope {
  id: Ref;
  modality: "pointer" | "pen" | "speech" | "text" | "world_event" | "solver_result";
  baseRevision: Ref;
  interactionId: Ref;
  interactionSequence: number;
  timestampRange: { start: string; end: string };
  selectionRefs: Ref[];
  coordinateContextRef: Ref | null;
  captureMethodRef: Ref;
  retentionPolicyRef: Ref;
  rawEvidence: { status: "retained" | "summarised" | "unavailable"; artifactRef: Ref | null };
  decisionEvidenceRefs: Ref[];
}

export interface InferenceContext {
  capsuleRef: Ref;
  inputDigest: Digest;
  contextContractRef: Ref;
  requiredContextRefs: Ref[];
  missingContextRefs: Ref[];
  sufficiencyAssessmentRef: Ref; // domain/runtime assessment, not self-attestation
}
export interface InterpretationCandidate<T> {
  id: Ref;
  value: T;
  score: CandidateScore | null;
  evidenceRefs: Ref[];
  assumptionRefs: Ref[];
}
export interface InterpretationProposal<T> {
  id: Ref;
  schemaVersion: "PLS-INF-01/0.1.0";
  observationRefs: Ref[];
  baseRevision: Ref;
  interactionId: Ref;
  interactionSequence: number;
  context: InferenceContext;
  producer: InferenceProducer;
  outputSchemaRef: Ref;
  status: "candidate" | "ambiguous" | "unknown" | "conflicting" | "out_of_distribution" | "unavailable";
  candidates: InterpretationCandidate<T>[];
  expiresAt: string | null;
  supersedes: Ref | null;
}
export interface InferenceBudget {
  deadline: string;
  maxAttempts: number;
  maxCost: { amount: number; currency: string };
  maxCpuMs: number;
  maxGpuMs: number;
  maxMemoryBytes: number;
  executionClass: ExecutionClass;
}
export interface RoutingDecision {
  id: Ref;
  proposalRef: Ref;
  baseRevision: Ref;
  policyRef: Ref;
  consequenceAssessmentRef: Ref;
  reasonCodes: string[];
  action: "reuse" | "infer" | "expand_context" | "resolve_candidate" | "ask_user" | "escalate" | "abstain" | "hold";
  selectedCandidateRef: Ref | null;
  providerRef: Ref | null;
  requiredContextRefs: Ref[];
  budget: InferenceBudget;
  terminalOnExhaustion: "ask_user" | "abstain" | "hold";
}
export interface InterpretationDisposition {
  id: Ref;
  proposalRef: Ref;
  action: "selected" | "dismissed" | "clarification_requested" | "superseded";
  selectedCandidateRef: Ref | null;
  actorRef: Ref;
  authorityRef: Ref;
  evidenceRefs: Ref[];
  reasonCodes: string[];
  timestamp: string;
  // Selection never means a WorldTransaction has committed.
}
