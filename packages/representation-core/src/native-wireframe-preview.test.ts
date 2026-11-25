import { describe, expect, it } from 'vitest';
import { nativeWireframePreview } from './native-wireframe-preview.js';
import { parseVectorScene, renderVectorSvg, vectorSceneIsCurrent } from './vector-scene.js';
const digest = 'a'.repeat(64);
const payload = () => ({
  representationId: 'r1', semanticOwner: 'part', kernel: 'occt-native', kernelVersion: 'test',
  visibility: 'unclassified', provenance: 'bounds-matched-provisional', scope: 'mapped-straight-edges',
  projectionDigest: digest, frame: { representationId: 'r1', origin: [0,0,0], right: [1,0,0], down: [0,1,0] },
  edges: [{ topologyPath: 'edge:0', start: [0,0], end: [40,0], collapsed: false },
    { topologyPath: 'edge:1', start: [0,0], end: [0,0], collapsed: true }],
});
const options = { expectedRepresentationId: 'r1', expectedProjectionDigest: digest, viewId: 'front', scaleDenominator: 1 };
describe('native wireframe preview boundary (synthetic DTO tests)', () => {
  it('preserves source, excludes collapsed edges and blocks publication', () => {
    const scene = nativeWireframePreview(payload(), options);
    expect(scene.primitives).toHaveLength(1);
    expect(scene.primitives[0]?.role).toBe('unclassified');
    expect(vectorSceneIsCurrent(scene, scene.pins)).toBe(false);
    expect(renderVectorSvg(scene)).toContain('data-publication="blocked"');
    expect(renderVectorSvg(scene)).toContain('WIREFRAME PREVIEW');
    expect(renderVectorSvg(scene)).toContain('d="M 0 0 L 40 0"');
    expect(() => parseVectorScene({ ...scene, primitives: [{ ...scene.primitives[0], role: 'silhouette' }] })).toThrow();
  });
  it('rejects mismatched identity or stale expected digest', () => {
    expect(() => nativeWireframePreview(payload(), { ...options, expectedRepresentationId: 'r2' })).toThrow();
    expect(() => nativeWireframePreview(payload(), { ...options, expectedProjectionDigest: 'b'.repeat(64) })).toThrow();
  });
  it('rejects duplicate, misclassified and inconsistent edges', () => {
    const p = payload();
    expect(() => nativeWireframePreview({ ...p, edges: [p.edges[0], p.edges[0]] }, options)).toThrow();
    expect(() => nativeWireframePreview({ ...p, visibility: 'visible' }, options)).toThrow();
    expect(() => nativeWireframePreview({ ...p, edges: [{ ...p.edges[0], collapsed: true }] }, options)).toThrow();
  });
});
