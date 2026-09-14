/** PLS-IPS-01/0.1.0 candidate. No runtime or security isolation implied by types.
 * Imported overlays and reference targets retain their existing authoritative contracts.
 */
import type { InteractionOverlay } from "./interaction-contracts";
type Ref = string;
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;

export interface PresentationContext {
  surfaceId: Ref;
  generation: number;
  frameSequence: number;
  worldSnapshotRef: Ref;
  viewContextRef: Ref;
}
export interface PresentationFrame extends PresentationContext {
  protocol: "PLS-IPS-01/0.1.0";
  representations: ReadonlyArray<{
    responseRef: Ref; // existing RepresentationResponse, never an adapter-owned replica
    role: "accepted" | "candidate" | "labelled_stale";
  }>;
  overlay: Immutable<InteractionOverlay> | null;
  anchorMapRef: Ref; // host-resolved mappings + correspondence + exact/reprojected/ambiguous/lost
  lensRef: Ref;
  selectionViewRef: Ref;
  toolViewRef: Ref;
  inputViewRef: Ref; // bounded pointer/touch/pen projection; missing sensors stay unavailable
  assessmentViewRefs: readonly Ref[]; // ranges, constraints, currentness, evidence, confidence
  fieldResponseRefs: readonly Ref[]; // ordinary field/appearance RepresentationResponses
  appearanceRecipeRef: Ref;
  accessibilityViewRef: Ref;
  latencyClass: "reflex" | "local_preview" | "accepted_refresh" | "background";
  performanceProfileRef: Ref;
  qualityPolicyRef: Ref;
}
export interface PresentationReceipt extends PresentationContext {
  status: "submitted" | "pending" | "unavailable";
  visualHandleRefs: readonly Ref[]; // transient; includes HUD/handles/previews/fields/animation
  hitMapRef: Ref | null;
  anchorMapRef: Ref;
  demandHintRefs: readonly Ref[]; // host resolves through existing RepresentationRequest
  diagnosticRefs: readonly Ref[];
  submissionTimingRef: Ref | null; // not proof of displayed frame / physical latency
}
export interface PresentationInput extends PresentationContext {
  kind: "hit" | "input";
  semanticAnchorRef: Ref | null;
  hitMapRef: Ref | null;
  observationRef: Ref; // runtime-owned raw/normalized observation, not a Transform or commit
  interactionSessionRef: Ref | null;
  inputSequence: number;
}
export interface PresentationCapabilities {
  providerRef: Ref;
  supportedFeatureRefs: readonly Ref[];
  resourcePolicyRef: Ref;
  fallbackProviderRefs: readonly Ref[];
  accessibilityProfileRef: Ref;
}
export interface InteractivePresentationAdapter {
  readonly capabilities: PresentationCapabilities;
  present(frame: Immutable<PresentationFrame>): PresentationReceipt; // bounded enqueue/submit
  observeInput(listener: (input: Immutable<PresentationInput>) => void): () => void;
  release(surfaceId: Ref, generation: number): void;
}
// Semantic validation: references must resolve in pinned compatible contexts;
// buffers must not permit mutation; host revalidates hits, input and authority.
// No WorldTransaction, writable WorldSnapshot or commit callback exists here.
