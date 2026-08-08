import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryVersionStore } from '@spds/version-core';
import { parseSemanticObject } from '@spds/semantic-core';
import {
  QueryAstSchema,
  buildG3bFixture,
  executeQuery,
  explainObject,
  traceLineage,
} from '@spds/semantic-query';
import { DesignCommandSchema, TransactionEngine } from '@spds/transaction-core';
import { buildA01AssemblyFixture } from '@spds/assembly-core';

export function buildServer(store = new InMemoryVersionStore()) {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });
  const g3b = buildG3bFixture();
  const txEngine = new TransactionEngine(store);
  const a01 = buildA01AssemblyFixture();

  app.get('/health', async () => ({ status: 'ok', service: 'spds-api' }));

  app.post<{ Body: { name: string } }>('/models', async (req, reply) => {
    const model = store.createModel(req.body.name);
    const branchId = store.getMainBranchId(model.modelId);
    return reply.code(201).send({
      model,
      branchId,
      headHash: store.getBranchHead(branchId).headHash,
    });
  });

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/objects',
    async (req) => ({ objects: store.listObjects(req.params.branchId) }),
  );

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { expectedHeadHash: string; object: unknown; actorId?: string };
  }>('/models/:modelId/branches/:branchId/objects', async (req, reply) => {
    const object = parseSemanticObject(req.body.object);
    const event = store.upsertObject(
      req.params.branchId,
      { type: 'user', id: req.body.actorId ?? 'api-user' },
      req.body.expectedHeadHash,
      object as Record<string, unknown> & { id: string },
    );
    return reply.code(201).send({ event, headHash: event.afterHash, object });
  });

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { name?: string };
  }>('/models/:modelId/branches/:branchId/snapshots', async (req, reply) => {
    const snap = store.snapshot(req.params.branchId, req.body?.name);
    return reply.code(201).send({ snapshot: snap });
  });

  app.post<{
    Params: { modelId: string };
    Body: { name: string; fromBranchId: string };
  }>('/models/:modelId/branches', async (req, reply) => {
    const branch = store.createBranch(req.params.modelId, req.body.name, req.body.fromBranchId);
    return reply.code(201).send({ branch });
  });

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { snapshotId: string; actorId?: string };
  }>('/models/:modelId/branches/:branchId/restore', async (req, reply) => {
    const event = store.restoreToNewHead(
      req.params.branchId,
      req.body.snapshotId,
      { type: 'user', id: req.body.actorId ?? 'api-user' },
    );
    return reply.send({ event, headHash: event.afterHash });
  });

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/head',
    async (req) => ({ branch: store.getBranchHead(req.params.branchId) }),
  );

  app.post<{ Params: { modelId: string }; Body: unknown }>(
    '/models/:modelId/query',
    async (req, reply) => {
      const ast = QueryAstSchema.parse(req.body);
      return reply.send({ modelId: req.params.modelId, result: executeQuery(g3b.graph, ast) });
    },
  );

  app.post<{
    Params: { modelId: string };
    Body: { targetId: string; changedParameters?: string[] };
  }>('/models/:modelId/explain', async (req, reply) => {
    const packet = explainObject({
      targetId: req.body.targetId,
      graph: g3b.graph,
      provenance: g3b.provenance,
      dependencyEdges: g3b.dependencyEdges,
      ...(req.body.changedParameters !== undefined
        ? { changedParameters: req.body.changedParameters }
        : {}),
    });
    return reply.send({ modelId: req.params.modelId, explain: packet });
  });

  app.post<{ Params: { modelId: string }; Body: { semanticAnchor: string } }>(
    '/models/:modelId/trace',
    async (req, reply) => {
      const steps = traceLineage(g3b.provenance, req.body.semanticAnchor);
      return reply.send({ modelId: req.params.modelId, trace: steps });
    },
  );

  app.post<{
    Params: { modelId: string };
    Body: {
      branchId: string;
      actorId: string;
      actorType: 'user' | 'ai' | 'system';
      expectedHeadHash: string;
      idempotencyKey: string;
    };
  }>('/models/:modelId/transactions', async (req, reply) => {
    const txn = txEngine.begin({
      modelId: req.params.modelId,
      branchId: req.body.branchId,
      actorId: req.body.actorId,
      actorType: req.body.actorType,
      expectedHeadHash: req.body.expectedHeadHash,
      idempotencyKey: req.body.idempotencyKey,
    });
    return reply.code(201).send({ transaction: txn });
  });

  app.post<{
    Params: { modelId: string; txnId: string };
    Body: unknown;
  }>('/models/:modelId/transactions/:txnId/commands', async (req, reply) => {
    const command = DesignCommandSchema.parse(req.body);
    const txn = txEngine.appendCommand(req.params.txnId, command);
    return reply.code(201).send({ transaction: txn });
  });

  app.post<{ Params: { modelId: string; txnId: string } }>(
    '/models/:modelId/transactions/:txnId/abort',
    async (req, reply) => {
      const txn = txEngine.abort(req.params.txnId);
      return reply.send({ transaction: txn });
    },
  );

  app.post<{ Params: { modelId: string; txnId: string } }>(
    '/models/:modelId/transactions/:txnId/validate',
    async (req, reply) => {
      const candidate = txEngine.buildCandidate(req.params.txnId);
      return reply.send({ candidate, transaction: txEngine.getTransaction(req.params.txnId) });
    },
  );

  app.get('/assemblies/a01/inspector', async (_req, reply) => {
    return reply.send({
      inspector: a01.registry.inspector(),
      frames: a01.frames,
      transforms: a01.transforms,
      importPlaceholder: a01.importPlaceholder,
    });
  });

  return { app, store, txEngine };
}
