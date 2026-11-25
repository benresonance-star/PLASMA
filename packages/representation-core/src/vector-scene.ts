import { z } from 'zod';

// Derived projected model millimetres, x-right/y-down. Not a physical geometry store.
const id = z.string().min(1);
const finite = z.number().finite();
const point = z.tuple([finite, finite]);
const source = z.object({ semanticOwner: id, representationId: id, topologyPath: id.optional() });
const role = z.enum(['silhouette', 'cut', 'component', 'detail', 'hidden', 'unclassified']);
const pins = z.object({
  buildingRevision: id, documentIntentRevision: id, viewDefinitionVersion: id,
  representationGrammarVersion: id, producerVersion: id,
});
const common = { id, source, role };
export const VectorPrimitiveSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('line'), start: point, end: point }),
  z.object({ ...common, kind: z.literal('polyline'), points: z.array(point).min(2) }),
  z.object({ ...common, kind: z.literal('region'), loops: z.array(z.array(point).min(3)).min(1) }),
]);
export const VectorSceneSchema = z.object({
  schemaVersion: z.literal(1), pins, viewId: id,
  projection: z.enum(['orthographic', 'axonometric']),
  evidence: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('fixture'), description: id }),
    z.object({ kind: z.literal('native-wireframe-preview'), kernelId: z.literal('occt-native'), kernelVersion: id, projectionDigest: z.string().regex(/^[0-9a-f]{64}$/), visibility: z.literal('unclassified'), provenance: z.literal('bounds-matched-provisional') }),
    z.object({ kind: z.literal('approximate'), maxDeviationMm: finite.nonnegative() }),
    z.object({ kind: z.literal('kernel-projection'), kernelId: id, kernelVersion: id, toleranceMm: finite.positive() }),
  ]),
  frame: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive(), scaleDenominator: finite.positive() }),
  primitives: z.array(VectorPrimitiveSchema),
}).superRefine((scene, ctx) => {
  if (scene.evidence.kind === 'native-wireframe-preview' && scene.primitives.some(p => p.role !== 'unclassified' || p.kind !== 'line')) {
    ctx.addIssue({ code: 'custom', path: ['primitives'], message: 'Native wireframe preview cannot assert classified visibility or filled regions' });
  }
  const seen = new Set<string>();
  scene.primitives.forEach((p, index) => {
    if (seen.has(p.id)) ctx.addIssue({ code: 'custom', path: ['primitives', index, 'id'], message: 'Duplicate vector identity' });
    seen.add(p.id);
  });
});
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const pen = z.object({ stroke: color, paperWidthMm: finite.nonnegative() });
/** Dash dimensions are physical paper millimetres, independent of model scale.
 * null denotes continuous linework; an array alternates ink and gap lengths.
 * Empty selector arrays deliberately select no hidden geometry.
 */
export const HiddenLineStyleSchema = z.object({
  patternPaperMm: z.array(finite.positive().max(1000)).min(2).max(16)
    .refine(pattern => pattern.length % 2 === 0, 'Dash pattern must contain ink/gap pairs').nullable().default([1.5, 0.75]),
  offsetPaperMm: finite.min(-1000).max(1000).default(0),
  opacity: finite.min(0).max(1).default(1),
  cap: z.enum(['butt', 'round', 'square']).default('round'),
  ownerIds: z.array(id).optional(),
  topologyPaths: z.array(id).optional(),
});
export type HiddenLineStyle = z.infer<typeof HiddenLineStyleSchema>;
export const VectorStyleSchema = z.object({
  pens: z.object({ silhouette: pen, cut: pen, component: pen, detail: pen, hidden: pen, unclassified: pen.default({ stroke: '#68727c', paperWidthMm: 0.18 }) }),
  regionFill: color, hiddenVisible: z.boolean(),
  hiddenLine: HiddenLineStyleSchema.default({ patternPaperMm: [1.5, 0.75], offsetPaperMm: 0, opacity: 1, cap: 'round' }),
});
export type VectorScene = z.infer<typeof VectorSceneSchema>;
export type VectorStyle = z.infer<typeof VectorStyleSchema>;
export type VectorPrimitive = z.infer<typeof VectorPrimitiveSchema>;
export const DEFAULT_VECTOR_STYLE: VectorStyle = {
  pens: {
    silhouette: { stroke: '#222222', paperWidthMm: 0.7 },
    cut: { stroke: '#222222', paperWidthMm: 0.5 },
    component: { stroke: '#333333', paperWidthMm: 0.25 },
    detail: { stroke: '#555555', paperWidthMm: 0.13 },
    hidden: { stroke: '#777777', paperWidthMm: 0.13 },
    unclassified: { stroke: '#68727c', paperWidthMm: 0.18 },
  }, regionFill: '#ffffff', hiddenVisible: false,
  hiddenLine: { patternPaperMm: [1.5, 0.75], offsetPaperMm: 0, opacity: 1, cap: 'round' },
};
export function parseVectorScene(input: unknown): VectorScene {
  return VectorSceneSchema.parse(input);
}
export function vectorSceneIsCurrent(scene: VectorScene, expected: VectorScene['pins']): boolean {
  return scene.evidence.kind !== 'native-wireframe-preview' && scene.pins.buildingRevision === expected.buildingRevision &&
    scene.pins.documentIntentRevision === expected.documentIntentRevision &&
    scene.pins.viewDefinitionVersion === expected.viewDefinitionVersion &&
    scene.pins.representationGrammarVersion === expected.representationGrammarVersion &&
    scene.pins.producerVersion === expected.producerVersion;
}
function escapeXml(value: string): string {
  // XML 1.0 allowed characters, including supplementary Unicode code points.
  const valid = Array.from(value, char => {
    const cp = char.codePointAt(0)!;
    return cp === 9 || cp === 10 || cp === 13 ||
      (cp >= 0x20 && cp <= 0xD7FF) || (cp >= 0xE000 && cp <= 0xFFFD) ||
      (cp >= 0x10000 && cp <= 0x10FFFF) ? char : '\uFFFD';
  }).join('');
  return valid.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function pair(p: readonly [number, number]): string {
  return p[0] + ' ' + p[1];
}
function pathData(p: VectorPrimitive): string {
  if (p.kind === 'line') return 'M ' + pair(p.start) + ' L ' + pair(p.end);
  if (p.kind === 'polyline') return 'M ' + p.points.map(pair).join(' L ');
  return p.loops.map(loop => 'M ' + loop.map(pair).join(' L ') + ' Z').join(' ');
}
/** Pure derived rendering. The producer supplies visibility and back-to-front paint order. */
export function renderVectorSvg(input: VectorScene, appearance: z.input<typeof VectorStyleSchema> = DEFAULT_VECTOR_STYLE): string {
  const scene = parseVectorScene(input);
  const style = VectorStyleSchema.parse(appearance);
  const f = scene.frame;
  const hidden = style.hiddenLine;
  const selectedOwners = hidden.ownerIds === undefined ? undefined : new Set(hidden.ownerIds);
  const selectedPaths = hidden.topologyPaths === undefined ? undefined : new Set(hidden.topologyPaths);
  const scaled = (n: number) => {
    const result = n * f.scaleDenominator;
    if (!Number.isFinite(result) || (n !== 0 && result === 0)) throw new Error('Invalid scaled hidden-line dimension');
    return result;
  };
  const paths = scene.primitives.filter(p => p.role !== 'hidden' || (
    style.hiddenVisible &&
    (selectedOwners === undefined || selectedOwners.has(p.source.semanticOwner)) &&
    (selectedPaths === undefined || (p.source.topologyPath !== undefined && selectedPaths.has(p.source.topologyPath)))
  )).map(p => {
    const pen = style.pens[p.role];
    const width = pen.paperWidthMm * f.scaleDenominator;
    if (!Number.isFinite(width)) throw new Error('Invalid scaled pen width');
    const isHidden = p.role === 'hidden';
    const dash = isHidden && hidden.patternPaperMm !== null
      ? ' stroke-dasharray="' + hidden.patternPaperMm.map(scaled).join(' ') + '" stroke-dashoffset="' + scaled(hidden.offsetPaperMm) + '"' : '';
    const opacity = isHidden ? ' stroke-opacity="' + hidden.opacity + '"' : '';
    const cap = isHidden ? hidden.cap : 'round';
    return '<path data-vector-id="' + escapeXml(p.id) + '" data-owner="' + escapeXml(p.source.semanticOwner) +
      '" data-representation="' + escapeXml(p.source.representationId) + '"' +
      (p.source.topologyPath ? ' data-topology-path="' + escapeXml(p.source.topologyPath) + '"' : '') +
      ' data-role="' + p.role + '" d="' + pathData(p) + '" fill="' + (p.kind === 'region' && !isHidden ? style.regionFill : 'none') +
      '" fill-rule="evenodd" stroke="' + pen.stroke + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="' + cap + '"' + dash + opacity + '/>';
  });
  const w = f.width / f.scaleDenominator, h = f.height / f.scaleDenominator;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error('Invalid physical page dimensions');
  const meta = JSON.stringify({ viewId: scene.viewId, pins: scene.pins, evidence: scene.evidence });
  const preview = scene.evidence.kind === 'native-wireframe-preview';
  const warning = preview ? '<title>Native wireframe preview — visibility unclassified; not for issue</title><text x="' + (f.x + 2 * f.scaleDenominator) + '" y="' + (f.y + 4 * f.scaleDenominator) + '" font-size="' + 2.5 * f.scaleDenominator + '" fill="#555555">WIREFRAME PREVIEW — NOT FOR ISSUE</text>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + 'mm" height="' + h +
    'mm" viewBox="' + [f.x, f.y, f.width, f.height].join(' ') + '"' + (preview ? ' data-publication="blocked"' : '') + '><metadata>' + escapeXml(meta) + '</metadata>' + paths.join('') + warning + '</svg>';
}
