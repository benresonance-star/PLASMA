import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openWorld } from '../src/store.mjs';
import { panelDomain, executeMockFea } from '../src/mock-fea.mjs';
import { createWorldGateway, explainPanelThickness } from '../src/gateway-host.mjs';
import { createCapabilityClient, createAuthorityClient, createInProcessTransport } from '../../kernel-gateway/src/index.mjs';

const [action = 'inspect', name = '.data/provenance-demo.sqlite'] = process.argv.slice(2);
if (!['create','inspect','rerun'].includes(action)) throw new Error('Use create, inspect or rerun followed by a database filename');
const filename = resolve(name);
if (action === 'create' && existsSync(filename)) throw new Error('Destination already exists; inspect it or choose a new filename');
if (action !== 'create' && !existsSync(filename)) throw new Error('Create the demonstration database first');
mkdirSync(dirname(filename), { recursive: true });
const domains = { panel: panelDomain, geometry: { version: 'mock-geometry/1', evaluate(snapshot, payload, capability) {
  if (!capability.panel || !Number.isFinite(payload.lengthMm) || payload.lengthMm <= 0) throw new Error('Invalid synthetic geometry');
  return { status: 'pass', state: { panel: { ...snapshot.state.panel, lengthMm: payload.lengthMm } },
    evidence: [{ status: 'pass', scope: 'synthetic geometry only' }], representations: [] };
} } };
const world = openWorld({ filename, initialState: { panel: { id: 'P27', thicknessMm: 10, lengthMm: 1000, steelGrade: 'S355' } },
  domains, authorize: (actor, _request, phase) => actor.id === 'governor' || (actor.id === 'solver' && phase === 'preview') ? { panel: true } : null });
try {
  const gateway = createWorldGateway({ world, authorize: ({ principal, action }) => ({
    allowed: ['governor','solver'].includes(principal.id) && (action !== 'proposal.publish' || principal.id === 'governor'),
  }) });
  const capability = createCapabilityClient({ transport: createInProcessTransport(gateway, { principal: { id: 'solver' } }) });
  const governor = createAuthorityClient({ transport: createInProcessTransport(gateway, { principal: { id: 'governor' } }) });
  if (action === 'create') {
    const record = executeMockFea(world, { runId: 'run:fea-1' });
    await capability.submitProposal(record.proposals[0], 'submit:fea-1');
    await governor.publishProposal({ proposalId: record.proposals[0].proposalId }, 'publish:fea-1');
    world.session({ id: 'governor' }).submit({ requestId: 'geometry:1', branch: 'main', baseRevision: 1,
      domain: 'geometry', payload: { lengthMm: 5000 } });
  }
  let rerun = null;
  if (action === 'rerun') rerun = executeMockFea(world, { runId: 'run:fea-2', version: '2', rerunOf: 'run:fea-1' });
  console.log(JSON.stringify({ filename, head: `R${world.snapshot().revision}`, explanation: explainPanelThickness(world), rerun }, null, 2));
} finally { world.close(); }
