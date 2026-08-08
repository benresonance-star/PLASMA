import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryVersionStore } from '@spds/version-core';
import { parseSemanticObject } from '@spds/semantic-core';

export function buildServer(store = new InMemoryVersionStore()) {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });

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

  return { app, store };
}
