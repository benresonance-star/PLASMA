import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  ShellRequestSchema,
  SweepRequestSchema,
  TessellateRequestSchema,
} from '@spds/geometry-contracts';
import { ExactKernelAdapter } from './exact-kernel.js';
import { generateD01YFixtureSet } from './y-brep.js';

export function buildGeometryServer(kernel = new ExactKernelAdapter()) {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });

  app.get('/health', async () => kernel.health());
  app.get('/version', async () => ({
    service: 'geometry-occt',
    kernel: kernel.kernelId,
    version: kernel.version,
  }));

  app.post('/v1/sweep', async (req, reply) => {
    const body = SweepRequestSchema.parse(req.body);
    return reply.code(201).send(kernel.sweep(body));
  });

  app.post('/v1/tessellate', async (req, reply) => {
    const body = TessellateRequestSchema.parse(req.body);
    return reply.send(kernel.tessellate(body));
  });

  app.post('/v1/shell', async (req, reply) => {
    try {
      const body = ShellRequestSchema.parse(req.body);
      return reply.send(kernel.shell(body));
    } catch (err) {
      const e = err as {
        code?: string;
        summary?: string;
        recoverable?: boolean;
        affectedSemanticIds?: string[];
        operationOrPirId?: string;
        details?: unknown;
      };
      if (e.code) {
        return reply.code(422).send({
          code: e.code,
          summary: e.summary,
          recoverable: e.recoverable ?? false,
          affectedSemanticIds: e.affectedSemanticIds ?? [],
          ...(e.operationOrPirId !== undefined ? { operationOrPirId: e.operationOrPirId } : {}),
          ...(e.details !== undefined ? { details: e.details } : {}),
        });
      }
      throw err;
    }
  });

  app.post<{ Body: { limit?: number } }>('/v1/fixtures/d01-y', async (req, reply) => {
    const reps = generateD01YFixtureSet(kernel, req.body?.limit ?? 10);
    return reply.code(201).send({
      count: reps.length,
      representations: reps,
      allValid: reps.every((r) => r.mass.volumeMm3 > 0 && r.validationState === 'geometry-generated'),
    });
  });

  return { app, kernel };
}
