import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const testFiles = folder => readdirSync(resolve(root, folder)).filter(f => f.endsWith('.test.mjs')).map(f => folder + '/' + f);
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr + (result.error ?? ''));
  return result.stdout;
}
const commands = [
  ['--test', '--test-reporter=spec', ...testFiles('packages/kernel-gateway/test'), ...testFiles('packages/world-runtime/test')],
  ['packages/terrain-core/test/run.mjs'],
  ['--test', '--test-reporter=spec', ...testFiles('packages/interaction-reflex/test'), ...testFiles('packages/terrain-core/test')],
];
const checks = commands.map(args => {
  const output = run(args);
  const passed = Number(output.match(/ℹ pass (\d+)/)?.[1] ?? output.match(/(\d+)\/\d+ passed/)?.[1]);
  assert.ok(passed > 0);
  return { command: 'node ' + args.join(' '), passed, exitCode: 0 };
});
const dir = mkdtempSync(join(tmpdir(), 'plasma-provenance-demo-'));
let demo;
try {
  const filename = join(dir, 'world.sqlite');
  const invoke = action => JSON.parse(run(['packages/world-runtime/demo/provenance.mjs', action, filename]));
  const created = invoke('create'), inspected = invoke('inspect'), rerun = invoke('rerun');
  assert.deepEqual(inspected.explanation, created.explanation);
  assert.equal(rerun.head, 'R2'); assert.equal(rerun.rerun.producer.version, '2');
  assert.deepEqual(rerun.explanation, created.explanation);
  demo = { processes: ['create','inspect','rerun'], worldHead: rerun.head,
    thicknessMm: inspected.explanation.value, previousMm: inspected.explanation.previousValue,
    introducedAt: inspected.explanation.introducedAt, runRef: inspected.explanation.provenance.runRef,
    originalInputRevision: inspected.explanation.run.record.worldRevision,
    currentness: inspected.explanation.run.currentness, rerunId: rerun.rerun.id };
} finally {
  const withinTemp = relative(resolve(tmpdir()), resolve(dir));
  if (!withinTemp.startsWith('..') && !withinTemp.includes('/') && !withinTemp.includes('\\')) rmSync(dir, { recursive: true, force: true });
}
const files = ['docs/plasma/v0.5/run-records.md', 'docs/plasma/v0.5/run-records.ts'];
for (const folder of ['packages/kernel-gateway/src','packages/kernel-gateway/test','packages/world-runtime/src','packages/world-runtime/test']) {
  files.push(...readdirSync(resolve(root, folder)).filter(f => f.endsWith('.mjs')).map(f => folder + '/' + f));
}
files.push('packages/world-runtime/demo/provenance.mjs');
const evidence = { contract: 'PLS-RUN-01/0.1.0', recordedAt: new Date().toISOString(), runtime: process.version,
  checks, totalPassed: checks.reduce((n, c) => n + c.passed, 0), cliDemonstration: demo,
  sourceIdentity: 'SHA-256 of UTF-8 source with CRLF normalized to LF',
  sources: Object.fromEntries(files.sort().map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n')).digest('hex')])),
  limits: ['Synthetic fixtures; no real FEA qualification', 'No new browser workflow was exercised',
    'SQLite process interruption and verified recovery copy, not power-loss qualification',
    'Revision-only currentness; producer revocation and general causal scope remain open'] };
writeFileSync(resolve(root, 'packages/world-runtime/evidence/provenance-tests.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ totalPassed: evidence.totalPassed, checks, cliDemonstration: demo }, null, 2));
