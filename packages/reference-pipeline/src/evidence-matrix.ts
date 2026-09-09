/**
 * §30A (34–56) evidence pointers — executable checklist that the build-candidate
 * has a concrete owning package/test for each expanded completeness criterion.
 */
export interface EvidenceCriterion {
  readonly id: number;
  readonly summary: string;
  readonly evidence: string;
  readonly status: 'met' | 'partial' | 'blocked';
  readonly note?: string;
}

export const SECTION_30A_EVIDENCE: readonly EvidenceCriterion[] = [
  { id: 34, summary: 'Atomic DesignTransaction', evidence: 'transaction-core engine tests', status: 'met' },
  {
    id: 35,
    summary: 'No partial candidate→published replace',
    evidence: 'transaction-core publicationGate + release-core',
    status: 'met',
  },
  {
    id: 36,
    summary: 'Optimistic concurrency / stale head',
    evidence: 'transaction-core HEAD_CONFLICT + live adversarial stale_head',
    status: 'met',
  },
  { id: 37, summary: 'Transaction undo/redo', evidence: 'undo-redo package tests', status: 'met' },
  {
    id: 38,
    summary: 'Topological naming torture — zero silent wrong refs',
    evidence: 'topology-provenance G6A suite (500 sequences)',
    status: 'met',
  },
  {
    id: 39,
    summary: 'STEP import with provenance/units/wrapping',
    evidence: 'occt-import-js WASM STEP + import-worker geometry-client /v1/import/step path',
    status: 'met',
    note: 'Live OCCT WASM mesh import when GEOMETRY_KERNEL=occt-wasm; constructive ops exact-adapter; schema compile → STEP → /v1/compile/meshes for dual viewport',
  },
  {
    id: 40,
    summary: 'Explicit coordinate frames',
    evidence: 'coordinate-frames + A01 fixture frames',
    status: 'met',
  },
  {
    id: 41,
    summary: 'Fabrication releases bind reproducibility manifests',
    evidence: 'release-core + D01/A01/F01 pipelines',
    status: 'met',
  },
  {
    id: 42,
    summary: 'External dep licence/adapter governance',
    evidence: 'dependency-licence-register + boundary-check',
    status: 'met',
  },
  {
    id: 43,
    summary: 'Content-addressed artifact integrity',
    evidence: 'artifact-core + artifact-store verify',
    status: 'met',
  },
  {
    id: 44,
    summary: 'Backup/restore released design',
    evidence: 'artifact-store release-backup.test (+ live MinIO when up)',
    status: 'met',
  },
  {
    id: 45,
    summary: 'Sketch/constraint schema + solver adapter contract',
    evidence: 'constraint-contracts package',
    status: 'met',
  },
  {
    id: 46,
    summary: 'Assembly definitions/instances/mates/interfaces/connections distinct',
    evidence: 'assembly-core A01 + A01 pipeline',
    status: 'met',
  },
  {
    id: 47,
    summary: 'D01/A01/F01 same architectural layers',
    evidence: 'reference-pipeline live completeness suite',
    status: 'met',
  },
  {
    id: 48,
    summary: 'B1-S/M/L scale tests recorded',
    evidence: 'benchmarks b1-scale + b1-ml-scale',
    status: 'met',
  },
  {
    id: 49,
    summary: 'Composition cycle/conflict fail safely',
    evidence: 'runLiveAdversarialSuite',
    status: 'met',
  },
  {
    id: 50,
    summary: 'Worker timeout/cancel/stale rejection',
    evidence: 'meshing-adapter SPDS_INJECT_FAILURE live hooks + forced-failure-suite',
    status: 'met',
  },
  {
    id: 51,
    summary: 'Determinism class on fab-critical outputs',
    evidence: 'release manifests D0/D1 in reference pipelines',
    status: 'met',
  },
  {
    id: 52,
    summary: 'Failure taxonomy across boundaries',
    evidence: 'failure-taxonomy + SpdsFailure in composition/DAG/selectors',
    status: 'met',
  },
  {
    id: 53,
    summary: 'Extension packages cannot bypass capability boundaries',
    evidence: 'package-core manifest validation / F01 adminApproved',
    status: 'met',
  },
  {
    id: 54,
    summary: 'DesignRelease binds snapshot/manifests/artifacts',
    evidence: 'release-core + publish APIs',
    status: 'met',
  },
  {
    id: 55,
    summary: 'UI distinguishes candidate/validated/published',
    evidence: 'designer-web App shell chrome + app-session + transaction-status',
    status: 'met',
  },
  {
    id: 56,
    summary: 'No shortcut making semantic/composition/PIR/DAG optional',
    evidence: 'D01/A01/F01 pipelines + completeness bypassDetected=false',
    status: 'met',
  },
];

/** Product-layer evidence — separate from package §30A (34–56). */
export const PRODUCT_UX_EVIDENCE: readonly EvidenceCriterion[] = [
  {
    id: 1001,
    summary: 'Product UX — explorer live binding',
    evidence: 'designer-web appBootstrapSuccess + liveBinding.explorerFromApi',
    status: 'met',
    note: 'package vs product: product path requires API bootstrap',
  },
  {
    id: 1002,
    summary: 'Product UX — pipeline from run hash',
    evidence: 'appBindPipelineRun replaces dag:demo happy path',
    status: 'met',
  },
  {
    id: 1003,
    summary: 'Product UX — scripted AI without API key',
    evidence: 'ai-interface scripted mode + /ai/agent/run',
    status: 'met',
  },
];

/** Product-layer flags distinct from package §30A met claims. */
export interface ProductUxEvidence {
  readonly explorerFromApi: boolean;
  readonly pipelineFromRun: boolean;
  readonly historyFromStore: boolean;
  readonly scriptedAiWithoutKey: boolean;
}

export function assessProductUx(flags: ProductUxEvidence): {
  readonly ready: boolean;
  readonly missing: readonly string[];
} {
  const missing = (Object.entries(flags) as [keyof ProductUxEvidence, boolean][])
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { ready: missing.length === 0, missing };
}
export function assessSection30AEvidence(rows: readonly EvidenceCriterion[] = SECTION_30A_EVIDENCE): {
  readonly total: number;
  readonly met: number;
  readonly partial: number;
  readonly blocked: number;
  readonly ids: readonly number[];
} {
  const ids = rows.map((r) => r.id);
  return {
    total: rows.length,
    met: rows.filter((r) => r.status === 'met').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    ids,
  };
}
