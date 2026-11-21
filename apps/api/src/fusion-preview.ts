import type { FastifyInstance } from 'fastify';
import { composeFirstFusion, type FusionBinding } from '@spds/import-core';

/**
 * FUSION-01 is deliberately read-only. Import never changes the project head.
 * Integrating exact Loft geometry, construction compilation and commit is a
 * separate, evidence-gated phase.
 */
export function registerFusionPreviewRoute(app: FastifyInstance): void {
  app.post<{
    Body: {
      readonly buildProject: unknown;
      readonly loftProject: unknown;
      readonly bindings?: FusionBinding[];
    };
  }>('/imports/fusion/preview', async (req, reply) => {
    try {
      const output = composeFirstFusion(req.body);
      return reply.code(200).send(output);
    } catch (err) {
      return reply.code(422).send({
        failureCode: 'FUSION_RECONCILE_REJECTED',
        summary: err instanceof Error ? err.message : 'Invalid input',
        publicationReady: false,
      });
    }
  });
}
