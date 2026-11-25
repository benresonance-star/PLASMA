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
  it('controls hidden dash length, gap, phase, opacity, cap and pen independently', () => {
    const scene = fixture();
    const before = JSON.stringify(scene);
    const style = { ...DEFAULT_VECTOR_STYLE, hiddenVisible: true,
      pens: { ...DEFAULT_VECTOR_STYLE.pens, hidden: { stroke: '#123456', paperWidthMm: 0.2 } },
      hiddenLine: { patternPaperMm: [3, 1, 0.5, 1], offsetPaperMm: 0.5, opacity: 0.4, cap: 'butt' as const },
    };
    const svg = renderVectorSvg(scene, style);
    const hiddenPath = svg.match(/<path [^>]*data-role="hidden"[^>]*\/>/)?.[0] ?? '';
    expect(hiddenPath).toContain('stroke="#123456"');
    expect(hiddenPath).toContain('stroke-width="2"');
    expect(hiddenPath).toContain('stroke-dasharray="30 10 5 10"');
    expect(hiddenPath).toContain('stroke-dashoffset="5"');
    expect(hiddenPath).toContain('stroke-opacity="0.4"');
    expect(hiddenPath).toContain('stroke-linecap="butt"');
    expect(renderVectorSvg({ ...scene, frame: { ...scene.frame, scaleDenominator: 20 } }, style)).toContain('stroke-dasharray="60 20 10 20"');
    expect(JSON.stringify(scene)).toBe(before);
    expect(renderVectorSvg(scene, { ...style, hiddenVisible: false })).not.toContain('data-role="hidden"');
  });
  it('supports continuous hidden strokes, scoped selectors and legacy style inputs', () => {
    const scene = fixture();
    const style = { ...DEFAULT_VECTOR_STYLE, hiddenVisible: true,
      hiddenLine: { ...DEFAULT_VECTOR_STYLE.hiddenLine, patternPaperMm: null } };
    expect(renderVectorSvg(scene, style)).toContain('data-role="hidden"');
    expect(renderVectorSvg(scene, style)).not.toContain('stroke-dasharray');
    expect(renderVectorSvg(scene, { ...style, hiddenLine: { ...style.hiddenLine, ownerIds: ['other'] } })).not.toContain('data-role="hidden"');
    expect(renderVectorSvg(scene, { ...style, hiddenLine: { ...style.hiddenLine, topologyPaths: ['edge:1'] } })).toContain('data-role="hidden"');
    expect(renderVectorSvg(scene, { ...style, hiddenLine: { ...style.hiddenLine, topologyPaths: [] } })).not.toContain('data-role="hidden"');
    const { pens, regionFill, hiddenVisible } = { ...DEFAULT_VECTOR_STYLE, hiddenVisible: true };
    expect(renderVectorSvg(scene, { pens, regionFill, hiddenVisible })).toContain('stroke-dasharray="15 7.5"');
  });
  it('rejects invalid hidden patterns and opacity; does not fill hidden regions', () => {
    const scene = fixture(), style = { ...DEFAULT_VECTOR_STYLE, hiddenVisible: true };
    for (const patternPaperMm of [[0,1], [1,2,3], [-1,2], []]) {
      expect(() => renderVectorSvg(scene, { ...style, hiddenLine: { patternPaperMm } })).toThrow();
    }
    expect(() => renderVectorSvg(scene, { ...style, hiddenLine: { opacity: 1.5 } })).toThrow();
    const withHiddenRegion = parseVectorScene({ ...scene, primitives: [{ ...scene.primitives[2], role: 'hidden' }] });
    expect(renderVectorSvg(withHiddenRegion, style)).toContain('fill="none"');
  });
});