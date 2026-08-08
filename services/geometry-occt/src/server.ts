import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  ShellRequestSchema,
  SweepRequestSchema,
  TessellateRequestSchema,
} from '@spds/geometry-contracts';
import { createGeometryKernel, type GeometryKernel } from './kernel-factory.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';
import { generateD01YFixtureSet } from './y-brep.js';

export function buildGeometryServer(kernel: GeometryKernel = createGeometryKernel()) {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });

  app.get('/health', async () => ({ ...kernel.health(), service: 'geometry-occt' }));
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

  /** STEP text probe — entity counts (always available). */
  app.post<{ Body: { stepText?: string; headerText?: string } }>(
    '/v1/import/step/probe',
    async (req, reply) => {
      const stepText = req.body?.stepText ?? '';
      const headerText = req.body?.headerText ?? '';
      const solidMatches = stepText.match(/MANIFOLD_SOLID_BREP\s*\(/gi) ?? [];
      const unitsHint = /\.milli\./i.test(headerText)
        ? 'mm'
        : /\.inch\./i.test(headerText)
          ? 'inch'
          : 'ambiguous';
      return reply.send({
        solidCountHint: solidMatches.length,
        unitsHint,
        parametricClaim: 'reference-only',
        kernelBinding: kernel.kernelId,
        note:
          kernel instanceof OcctWasmKernel
            ? 'Text probe; use /v1/import/step for OCCT WASM B-rep mesh'
            : 'Text probe only — set GEOMETRY_KERNEL=occt-wasm for WASM STEP',
      });
    },
  );

  /** Live OCCT WASM STEP import (requires OcctWasmKernel). */
  app.post<{ Body: { stepText?: string; semanticOwnerPrefix?: string } }>(
    '/v1/import/step',
    async (req, reply) => {
      if (!(kernel instanceof OcctWasmKernel)) {
        return reply.code(501).send({
          code: 'OPERATOR_UNAVAILABLE',
          summary: 'OCCT WASM STEP import requires GEOMETRY_KERNEL=occt-wasm',
          recoverable: true,
          affectedSemanticIds: [],
        });
      }
      try {
        const imported = await kernel.importStep({
          bytes: req.body?.stepText ?? '',
          ...(req.body?.semanticOwnerPrefix !== undefined
            ? { semanticOwnerPrefix: req.body.semanticOwnerPrefix }
            : {}),
        });
        return reply.code(201).send(imported);
      } catch (err) {
        const e = err as {
          code?: string;
          summary?: string;
          recoverable?: boolean;
          affectedSemanticIds?: string[];
        };
        return reply.code(422).send({
          code: e.code ?? 'GEOMETRY_INVALID',
          summary: e.summary ?? 'STEP import failed',
          recoverable: e.recoverable ?? true,
          affectedSemanticIds: e.affectedSemanticIds ?? [],
        });
      }
    },
  );

  return { app, kernel };
}
