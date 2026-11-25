import { describe, expect, it } from 'vitest';
import { DEFAULT_VECTOR_STYLE, parseVectorScene, renderVectorSvg, vectorSceneIsCurrent } from './vector-scene.js';
const source = { semanticOwner: 'owner<&"', representationId: 'repr:1', topologyPath: 'edge:1' };
const fixture = () => parseVectorScene({
  schemaVersion: 1,
  pins: { buildingRevision: 'b1', documentIntentRevision: 'd1', viewDefinitionVersion: 'v1', representationGrammarVersion: 'g1', producerVersion: 'p1' },
  viewId: 'front', projection: 'orthographic',
  evidence: { kind: 'fixture', description: 'Synthetic projected data; not OCCT evidence' },
  frame: { x: 0, y: 0, width: 1000, height: 500, scaleDenominator: 10 },
  primitives: [
    { id: 'a', kind: 'line', source, role: 'silhouette', start: [0,0], end: [1000,0] },
    { id: 'b', kind: 'line', source, role: 'hidden', start: [0,0], end: [0,500] },
    { id: 'c', kind: 'region', source, role: 'cut', loops: [[[0,0],[100,0],[100,100],[0,100]], [[20,20],[80,20],[80,80],[20,80]]] },
  ],
});
describe('derived vector boundary', () => {
  it('detects stale revision pins', () => {
    const scene = fixture();
    expect(vectorSceneIsCurrent(scene, scene.pins)).toBe(true);
    expect(vectorSceneIsCurrent(scene, { ...scene.pins, documentIntentRevision: 'd2' })).toBe(false);
  });
  it('rejects invalid scale and duplicate IDs', () => {
    const scene = fixture();
    expect(() => parseVectorScene({ ...scene, frame: { ...scene.frame, scaleDenominator: 0 } })).toThrow();
    expect(() => parseVectorScene({ ...scene, primitives: [scene.primitives[0], scene.primitives[0]] })).toThrow();
  });
  it('preserves physical pen widths and does not mutate the scene', () => {
    const scene = fixture(), snapshot = JSON.stringify(scene);
    const svg = renderVectorSvg(scene);
    const bold = renderVectorSvg(scene, { ...DEFAULT_VECTOR_STYLE, pens: { ...DEFAULT_VECTOR_STYLE.pens, silhouette: { stroke: '#222222', paperWidthMm: 1 } } });
    expect(svg).toContain('width="100mm" height="50mm"');
    expect(svg).toContain('stroke-width="7"');
    expect(bold).toContain('stroke-width="10"');
    expect(bold).toContain('d="M 0 0 L 1000 0"');
    expect(JSON.stringify(scene)).toBe(snapshot);
    expect(renderVectorSvg(scene)).toBe(svg);
  });
  it('preserves provenance, escapes attributes and supports hidden lines and holes', () => {
    const svg = renderVectorSvg(fixture());
    expect(svg).toContain('data-owner="owner&lt;&amp;&quot;"');
    expect(svg).toContain('data-topology-path="edge:1"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).not.toContain('data-role="hidden"');
    expect(renderVectorSvg(fixture(), { ...DEFAULT_VECTOR_STYLE, hiddenVisible: true })).toContain('stroke-dasharray="15 7.5"');
  });
  it('rejects unsupported paint', () => {
    expect(() => renderVectorSvg(fixture(), { ...DEFAULT_VECTOR_STYLE, regionFill: 'url(https://example.com)' })).toThrow();
  });
});
