import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

const at = '2026-11-21T00:00:00.000Z';
const buildProject = {
  schemaVersion: 2, app: 'Assembly', savedAt: at, revision: 1,
  authoritativeGraph: {
    entities: [
      { id: 'entity:build:building', kind: 'Model', semanticType: 'architecture.building',
        name: 'Building', createdAt: at, updatedAt: at, schemaVersion: '1.0.0' },
      { id: 'entity:build:window', kind: 'Entity', semanticType: 'architecture.hosted-opening',
        name: 'Window', createdAt: at, updatedAt: at, schemaVersion: '1.0.0' },
    ],
    parameters: [],
    relationships: [{
      id: 'relationship:build:window', kind: 'Relationship', semanticType: 'architecture.hosted-by',
      name: 'Host', from: 'entity:build:window', to: 'entity:build:building',
      relationType: 'architecture.hosted-by',
      createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
    }],
  },
};
const loftProject = {
  id: 'TestWindow', schemaVersion: 2, units: 'mm',
  parts: [{ id: 'WindowFrame', material: 'Timber', parameters: { W: 1500 }, features: [] }],
  rootAssembly: 'Main', assemblies: [{ id: 'Main', instances: [
    { id: 'W04', partId: 'WindowFrame', placement: { translation: [0, 0, 0] } },
  ] }],
};

describe('FUSION-01 API read-only Build/Loft reconciliation', () => {
  it('previews one bound semantic building component with no publication', async () => {
    const { app } = buildServer();
    const result = await app.inject({
      method: 'POST', url: '/imports/fusion/preview',
      payload: {
        buildProject, loftProject,
        bindings: [{
          buildEntityId: 'entity:build:window', loftAssemblyId: 'Main', loftInstanceId: 'W04',
        }],
      },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      status: 'preview-only', publicationReady: false,
      geometryStatus: 'source-reference-not-compiled',
    });
    expect(result.json().bindings).toHaveLength(1);
    await app.close();
  });

  it('rejects a binding to a missing occurrence, rather than committing a fake merge', async () => {
    const { app } = buildServer();
    const result = await app.inject({
      method: 'POST', url: '/imports/fusion/preview',
      payload: {
        buildProject, loftProject,
        bindings: [{
          buildEntityId: 'entity:build:window', loftAssemblyId: 'Main', loftInstanceId: 'Missing',
        }],
      },
    });
    expect(result.statusCode).toBe(422);
    expect(result.json().failureCode).toBe('FUSION_RECONCILE_REJECTED');
    await app.close();
  });
});
