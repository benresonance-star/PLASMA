import { open, clients } from './provenance-fixture.mjs';
import { executeMockFea } from '../src/mock-fea.mjs';
import { explainPanelThickness } from '../src/gateway-host.mjs';
const [filename, mode, stage] = process.argv.slice(2);
const world = open(filename, stage ? { fault: at => { if (at === stage) process.exit(73); } } : {});
try {
  const { capability, governor } = clients(world);
  if (mode === 'seed') {
    const run = executeMockFea(world, { runId: 'run:fea-1' });
    await capability.submitProposal(run.proposals[0], 'submit-fea');
    await governor.publishProposal({ proposalId: run.proposals[0].proposalId }, 'publish-fea');
    world.session({ id: 'human' }).submit({ requestId: 'geometry', branch: 'main', baseRevision: 1,
      domain: 'geometry', payload: { lengthMm: 5000 } });
  } else if (mode === 'publish') {
    await governor.publishProposal({ proposalId: 'proposal:run:fea-1' }, 'publish-fea');
  } else {
    const explanation = explainPanelThickness(world);
    const rerun = executeMockFea(world, { runId: 'run:fea-2', version: '2', rerunOf: 'run:fea-1' });
    console.log(JSON.stringify({ explanation, rerun, head: world.snapshot().revision }));
  }
} finally { world.close(); }
