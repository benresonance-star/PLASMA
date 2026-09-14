/** PLS-INT-01/0.1.0 candidate data contracts.
 * Not a runtime implementation. Enforce interaction.md semantic invariants.
 */
type Ref = string;
type Digest = string;
export interface InteractionTarget {
  entityId: Ref;
  semanticReference: Ref | null;
}
export type InteractionDelta =
  | { kind: "transform"; targetRefs: Ref[]; matrix4: number[]; frameRef: Ref; translationUnit: string }
  | { kind: "parameter"; targetRef: Ref; parameter: string; requestedValue: number; unit: string }
  | { kind: "domain"; schemaRef: Ref; payloadRef: Ref }; // e.g. topology/terrain/sketch edit
export interface PreviewAssessment {
  status: "unknown" | "pending" | "locally_valid" | "conflicted" | "failed";
  evaluatorRefs: Ref[];
  ruleRevisionRefs: Ref[];
  evidenceRefs: Ref[];
  diagnosticsRefs: Ref[];
  // locally_valid does not assert global validity or commit readiness.
}
export interface InteractionOverlay {
  schemaVersion: "PLS-INT-01/0.1.0";
  sessionId: Ref;
  baseRevision: Ref;
  inputSequence: number;
  operationDigest: Digest;
  actorRef: Ref;
  operation: string;
  targets: InteractionTarget[];
  modifiersRef: Ref;
  deltas: InteractionDelta[];
  speculativeGeometry: {
    artifactRef: Ref | null;
    transientRenderHandle: string | null;
    representationContractRef: Ref;
    fidelity: "cursor_only" | "proxy" | "approximate" | "exact_candidate";
    sourceRevision: Ref;
    sourceInputSequence: number;
  } | null;
  assessment: PreviewAssessment;
  currentness: "current" | "pending" | "stale" | "unavailable";
  lifecycle: "active" | "released" | "resolving" | "awaiting_acceptance" | "committing" | "reconciling" | "failed" | "cancelled" | "closed";
  proposalRef: Ref | null;
  transactionRef: Ref | null;
  committedRevision: Ref | null;
}
export interface InteractionPolicy {
  id: Ref;
  version: string;
  performanceProfileRef: Ref;
  previewErrorPolicyRef: Ref;
  reconciliationPolicyRef: Ref;
  maximumInFlightRequests: number;
  maximumQueuedRequests: number;
  maximumTransientBytes: number;
  supersession: "latest_relevant_sequence";
  optionalWorkOnOverload: "pause";
}
export interface PreviewRequest {
  sessionId: Ref;
  baseRevision: Ref;
  inputSequence: number;
  operationDigest: Digest;
  targets: InteractionTarget[];
  deltaArtifactRef: Ref;
  representationContractRef: Ref;
  policyRef: Ref;
}
export interface PreviewResponse {
  sessionId: Ref;
  baseRevision: Ref;
  inputSequence: number;
  operationDigest: Digest;
  producerRef: Ref;
  status: "ready" | "pending" | "failed" | "unsupported" | "cancelled";
  artifactRef: Ref | null;
  assessment: PreviewAssessment;
  achievedErrorEvidenceRefs: Ref[];
}
