import { describe, expect, it, beforeAll } from 'vitest';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { buildGeometryServer } from './server.js';
import { createGeometryKernel } from './kernel-factory.js';
import { NativeLineProjectionRequestSchema } from './native-line-projection.js';

describe('OCCT native mapped-line projection', () => {
  const kernel = new OcctNativeKernel();
  beforeAll(async () => { await kernel.ensureReady(); }, 60_000);
  const frame = (representationId: string) => NativeLineProjectionRequestSchema.parse({
    representationId, origin: [0,0,0], right: [1,0,0], down: [0,1,0],
  });
  it('projects a real native rectangular prism without claiming visibility', () => {
    const rep = kernel.extrude({
      semanticOwner: 'vector:fixture', pirOperationId: 'pir:vector:fixture',
      profile: [[0,0,0],[40,0,0],[40,30,0],[0,30,0]], vector: [0,0,20],
    });
    const result = kernel.projectMappedStraightEdges(frame(rep.id));
    expect(result.kernel).toBe('occt-native');
    expect(result.visibility).toBe('unclassified');
    expect(result.edges).toHaveLength(12);
    expect(result.edges.filter(e => e.collapsed)).toHaveLength(4);
    const points = result.edges.flatMap(e => [e.start, e.end]);
    expect(Math.max(...points.map(p => p[0]))).toBeCloseTo(40, 7);
    expect(Math.max(...points.map(p => p[1]))).toBeCloseTo(30, 7);
    expect(Math.min(...points.map(p => p[0]))).toBeCloseTo(0, 7);
    expect(Math.min(...points.map(p => p[1]))).toBeCloseTo(0, 7);
    expect(new Set(result.edges.map(e => e.topologyPath)).size).toBe(12);
    expect(kernel.projectMappedStraightEdges(frame(rep.id)).projectionDigest).toBe(result.projectionDigest);
  });
  it('rejects unknown native sources and non-orthogonal projection frames', () => {
    expect(() => kernel.projectMappedStraightEdges(frame('unknown'))).toThrow(/source unavailable/);
    expect(() => NativeLineProjectionRequestSchema.parse({ ...frame('x'), down: [1,0,0] })).toThrow();
  });
  it('returns real projected lines through the native HTTP route', async () => {
    const rep = kernel.extrude({
      semanticOwner: 'vector:http', pirOperationId: 'pir:vector:http',
      profile: [[0,0,0],[40,0,0],[40,30,0],[0,30,0]], vector: [0,0,20],
    });
    const { app } = buildGeometryServer(kernel);
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/projection/mapped-lines', payload: frame(rep.id) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(kernel.projectMappedStraightEdges(frame(rep.id)));
      const missing = await app.inject({ method: 'POST', url: '/v1/projection/mapped-lines', payload: frame('unknown') });
      expect(missing.statusCode).toBe(422);
    } finally { await app.close(); }
  });
  it('never substitutes a different kernel on the HTTP route', async () => {
    const { app } = buildGeometryServer(createGeometryKernel('exact-adapter'));
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/projection/mapped-lines', payload: frame('unknown') });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('OPERATOR_UNAVAILABLE');
    } finally { await app.close(); }
  });
});
