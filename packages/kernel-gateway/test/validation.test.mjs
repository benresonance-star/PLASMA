import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KERNEL_GATEWAY_CONTRACT,
  KernelGatewayError,
  createKernelGateway,
  createInProcessTransport,
} from '../src/index.mjs';

const proposal = () => ({
  proposalId: 'proposal:12mm',
  baseRevision: 'R42',
  transforms: [{ type: 'state.set-property', targetRefs: ['panel:P27'], payload: { value: 12 } }],
});
const request = (payload, method = 'proposal.submit') => ({
  contractVersion: KERNEL_GATEWAY_CONTRACT,
  requestId: 'req-validation',
  method,
  payload,
  idempotencyKey: 'validation-key',
});
const invalid = (error) => error instanceof KernelGatewayError && error.code === 'INVALID_REQUEST';

function fixture({ authorize = async () => ({ allowed: true }), result } = {}) {
  const calls = [];
  const decisions = [];
  const port = async (ctx) => {
    calls.push(ctx);
    return result ?? ctx.request.payload;
  };
  const gateway = createKernelGateway({
    authorize: async (ctx) => { decisions.push(ctx); return authorize(ctx); },
    ports: Object.fromEntries(
      ['readWorld', 'submitProposal', 'getProposal', 'getHistory', 'publishProposal'].map((name) => [name, port]),
    ),
  });
  return {
    calls, decisions,
    transport: createInProcessTransport(gateway, { principal: { id: 'agent:fea' } }),
  };
}

test('changing accessors are rejected without execution before authorization', async () => {
  const { transport, calls, decisions } = fixture();
  let reads = 0;
  const payload = proposal();
  Object.defineProperty(payload, 'baseRevision', {
    enumerable: true,
    get: () => ++reads <= 3 ? 'R42' : 'head',
  });
  await assert.rejects(() => transport.request(request(payload)), invalid);
  assert.equal(reads, 0);
  assert.equal(decisions.length, 0);
  assert.equal(calls.length, 0);
});

test('array element accessors are rejected without execution', async () => {
  const { transport, calls } = fixture();
  const payload = proposal();
  let reads = 0;
  Object.defineProperty(payload.transforms, '0', {
    enumerable: true,
    get: () => { reads++; return proposal().transforms[0]; },
  });
  await assert.rejects(() => transport.request(request(payload)), invalid);
  assert.equal(reads, 0);
  assert.equal(calls.length, 0);
});

test('sparse arrays are rejected throughout proposal data before authorization', async () => {
  const edits = [
    (p) => { p.transforms = new Array(1); },
    (p) => { p.transforms.length = 2; },
    (p) => { p.transforms[0].targetRefs = new Array(1); },
    (p) => { p.evidenceRefs = new Array(1); },
    (p) => { p.intentRefs = new Array(1); },
    (p) => { p.transforms[0].payload.samples = new Array(1); },
    (p) => { p.transforms = Object.assign(new Array(1), { extra: 'not an index' }); },
  ];
  const { transport, calls, decisions } = fixture();
  for (const edit of edits) {
    const payload = proposal();
    edit(payload);
    await assert.rejects(() => transport.request(request(payload)), invalid);
  }
  assert.equal(decisions.length, 0);
  assert.equal(calls.length, 0);
});

test('history requires one supplied reference with a nonblank string value', async () => {
  const { transport, calls, decisions } = fixture();
  for (const payload of [
    {}, { revision: 'R1', proposalId: 42 }, { revision: 'R1', runId: { unexpected: true } },
    { revision: 'R1', eventId: '' }, { revision: 'R1', proposalId: 'p' },
    { revision: '   ' }, { revision: '' }, { revision: null }, { revision: 42 },
  ]) {
    await assert.rejects(() => transport.request(request(payload, 'history.get')), invalid);
  }
  assert.equal(decisions.length, 0);
  assert.equal(calls.length, 0);
});

test('all supported history references remain valid', async () => {
  const { transport } = fixture();
  for (const key of ['revision', 'eventId', 'transformId', 'proposalId', 'runId']) {
    const payload = { [key]: 'reference:1' };
    assert.deepEqual(await transport.request(request(payload, 'history.get')), payload);
  }
});

test('caller and policy mutations cannot change the validated host request', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { transport, calls } = fixture({ authorize: async ({ request: candidate }) => {
    candidate.payload.baseRevision = 'policy-mutation';
    await gate;
    return { allowed: true };
  } });
  const payload = proposal();
  const pending = transport.request(request(payload));
  payload.baseRevision = 'head';
  payload.transforms[0].payload.value = 99;
  release();
  const response = await pending;
  assert.deepEqual(calls[0].request.payload, proposal());
  response.transforms[0].payload.value = 123;
  assert.equal(calls[0].request.payload.transforms[0].payload.value, 12);
});

test('plain data preserves null, dense arrays, shared values and null-prototype objects', async () => {
  const { transport } = fixture();
  const payload = proposal();
  const shared = Object.assign(Object.create(null), { count: 2 });
  payload.transforms[0].payload = { samples: [null, false, 0, ''], first: shared, second: shared };
  assert.deepEqual(await transport.request(request(payload)), JSON.parse(JSON.stringify(payload)));
});

test('cyclic request data is rejected as an invalid request', async () => {
  const { transport, calls } = fixture();
  const payload = proposal();
  payload.transforms[0].payload.self = payload;
  await assert.rejects(() => transport.request(request(payload)), invalid);
  assert.equal(calls.length, 0);
});

test('results also reject accessors and sparse arrays', async () => {
  let reads = 0;
  const result = { get revision() { reads++; return 'R42'; } };
  await assert.rejects(() => fixture({ result }).transport.request(request(proposal())), invalid);
  assert.equal(reads, 0);
  await assert.rejects(
    () => fixture({ result: { values: new Array(1) } }).transport.request(request(proposal())), invalid,
  );
});
