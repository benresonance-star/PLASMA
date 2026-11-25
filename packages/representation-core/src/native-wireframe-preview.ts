import { z } from 'zod';
import { parseVectorScene, type VectorScene } from './vector-scene.js';

const id = z.string().min(1);
const finite = z.number().finite();
const point = z.tuple([finite, finite]);
const vec3 = z.tuple([finite, finite, finite]);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const responseSchema = z.object({
  representationId: id, semanticOwner: id, kernel: z.literal('occt-native'), kernelVersion: id,
  visibility: z.literal('unclassified'), provenance: z.literal('bounds-matched-provisional'),
  scope: z.literal('mapped-straight-edges'), projectionDigest: digest,
  frame: z.object({ representationId: id, origin: vec3, right: vec3, down: vec3 }),
  edges: z.array(z.object({ topologyPath: id, start: point, end: point, collapsed: z.boolean() })).min(1),
});
const optionsSchema = z.object({
  expectedRepresentationId: id, expectedProjectionDigest: digest,
  viewId: id, scaleDenominator: finite.positive(),
});

/** Diagnostic preview only. Expected digest correlates an already obtained response;
 * it does not authenticate a remote producer or establish authoritative revision pins.
 */
export function nativeWireframePreview(input: unknown, options: unknown): VectorScene {
  const response = responseSchema.parse(input), request = optionsSchema.parse(options);
  if (response.representationId !== request.expectedRepresentationId ||
      response.frame.representationId !== response.representationId ||
      response.projectionDigest !== request.expectedProjectionDigest) throw new Error('Projection identity mismatch');
  const { right, down } = response.frame;
  if (Math.abs(Math.hypot(...right) - 1) > 1e-9 || Math.abs(Math.hypot(...down) - 1) > 1e-9 ||
      Math.abs(right[0]*down[0] + right[1]*down[1] + right[2]*down[2]) > 1e-9) throw new Error('Invalid projection frame');
  const seen = new Set<string>();
  for (const edge of response.edges) {
    if (seen.has(edge.topologyPath)) throw new Error('Duplicate topology path');
    seen.add(edge.topologyPath);
    if (edge.collapsed !== (Math.hypot(edge.end[0] - edge.start[0], edge.end[1] - edge.start[1]) <= 1e-9)) throw new Error('Invalid collapsed flag');
  }
  const edges = response.edges.filter(e => !e.collapsed);
  if (!edges.length) throw new Error('No projectable edges');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of edges) for (const p of [e.start, e.end]) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const s = request.scaleDenominator, margin = 8*s;
  return parseVectorScene({
    schemaVersion: 1, viewId: request.viewId, projection: 'orthographic',
    pins: { buildingRevision: 'unbound-preview', documentIntentRevision: 'unbound-preview',
      viewDefinitionVersion: 'preview', representationGrammarVersion: 'preview-v1', producerVersion: response.kernelVersion },
    evidence: { kind: 'native-wireframe-preview', kernelId: response.kernel, kernelVersion: response.kernelVersion,
      projectionDigest: response.projectionDigest, visibility: response.visibility, provenance: response.provenance },
    frame: { x: minX - margin, y: minY - margin, width: Math.max(maxX-minX + 2*margin, 80*s),
      height: maxY-minY + 2*margin, scaleDenominator: s },
    primitives: edges.map(e => ({ id: e.topologyPath, kind: 'line', role: 'unclassified',
      source: { semanticOwner: response.semanticOwner, representationId: response.representationId, topologyPath: e.topologyPath },
      start: e.start, end: e.end })),
  });
}
