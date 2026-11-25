import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGeometryKernel, buildGeometryServer } from '../services/geometry-occt/dist/index.js';
import { nativeWireframePreview, renderVectorSvg, vectorSceneIsCurrent, DEFAULT_VECTOR_STYLE, parseVectorScene } from '../packages/representation-core/dist/index.js';

const kernel = createGeometryKernel('occt-native');
await kernel.ensureReady();
const rep = kernel.extrude({ semanticOwner: 'vector:ci:prism', pirOperationId: 'pir:vector:ci:prism',
  profile: [[0,0,0],[120,0,0],[120,80,0],[0,80,0]], vector: [0,0,45] });
const { app } = buildGeometryServer(kernel);
try {
  const response = await app.inject({ method: 'POST', url: '/v1/projection/mapped-lines', payload: {
    representationId: rep.id, origin: [0,0,0],
    right: [Math.SQRT1_2,-Math.SQRT1_2,0], down: [1/Math.sqrt(6),1/Math.sqrt(6),-2/Math.sqrt(6)],
  } });
  assert.equal(response.statusCode, 200, response.body);
  const payload = response.json();
  assert.equal(payload.edges.length, 12);
  assert.equal(payload.edges.filter(e => e.collapsed).length, 0);
  const scene = nativeWireframePreview(payload, { expectedRepresentationId: rep.id, expectedProjectionDigest: payload.projectionDigest, viewId: 'ci-iso', scaleDenominator: 1 });
  const svg = renderVectorSvg(scene);
  assert.equal(scene.primitives.length, 12);
  assert.equal(vectorSceneIsCurrent(scene, scene.pins), false);
  assert.match(svg, /data-publication="blocked"/);
  assert.equal((svg.match(/data-vector-id=/g) ?? []).length, 12);
  await mkdir('vector-evidence', { recursive: true });
  await writeFile('vector-evidence/native-prism-wireframe.svg', svg);
  await writeFile('vector-evidence/native-projection.json', JSON.stringify(payload, null, 2));
  await writeFile('vector-evidence/vector-scene.json', JSON.stringify(scene, null, 2));
  // The HLR feature is not yet implemented. This isolated style fixture is intentionally
  // synthetic, and must never be confused with the native unclassified artifact.
  const fixture = parseVectorScene({
    ...scene, evidence: { kind: 'fixture', description: 'Synthetic hidden-line style test — not native visibility evidence' },
    viewId: 'synthetic-hidden-style',
    primitives: scene.primitives.map((p, i) => ({ ...p, role: i % 3 === 0 ? 'hidden' : 'component' })),
  });
  const dashed = renderVectorSvg(fixture, { ...DEFAULT_VECTOR_STYLE, hiddenVisible: true,
    hiddenLine: { patternPaperMm: [3, 1.5], opacity: 0.55, cap: 'butt' } });
  assert.match(dashed, /stroke-dasharray="3 1.5"/);
  assert.match(dashed, /stroke-opacity="0.55"/);
  await writeFile('vector-evidence/SYNTHETIC-hidden-line-style.svg', dashed);
  const oc = await (await import('../services/geometry-occt/dist/occt-js.js')).loadOcjs();
  const hlrBindings = Object.getOwnPropertyNames(oc).filter(name => /^(HLR|BRepAdaptor_Curve)/.test(name)).sort();
  await writeFile('vector-evidence/hlr-binding-inventory.json', JSON.stringify({ kernel: 'occt-native', note: 'Names only; availability is not proof of usable HLR methods', exports: hlrBindings }, null, 2));
  console.log('HLR binding inventory:', hlrBindings.join(', '));
  console.log('Native B-rep → HTTP → vector scene → SVG: PASS (diagnostic wireframe only)');
} finally { await app.close(); }
