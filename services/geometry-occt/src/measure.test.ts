import { beforeAll, describe, expect, it } from 'vitest';
import { boxFeaturePath } from '@spds/geometry-contracts';
import { ExactKernelAdapter } from './exact-kernel.js';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';
import { buildGeometryServer } from './server.js';

const OWNER = 'component:y:measure';
const EXTENTS = {
  min: [0, -30, -90] as [number, number, number],
  max: [1000, 30, 90] as [number, number, number],
};

describe('kernel + HTTP measure (incl. angle)', () => {
  const native = new OcctNativeKernel();
  beforeAll(async () => {
    await native.ensureReady();
  }, 60_000);
  it('exact edge and face-face angle', () => {
    const k = new ExactKernelAdapter();
    const edge = k.measure({
      kind: 'edgeLength',
      semanticOwner: OWNER,
      extentsMm: EXTENTS,
      features: [boxFeaturePath(OWNER, 'edge', 0)],
    });
    expect(edge.unit).toBe('mm');
    expect(edge.provenance).toBe('brep');
    expect(edge.quantity).toBeGreaterThan(0);

    const ang = k.measure({
      kind: 'angle',
      semanticOwner: OWNER,
      extentsMm: EXTENTS,
      features: [boxFeaturePath(OWNER, 'face', '+x'), boxFeaturePath(OWNER, 'face', '+y')],
    });
    expect(ang.unit).toBe('deg');
    expect(ang.quantity).toBeCloseTo(90, 5);
  });

  it('native matches exact angle within 0.25°', () => {
    const exact = new ExactKernelAdapter();
    native.sweep({
      semanticOwner: OWNER,
      pirOperationId: 'pir:measure:1',
      path: [
        [0, 0, 0],
        [1000, 0, 0],
      ],
      profileWidthMm: 60,
      profileDepthMm: 180,
    });
    const features = [boxFeaturePath(OWNER, 'edge', 0), boxFeaturePath(OWNER, 'edge', 1)];
    const a = exact.measure({
      kind: 'angle',
      semanticOwner: OWNER,
      extentsMm: EXTENTS,
      features,
    });
    const b = native.measure({
      kind: 'angle',
      semanticOwner: OWNER,
      features,
      layer: 'geometry-service',
    });
    expect(Math.abs(a.quantity - b.quantity)).toBeLessThanOrEqual(0.25);
    expect(b.provenance).toBe('brep');
  });

  it('wasm measure is mesh-indicative', () => {
    const k = new OcctWasmKernel();
    const r = k.measure({
      kind: 'angle',
      semanticOwner: OWNER,
      extentsMm: EXTENTS,
      features: [boxFeaturePath(OWNER, 'face', '+x'), boxFeaturePath(OWNER, 'face', '+z')],
    });
    expect(r.provenance).toBe('mesh-indicative');
    expect(r.engine.label).toMatch(/indicative|WASM/i);
  });

  it('POST /v1/measure returns angle', async () => {
    const { app } = buildGeometryServer(new ExactKernelAdapter());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/measure',
      payload: {
        kind: 'angle',
        semanticOwner: OWNER,
        extentsMm: EXTENTS,
        features: [boxFeaturePath(OWNER, 'edge', 0), boxFeaturePath(OWNER, 'edge', 8)],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unit).toBe('deg');
    expect(body.quantity).toBeCloseTo(90, 5);
  });
});
