import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGeometryKernel, buildGeometryServer } from '../services/geometry-occt/dist/index.js';
import { nativeWireframePreview, renderVectorSvg, vectorSceneIsCurrent } from '../packages/representation-core/dist/index.js';

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
  console.log('Native B-rep → HTTP → vector scene → SVG: PASS (diagnostic wireframe only)');
} finally { await app.close(); }
