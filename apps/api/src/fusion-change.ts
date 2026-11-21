import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import {
  proposeFirstFusionChange, type FusionChangeInput,
} from '@spds/import-core';

/** Read-only, revision-pinned proposal; no transaction is started and no branch is mutated. */
export function registerFusionChangeRoute(app: FastifyInstance, store: VersionStore): void {
  app.post<{
    Body: FusionChangeInput & {
      readonly modelId: string;
      readonly branchId: string;
      readonly expectedHeadHash: string;
    };
  }>('/imports/fusion/changeset-preview', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body.modelId !== 'string' || !body.modelId ||
        typeof body.branchId !== 'string' || !body.branchId ||
        typeof body.expectedHeadHash !== 'string' || !body.expectedHeadHash) {
      return reply.code(422).send({ failureCode: 'FUSION_BASE_REQUIRED' });
    }
    try {
      const branch = await asPromise(store.getBranchHead(body.branchId));
      if (branch.modelId !== body.modelId ||
          branch.headHash !== body.expectedHeadHash) {
        return reply.code(409).send({
          failureCode: 'FUSION_HEAD_CONFLICT',
          summary: 'Project head changed or branch belongs to another model',
        });
      }
      const preview = proposeFirstFusionChange(body);
      // Recheck the head for a concurrent edit before reporting the proposed impact.
      const after = await asPromise(store.getBranchHead(body.branchId));
      if (after.headHash !== body.expectedHeadHash) {
        return reply.code(409).send({ failureCode: 'FUSION_HEAD_CONFLICT' });
      }
      return reply.code(200).send({
        ...preview, modelId: body.modelId, branchId: body.branchId,
        basedOnHeadHash: body.expectedHeadHash,
      });
    } catch (err) {
      return reply.code(422).send({
        failureCode: 'FUSION_CHANGE_REJECTED',
        summary: err instanceof Error ? err.message : 'Invalid change proposal',
        committed: false,
      });
    }
  });
}
