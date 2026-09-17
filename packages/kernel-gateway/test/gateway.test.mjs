import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KERNEL_GATEWAY_CONTRACT,
  KernelGatewayError,
  createAuthorityClient,
  createCapabilityClient,
  createInProcessTransport,
  createKernelGateway,
} from '../src/index.mjs';

function fixture() {
  const calls = [];
  const ports = {
    readWorld: async (ctx) => {
      calls.push(['readWorld', ctx]);
      return {
        revision: ctx.request.payload.revision === 'head' ? 'R7' : ctx.request.payload.revision,
        entities: [],
      };
    },
    submitProposal: async (ctx) => {
      calls.push(['submitProposal', ctx]);
      return {
        proposalId: ctx.request.payload.proposalId,
        status: 'proposed',
        baseRevision: ctx.request.payload.baseRevision,
      };
    },
    getProposal: async (ctx) => {
      calls.push(['getProposal', ctx]);
      return { proposalId: ctx.request.payload.proposalId, status: 'ready' };
    },
    getHistory: async (ctx) => {
      calls.push(['getHistory', ctx]);
      return { found: true, ref: ctx.request.payload };
    },
    publishProposal: async (ctx) => {
      calls.push(['publishProposal', ctx]);
      return {
        proposalId: ctx.request.payload.proposalId,
        status: 'committed',
        resultingRevision: 'R8',
      };
    },
  };
  const authorize = async ({ principal, action }) => ({
    allowed: action !== 'proposal.publish' || principal.roles?.includes('governor') === true,
    reason: 'fixture_policy',
    grantId: `grant:${principal.id}:${action}`,
  });
  return { calls, gateway: createKernelGateway({ authorize, ports }) };
}

const fixedIds = () => {
  let n = 0;
  return () => `req-${++n}`;
};

test('capability client can read a pinned/resolved world view and has no publish method', async () => {
  const { gateway } = fixture();
  const transport = createInProcessTransport(gateway, {
    principal: { id: 'agent:fea', roles: ['capability'] },
  });
  const client = createCapabilityClient({ transport, nextRequestId: fixedIds() });
  assert.equal(client.publishProposal, undefined);
  const result = await client.readWorld({
    revision: 'head',
    selector: { entities: ['panel:P27'] },
  });
  assert.equal(result.revision, 'R7');
});

test('raw publish attempt is denied for a capability principal even if client code is bypassed', async () => {
  const { gateway } = fixture();
  const transport = createInProcessTransport(gateway, {
    principal: { id: 'agent:fea', roles: ['capability'] },
  });
  await assert.rejects(
    () =>
      transport.request({
        contractVersion: KERNEL_GATEWAY_CONTRACT,
        requestId: 'req-raw-publish',
        method: 'proposal.publish',
        payload: { proposalId: 'proposal:12mm' },
        idempotencyKey: 'publish:proposal:12mm',
      }),
    (error) => error instanceof KernelGatewayError && error.code === 'FORBIDDEN',
  );
});

test('governor can publish an existing proposal but cannot smuggle transforms into publish', async () => {
  const { gateway } = fixture();
  const transport = createInProcessTransport(gateway, {
    principal: { id: 'human:ben', roles: ['governor'] },
  });
  const client = createAuthorityClient({ transport, nextRequestId: fixedIds() });
  const committed = await client.publishProposal(
    { proposalId: 'proposal:12mm' },
    'publish:proposal:12mm',
  );
  assert.equal(committed.resultingRevision, 'R8');

  await assert.rejects(
    () =>
      transport.request({
        contractVersion: KERNEL_GATEWAY_CONTRACT,
        requestId: 'req-smuggle',
        method: 'proposal.publish',
        payload: { proposalId: 'proposal:12mm', transforms: [{ type: 'anything' }] },
        idempotencyKey: 'publish:smuggle',
      }),
    (error) => error instanceof KernelGatewayError && error.code === 'INVALID_REQUEST',
  );
});

test('proposal requires exact base revision, typed transforms and idempotency', async () => {
  const { gateway } = fixture();
  const transport = createInProcessTransport(gateway, {
    principal: { id: 'agent:fea', roles: ['capability'] },
  });
  const client = createCapabilityClient({ transport, nextRequestId: fixedIds() });

  const proposal = {
    proposalId: 'proposal:12mm',
    baseRevision: 'R42',
    transforms: [
      {
        type: 'state.set-property',
        schemaVersion: '1.0.0',
        targetRefs: ['panel:P27'],
        payload: { path: 'thicknessMm', value: 12 },
      },
    ],
    evidenceRefs: ['evidence:fea-0187'],
    runRef: 'run:fea-0187',
  };
  const result = await client.submitProposal(proposal, 'proposal:fea-0187:12mm');
  assert.equal(result.status, 'proposed');

  await assert.rejects(
    () => client.submitProposal({ ...proposal, baseRevision: 'head' }, 'bad-head'),
    (error) => error instanceof KernelGatewayError && error.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    () => client.submitProposal(proposal),
    (error) => error instanceof KernelGatewayError && error.code === 'INVALID_REQUEST',
  );
});

test('request identity cannot be self-declared and transport context is authoritative', async () => {
  const { gateway, calls } = fixture();
  const transport = createInProcessTransport(gateway, {
    principal: { id: 'agent:actual', roles: ['capability'] },
  });

  await assert.rejects(
    () =>
      transport.request({
        contractVersion: KERNEL_GATEWAY_CONTRACT,
        requestId: 'req-identity',
        method: 'world.read',
        payload: { revision: 'R1', selector: { entities: [] } },
        actor: { id: 'human:fake' },
      }),
    (error) => error instanceof KernelGatewayError && error.code === 'SELF_DECLARED_IDENTITY',
  );

  const client = createCapabilityClient({ transport, nextRequestId: fixedIds() });
  await client.readWorld({ revision: 'R1', selector: { entities: [] } });
  assert.equal(calls.at(-1)[1].principal.id, 'agent:actual');
});

test('unknown methods and generic write-shaped requests are not part of the gateway surface', async () => {
  const { gateway } = fixture();
  const transport = createInProcessTransport(gateway, {
    principal: { id: 'agent:test', roles: ['capability'] },
  });
  await assert.rejects(
    () =>
      transport.request({
        contractVersion: KERNEL_GATEWAY_CONTRACT,
        requestId: 'req-write',
        method: 'world.write',
        payload: { snapshot: { replace: true } },
      }),
    (error) => error instanceof KernelGatewayError && error.code === 'UNKNOWN_METHOD',
  );
});
