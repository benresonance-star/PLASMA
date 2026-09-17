import { PlasmaKernel } from '../../../docs/plasma/v0.5/reference-runtime/plasma-kernel-v0.1.mjs';
import { prepareTerrainEdit } from '../../terrain-core/src/index.mjs';
import { evaluateTerrainSurface, validateTerrainSurface } from '../../terrain-core/src/surface.mjs';

// Named synthetic fixture evaluators, not general cross-domain impact certification.
export const referenceDomains = Object.freeze({
  wall: Object.freeze({ version: 'wall-fixture/1', evaluate(snapshot, payload, capability) {
    if (capability.wall !== true) throw new Error('Wall capability required');
    if (!Number.isSafeInteger(payload.delta_mm)) throw new Error('Integer millimetres required');
    const kernel = new PlasmaKernel(snapshot.state.wall);
    const actor = { id: 'reference-evaluator', type: 'system' };
    const tx = kernel.beginTransaction({ actor });
    kernel.declare(tx, { id: 'wall-move', type: 'MoveBoundary', targets: ['W17'], inputs: { delta_mm: payload.delta_mm }, evidence_refs: [] });
    kernel.preview(tx);
    kernel.commit(tx);
    const wall = { ...snapshot.state.wall, world: kernel.snapshot(), branch: kernel.branch, states: [...kernel.states.values()] };
    return { status: 'pass', state: { ...snapshot.state, wall }, evidence: [{ evaluator: 'wall-fixture/1', results: tx.invariant_results }],
      representations: snapshot.representations.filter(r => r.domain !== 'wall') };
  }}),
  terrain: Object.freeze({ version: 'terrain-t1-fixture/1', evaluate(snapshot, request, capability) {
    const source = { branchId: snapshot.branch, worldRevision: snapshot.revision, proposalRevision: null, terrain: snapshot.state.terrain };
    const candidate = prepareTerrainEdit(source, request, capability);
    const surface = evaluateTerrainSurface(candidate.candidate);
    validateTerrainSurface(candidate.candidate, surface);
    return { status: 'pass', state: { ...snapshot.state, terrain: candidate.candidate },
      evidence: [{ evaluator: 'terrain-t1-fixture/1', scope: 'control validity and constrained surface only', status: 'pass' }],
      representations: [...snapshot.representations.filter(r => r.domain !== 'terrain'),
        { domain: 'terrain', role: 'validated-topology', toleranceStatus: 'unknown', surface }] };
  }})
});
