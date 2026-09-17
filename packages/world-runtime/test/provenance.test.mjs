import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { open, clients, domains, authorize } from './provenance-fixture.mjs';
import { executeMockFea } from '../src/mock-fea.mjs';
import { explainPanelThickness } from '../src/gateway-host.mjs';
import { restoreWorld } from '../src/store.mjs';
import { KERNEL_GATEWAY_CONTRACT } from '../../kernel-gateway/src/index.mjs';
import { makeTerrainRequest } from '../../terrain-core/src/index.mjs';

function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasma-provenance-'));
  const filename = path.join(dir, 'world.sqlite');
  const worlds = [];
  const reopen = extra => { const w = open(filename, { ...options, ...extra }); worlds.push(w); return w; };
  t.after(() => { for (const w of worlds) try { w.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });
  return { filename, reopen };
}
const child = (filename, ...args) => spawnSync(process.execPath,
  [fileURLToPath(new URL('./provenance-child.mjs', import.meta.url)), filename, ...args],
  { encoding: 'utf8', timeout: 15000, windowsHide: true });

test('historical computation provenance survives full process exit, rerun and recovery-copy restore', t => {
  const f = setup(t);
  const seed = child(f.filename, 'seed'); assert.equal(seed.status, 0, seed.stderr);
  let w = f.reopen();
  const original = w.execution.run('run:fea-1');
  const r1 = w.snapshot('main', 1), r2 = w.snapshot('main', 2);
  assert.equal(w.snapshot('main', 0).state.panel.thicknessMm, 10);
  assert.equal(r1.state.panel.thicknessMm, 12); assert.equal(r2.state.panel.lengthMm, 5000);
  w.close();
  const inspect = child(f.filename, 'inspect'); assert.equal(inspect.status, 0, inspect.stderr);
  const { explanation, rerun, head } = JSON.parse(inspect.stdout);
  assert.equal(head, 2); assert.equal(explanation.value, 12); assert.equal(explanation.previousValue, 10);
  assert.equal(explanation.introducedAt, 'R1'); assert.equal(explanation.provenance.runRef, 'run:fea-1');
  assert.equal(explanation.run.currentness.state, 'stale');
  assert.equal(explanation.run.currentness.evaluatedAgainst, 'R2');
  assert.equal(explanation.run.historicalRecordIntact, true);
  assert.equal(explanation.run.inputSnapshot.state.panel.thicknessMm, 10);
  assert.equal(explanation.run.inputSnapshot.state.panel.lengthMm, 1000);
  assert.equal(rerun.producer.version, '2'); assert.equal(rerun.rerunOf, original.id);
  assert.equal(rerun.inputs[0].artifactRef, original.inputs[0].artifactRef);
  assert.notEqual(rerun.evidence[0], original.evidence[0]);
  w = f.reopen(); assert.deepEqual(w.execution.run(original.id), original);
  assert.deepEqual(w.snapshot('main', 1), r1); assert.deepEqual(w.snapshot('main', 2), r2);
  assert.equal(w.execution.inspectRun(original.id, 'R0').currentness.state, 'current');
  const backup = f.filename + '.backup', restored = f.filename + '.restored';
  w.backup(backup); restoreWorld({ backupFilename: backup, filename: restored, domains, authorize });
  const recovered = open(restored);
  try {
    assert.deepEqual(recovered.snapshot('main', 1), r1); assert.deepEqual(recovered.snapshot('main', 2), r2);
    assert.deepEqual(recovered.execution.run(original.id), original);
    assert.deepEqual(recovered.execution.run(rerun.id), rerun);
    assert.deepEqual(explainPanelThickness(recovered), explanation);
  } finally { recovered.close(); }
});

test('run completion and proposal submission never publish; raw capability publish is denied', async t => {
  const w = setup(t).reopen(), { capability, capabilityTransport, governor } = clients(w);
  const record = executeMockFea(w, { runId: 'run:fea-1' });
  const p = record.proposals[0];
  const receipt = await capability.submitProposal(p, 'submit');
  assert.equal(w.snapshot().revision, 0); assert.equal(w.snapshot().state.panel.thicknessMm, 10);
  assert.deepEqual(await capability.submitProposal(p, 'submit'), receipt);
  await assert.rejects(() => capabilityTransport.request({ contractVersion: KERNEL_GATEWAY_CONTRACT,
    requestId: 'bypass', method: 'proposal.publish', payload: { proposalId: p.proposalId }, idempotencyKey: 'publish' }), { code: 'FORBIDDEN' });
  await assert.rejects(() => governor.publishProposal({ proposalId: 'missing' }, 'publish'), { code: 'HISTORY_NOT_FOUND' });
  const accepted = await governor.publishProposal({ proposalId: p.proposalId }, 'publish');
  assert.equal(accepted.resultingRevision, 'R1');
  assert.deepEqual(await governor.publishProposal({ proposalId: p.proposalId }, 'publish'), accepted);
  assert.equal((await capability.getProposal({ proposalId: p.proposalId })).publications.length, 1);
  assert.equal((await capability.getHistory({ runId: record.id })).publications[0].transformId, receipt.transformId);
  assert.equal((await capability.readWorld({ revision: 'R0', selector: { kind: 'snapshot' } })).state.panel.thicknessMm, 10);
});

test('run links bind exact proposals and evidence; immutable records cannot be replaced', async t => {
  const w = setup(t).reopen(), { capability } = clients(w);
  const record = executeMockFea(w, { runId: 'run:fea-1' }), p = record.proposals[0];
  await assert.rejects(() => capability.submitProposal({ ...p, baseRevision: 'R99' }, 'missing-base'), { code: 'REVISION_NOT_FOUND' });
  await assert.rejects(() => capability.submitProposal({ ...p, evidenceRefs: ['missing'] }, 'missing-evidence'), { code: 'HISTORY_NOT_FOUND' });
  const changed = structuredClone(p); changed.transforms[0].payload.toMm = 30;
  await assert.rejects(() => capability.submitProposal(changed, 'altered'), { code: 'RUN_PROPOSAL_MISMATCH' });
  await capability.submitProposal(p, 'submit');
  await assert.rejects(() => capability.submitProposal({ ...p, proposalId: 'different' }, 'submit'), { code: 'REQUEST_ID_REUSED' });
  assert.throws(() => w.execution.recordRun({ ...record, assumptions: [] }), { code: 'IMMUTABLE_RECORD' });
  assert.throws(() => w.execution.recordRun({ ...record, id: 'invalid-revision', worldRevision: ['R0'] }), { code: 'INVALID_REVISION' });
  assert.throws(() => w.execution.recordRun({ ...record, id: 'invalid-time', execution: { startedAt: 0, finishedAt: 1 } }), { code: 'INVALID_RUN_TIME' });
  assert.throws(() => w.execution.recordRun({ ...record, id: 'changed-input-rerun', rerunOf: record.id,
    inputs: [{ ...record.inputs[0], entityRef: 'panel:other' }] }), { code: 'RERUN_INPUT_MISMATCH' });
  const missing = structuredClone(record); missing.id = 'missing-artifact'; missing.artifacts.push('missing');
  assert.throws(() => w.execution.recordRun(missing), { code: 'HISTORY_NOT_FOUND' });
  assert.deepEqual(w.execution.run(record.id), record);
});

test('stale proposals remain inspectable and cannot publish; policy revocation blocks receipt replay', async t => {
  const w = setup(t).reopen(); let allowed = true;
  const { capability, governor } = clients(w, ({ principal, action }) => ({
    allowed: action !== 'proposal.publish' || (allowed && principal.id === 'human'),
  }));
  const run = executeMockFea(w, { runId: 'run:fea-1' }), p = run.proposals[0];
  await capability.submitProposal(p, 'submit');
  allowed = false;
  await assert.rejects(() => governor.publishProposal({ proposalId: p.proposalId }, 'publish'), { code: 'FORBIDDEN' });
  allowed = true; await governor.publishProposal({ proposalId: p.proposalId }, 'publish');
  allowed = false;
  await assert.rejects(() => governor.publishProposal({ proposalId: p.proposalId }, 'publish'), { code: 'FORBIDDEN' });
  allowed = true;
  const rerun = executeMockFea(w, { runId: 'run:fea-2', version: '2', rerunOf: run.id });
  await capability.submitProposal(rerun.proposals[0], 'submit-rerun');
  await assert.rejects(() => governor.publishProposal({ proposalId: rerun.proposals[0].proposalId }, 'publish-rerun'), { code: 'STALE_READ' });
  assert.equal((await capability.getHistory({ runId: rerun.id })).currentness.state, 'stale');
  assert.equal(w.snapshot().revision, 1);
});

for (const stage of ['before-write','after-revision','before-commit','after-commit']) {
  test('publication and run linkage recover atomically after process exit at ' + stage, async t => {
    const f = setup(t); let w = f.reopen();
    const run = executeMockFea(w, { runId: 'run:fea-1' });
    await clients(w).capability.submitProposal(run.proposals[0], 'submit'); w.close();
    const exited = child(f.filename, 'publish', stage); assert.equal(exited.status, 73, exited.stderr);
    w = f.reopen(); const committed = stage === 'after-commit';
    assert.equal(w.snapshot().revision, committed ? 1 : 0);
    assert.equal(w.execution.inspectRun(run.id).publications.length, committed ? 1 : 0);
    assert.equal((await clients(w).governor.publishProposal({ proposalId: run.proposals[0].proposalId }, 'publish-fea')).worldRevision, 1);
    assert.equal(w.execution.inspectRun(run.id).publications.length, 1);
  });
}

test('corrupt run or artifact bytes fail closed on reopen', t => {
  for (const table of ['execution_runs','execution_artifacts','execution_proposals']) {
    const f = setup(t), w = f.reopen(); executeMockFea(w, { runId: 'run:fea-1' });
    // A corrupt proposal is inserted explicitly here to exercise reopening, not a public write API.
    w.close(); const db = new DatabaseSync(f.filename);
    if (table === 'execution_proposals') db.prepare(`INSERT INTO ${table} VALUES (?,?,?)`).run('bad', '{"id":"bad"}', 'wrong');
    else db.prepare(`UPDATE ${table} SET body=?`).run('{"id":"changed"}');
    db.close(); assert.throws(() => f.reopen(), { code: 'CORRUPT_EXECUTION_HISTORY' });
  }
});

test('terrain and FEA use the same gateway without a world-write surface', async t => {
  const w = setup(t).reopen(), { capability, governor } = clients(w);
  const snapshot = w.snapshot();
  const terrain = makeTerrainRequest({ branchId: 'main', worldRevision: 0, proposalRevision: null, terrain: snapshot.state.terrain },
    { requestId: 'terrain-gateway', operations: [{ type: 'point.replace', target: 'a', values: { x: 0, y: 0, z: 20, evidenceRefs: ['source'] } }] });
  const p = { proposalId: 'proposal:terrain', baseRevision: 'R0',
    transforms: [{ type: 'terrain.controls', schemaVersion: '1', targetRefs: ['terrain'], payload: terrain }] };
  await capability.submitProposal(p, 'terrain-submit');
  assert.equal(w.snapshot().state.terrain.points[0].z, 0);
  await governor.publishProposal({ proposalId: p.proposalId }, 'terrain-publish');
  assert.equal(w.snapshot().state.terrain.points[0].z, 20);
  const run = executeMockFea(w, { runId: 'run:fea-after-terrain', worldRevision: 'R1' });
  await capability.submitProposal(run.proposals[0], 'fea-submit');
  await governor.publishProposal({ proposalId: run.proposals[0].proposalId }, 'fea-publish');
  assert.equal(w.snapshot().revision, 2); assert.equal(w.snapshot().state.panel.thicknessMm, 12);
  assert.equal(w.snapshot().state.terrain.points[0].z, 20);
});

test('host authorization and immutable proposal binding remain enforced behind the gateway', async t => {
  const w = setup(t).reopen(), { capability, capabilityTransport, governor } = clients(w, () => ({ allowed: true }));
  const run = executeMockFea(w, { runId: 'run:fea-1' }), p = run.proposals[0];
  await capability.submitProposal(p, 'submit');
  await assert.rejects(() => capabilityTransport.request({ contractVersion: KERNEL_GATEWAY_CONTRACT,
    requestId: 'raw', method: 'proposal.publish', payload: { proposalId: p.proposalId }, idempotencyKey: 'raw-publish' }), { code: 'DENIED' });
  const saved = w.execution.proposal(p.proposalId);
  assert.throws(() => w.session({ id: 'human' }, saved.id).submit({ ...saved.worldRequest,
    payload: { fromMm: 10, toMm: 30 } }), { code: 'PROPOSAL_CHANGED' });
  await governor.publishProposal({ proposalId: p.proposalId }, 'publish');
  const sameOperation = { ...p, proposalId: 'second-proposal' }; delete sameOperation.runRef;
  await capability.submitProposal(sameOperation, 'second-submit');
  await assert.rejects(() => governor.publishProposal({ proposalId: sameOperation.proposalId }, 'publish'), { code: 'REQUEST_ID_REUSED' });
});
