import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asPromise, type VersionStore } from '@spds/version-core';
import { TransactionEngine } from '@spds/transaction-core';
import { sha256Canonical } from '@spds/reproducibility';
import {
  applyWallOperation,
  deriveWall,
  validateWall,
  wallOperationId,
  WallOperationSchema,
  type Wall,
  type WallOutput,
} from '@spds/wall-core';

const PreviewSchema = z
  .object({
    modelId: z.string().min(1),
    branchId: z.string().min(1),
    expectedHeadHash: z.string().min(1),
    operation: WallOperationSchema,
  })
  .strict();
const ScopeSchema = z.object({ modelId: z.string().min(1), branchId: z.string().min(1) }).strict();

/** Feature acceptance only: analytical outputs always retain issueReady=false. */
export function registerWallRoutes(app: FastifyInstance, store: VersionStore): void {
  const engine = new TransactionEngine(store);
  const previews = new Map<
    string,
    { modelId: string; branchId: string; wall: Wall; output: WallOutput }
  >();
  engine.setCompileAdapter(async ({ candidate }) => {
    // Compile the candidate rather than trusting an output supplied by a client or earlier worker.
    try {
      for (const object of Object.values(candidate.objects)) {
        const record = object as Record<string, unknown>;
        if (record['kind'] !== 'architecture.wall') continue;
        const wall = validateWall(record),
          output = deriveWall(wall);
        if (sha256Canonical(candidate.objects[output.id]) !== sha256Canonical(output))
          throw new Error('STALE_RESULT');
      }
      const digest = sha256Canonical(candidate.objects);
      return {
        ok: true,
        pirHash: digest,
        dagHash: digest,
        validationHash: digest,
        artifactHashes: [digest],
        pipelineHash: 'plasma.wall-preview@0.1.0',
      };
    } catch {
      return {
        ok: false,
        pirHash: 'failed',
        dagHash: 'failed',
        validationHash: 'failed',
        artifactHashes: [],
        failAt: 'validation',
      };
    }
  });
  async function scope(modelId: string, branchId: string) {
    const branch = await asPromise(store.getBranchHead(branchId));
    if (branch.modelId !== modelId) throw new Error('WALL_SCOPE: branch does not belong to model');
    return branch;
  }
  function error(reply: { code(status: number): { send(body: unknown): unknown } }, err: unknown) {
    const failure = z.object({ code: z.string(), summary: z.string() }).safeParse(err);
    const summary =
      err instanceof Error
        ? err.message
        : failure.success
          ? failure.data.summary
          : 'Wall operation failed';
    const conflict =
      (failure.success && failure.data.code === 'HEAD_CONFLICT') ||
      summary.includes('HEAD_CONFLICT');
    return reply
      .code(conflict ? 409 : 400)
      .send({ code: conflict ? 'HEAD_CONFLICT' : 'WALL_REJECTED', summary });
  }
  app.get('/walls/systems', async () => ({
    systems: [
      {
        id: 'wall-system:two-layer-study',
        version: '0.1.0',
        name: 'Two-layer wall study',
        status: 'experimental; no performance certification',
      },
    ],
    fidelity: 'analytical-preview',
    issueReady: false,
  }));
  app.get('/walls', async (req, reply) => {
    try {
      const input = ScopeSchema.parse(req.query),
        branch = await scope(input.modelId, input.branchId);
      const objects = await asPromise(store.listObjects(input.branchId));
      const walls = objects.filter((o) => o['kind'] === 'architecture.wall').map(validateWall);
      // Reconstruct from accepted parameters so reopen cannot promote a stale stored output.
      return {
        headHash: branch.headHash,
        walls,
        outputs: walls.map(deriveWall),
        issueReady: false,
      };
    } catch (err) {
      return error(reply, err);
    }
  });
  app.post('/walls/preview', async (req, reply) => {
    let transactionId: string | undefined;
    try {
      if (previews.size >= 256)
        throw new Error('Preview capacity reached; discard an unused candidate.');
      const input = PreviewSchema.parse(req.body);
      await scope(input.modelId, input.branchId);
      const id = wallOperationId(input.operation);
      const existing = await asPromise(store.getObject(input.branchId, id));
      if (existing && existing['kind'] !== 'architecture.wall')
        throw new Error('Wall identity collides with another entity.');
      const wall = applyWallOperation(
        existing ? validateWall(existing) : undefined,
        input.operation,
        input.expectedHeadHash,
      );
      const output = deriveWall(wall);
      const outputExisting = await asPromise(store.getObject(input.branchId, output.id));
      if (
        outputExisting &&
        (outputExisting['kind'] !== output.kind || outputExisting['wallId'] !== wall.id)
      )
        throw new Error('Wall output identity collides with another entity.');
      const txn = await engine.begin({
        modelId: input.modelId,
        branchId: input.branchId,
        actorId: 'user:wall-workbench',
        actorType: 'user',
        expectedHeadHash: input.expectedHeadHash,
        idempotencyKey: `wall:${randomUUID()}`,
      });
      transactionId = txn.id;
      const operationId = `${wall.id}:operation:${wall.featureRevision}`;
      if (await asPromise(store.getObject(input.branchId, operationId)))
        throw new Error('Operation lineage identity collision.');
      const lineage = {
        id: operationId,
        kind: 'architecture.wall-operation',
        wallId: wall.id,
        featureRevision: wall.featureRevision,
        operation: input.operation,
        sourceRevision: input.expectedHeadHash,
        sourceHash: output.sourceHash,
        transactionId: txn.id,
        actor: 'user:wall-workbench',
      };
      // One command, one version-store mutation: feature and output cannot partially publish.
      engine.appendCommand(txn.id, {
        id: `wall-op:${randomUUID()}`,
        type: 'APPLY_PATTERN',
        targetIds: [wall.id, output.id, operationId],
        payload: {
          domainOperation: input.operation,
          reads: existing ? [id] : [],
          writes: [wall.id, output.id, operationId],
          sourceRevision: input.expectedHeadHash,
          units: 'mm',
          objects: { [wall.id]: wall, [output.id]: output, [operationId]: lineage },
        },
      });
      await engine.buildCandidate(txn.id);
      await engine.compile(txn.id);
      previews.set(txn.id, { modelId: input.modelId, branchId: input.branchId, wall, output });
      return {
        transactionId: txn.id,
        baseRevision: input.expectedHeadHash,
        wall,
        output,
        affectedIds: [wall.id, output.id, operationId, ...wall.openings.map((o) => o.id)],
        acceptance: 'feature-only',
        issueReady: false,
      };
    } catch (err) {
      if (transactionId) engine.abort(transactionId, 'wall-preview-failed');
      return error(reply, err);
    }
  });
  app.post<{ Params: { id: string } }>('/walls/previews/:id/commit', async (req, reply) => {
    let matched = false;
    try {
      const input = ScopeSchema.parse(req.body),
        preview = previews.get(req.params.id);
      if (!preview || preview.modelId !== input.modelId || preview.branchId !== input.branchId)
        throw new Error('Unknown wall preview or mismatched scope.');
      matched = true;
      await scope(input.modelId, input.branchId);
      await engine.commit(req.params.id);
      previews.delete(req.params.id);
      const branch = await scope(input.modelId, input.branchId);
      return {
        transactionId: req.params.id,
        headHash: branch.headHash,
        wall: preview.wall,
        output: preview.output,
        issueReady: false,
      };
    } catch (err) {
      // Failed/stale candidates are never reusable. The caller must read the current head and preview again.
      if (matched) previews.delete(req.params.id);
      return error(reply, err);
    }
  });
  app.post<{ Params: { id: string } }>('/walls/previews/:id/discard', async (req, reply) => {
    try {
      const input = ScopeSchema.parse(req.body),
        preview = previews.get(req.params.id);
      if (!preview || preview.modelId !== input.modelId || preview.branchId !== input.branchId)
        throw new Error('Unknown wall preview or mismatched scope.');
      engine.abort(req.params.id, 'user-discard');
      previews.delete(req.params.id);
      return { discarded: true };
    } catch (err) {
      return error(reply, err);
    }
  });
}
