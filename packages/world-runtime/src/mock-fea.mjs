/** Deterministic synthetic fixture only; these numbers are not structural advice. */
export const panelDomain = Object.freeze({ version: 'mock-panel/1', evaluate(snapshot, payload, capability) {
  if (capability.panel !== true) throw new Error('Panel capability required');
  if (Object.keys(payload).some(k => !['fromMm','toMm'].includes(k)) ||
      payload.fromMm !== snapshot.state.panel.thicknessMm ||
      !Number.isFinite(payload.toMm) || payload.toMm < 1 || payload.toMm > 100) throw new Error('Invalid panel thickness');
  return { status: 'pass', state: { ...snapshot.state, panel: { ...snapshot.state.panel, thicknessMm: payload.toMm } },
    evidence: [{ evaluator: 'mock-panel/1', status: 'pass', scope: 'synthetic thickness range only' }],
    representations: snapshot.representations };
} });

// Trusted job-runner seam: captures exact inputs and persists terminal output.
// Executors themselves get pinned inputs and return results, never a world writer.
export function executeMockFea(world, { runId, worldRevision = 'R0', version = '1', rerunOf } = {}) {
  const source = world.snapshot('main', world.execution.revisionNumber(worldRevision));
  if (!source.state.panel || !['1','2'].includes(version)) throw new Error('Unsupported mock FEA input');
  const startedAt = new Date().toISOString();
  const put = value => world.execution.putArtifact({ mediaType: 'application/json', content: JSON.stringify(value) }).id;
  const input = put(source.state.panel);
  const parameters = { loadCase: 'LC-04', supportConditions: 'SC-02' };
  const assumptions = [{ id: 'fixture-only', text: 'Synthetic panel response; no physical qualification.' }];
  const result = put({ utilisation: version === '1' ? 1.17 : 1.12, recommendedThicknessMm: 12,
    solverVersion: version, inputRef: input, parameters });
  const log = world.execution.putArtifact({ mediaType: 'text/plain', content: `Mock FEA ${version} completed against ${worldRevision}.` }).id;
  const proposal = { proposalId: `proposal:${runId}`, baseRevision: worldRevision,
    transforms: [{ type: 'panel.set-thickness', schemaVersion: '1', targetRefs: ['panel:P27'],
      payload: { fromMm: source.state.panel.thicknessMm, toMm: 12 } }], evidenceRefs: [result], runRef: runId };
  return world.execution.recordRun({ contractVersion: 'PLS-RUN-01/0.1.0', id: runId, workItemId: `work:${runId}`, kind: 'structural_analysis', status: 'completed',
    worldRevision, producer: { capabilityId: 'mock-fea', implementation: 'Plasma.MockFEA', version },
    inputs: [{ revision: worldRevision, entityRef: 'panel:P27', artifactRef: input }], parameters, assumptions,
    execution: { startedAt, finishedAt: new Date().toISOString(), runtime: 'JavaScript deterministic fixture', seed: 0 },
    artifacts: [input, result], evidence: [result], logs: [log], proposals: [proposal],
    replay: { mode: 'rerunnable', requiredArtifacts: [input] }, ...(rerunOf ? { rerunOf } : {}) });
}
