/** PLS-RUN-01/0.1.0 — candidate execution-layer contract, not a kernel primitive. */
export type RevisionRef = `R${number}`;
export type ArtifactRef = `sha256:${string}`;
export interface RunProposal {
  proposalId: string;
  baseRevision: RevisionRef;
  transforms: { type: string; schemaVersion: string; targetRefs: string[]; payload: Record<string, unknown> }[];
  evidenceRefs: ArtifactRef[];
  runRef: string;
}
export interface RunRecord {
  contractVersion: 'PLS-RUN-01/0.1.0';
  id: string;
  workItemId: string;
  kind: string;
  status: 'completed' | 'failed' | 'cancelled' | 'superseded';
  worldRevision: RevisionRef;
  producer: { capabilityId: string; implementation: string; version: string; buildHash?: string };
  inputs: { revision: RevisionRef; entityRef: string; artifactRef: ArtifactRef }[];
  parameters: Record<string, unknown>;
  assumptions: Record<string, unknown>[];
  execution: { startedAt: string; finishedAt: string; runtime?: string; machine?: string; seed?: number };
  artifacts: ArtifactRef[];
  evidence: ArtifactRef[];
  logs: ArtifactRef[];
  proposals: RunProposal[];
  replay: { mode: 'inspect_only' | 'rerunnable' | 'reproducible'; requiredArtifacts: ArtifactRef[] };
  rerunOf?: string;
}
export interface RunCurrentness {
  evaluatedAgainst: RevisionRef;
  validForRevision: RevisionRef;
  scope: 'revision_identity_only';
  state: 'current' | 'stale';
  staleBecause: string[];
}
