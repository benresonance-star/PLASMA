import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { composeFirstFusion } from '@spds/import-core';

const at = '2026-11-21T00:00:00.000Z';
const buildProject = { app: 'Build', schemaVersion: 2, savedAt: at,
  authoritativeGraph: {
    entities: [{ id: 'entity:build:opening', kind: 'Entity',
      name: 'Opening', semanticType: 'architecture.opening',
      createdAt: at, updatedAt: at, schemaVersion: '1.0.0' }],
    parameters: [{ id: 'parameter:build:width', kind: 'Parameter',
      name: 'Width', semanticType: 'geometry.width',
      createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
      quantity: { value: 1500, unit: 'mm' }, role: 'design-variable',
      affects: ['entity:build:opening'], editableBy: ['user', 'agent'] }],
    relationships: [],
  },
};
const loftProject = { id: 'Loft', schemaVersion: 2, units: 'mm',
  parts: [{ id: 'Frame', parameters: { W: 1500 }, features: [] }],
  rootAssembly: 'Main', assemblies: [{ id: 'Main', instances: [
    { id: 'Frame_01', partId: 'Frame', placement: { translation: [0,0,0] } },
  ] }],
};
const bindings = [{ buildEntityId: 'entity:build:opening',
  loftAssemblyId: 'Main', loftInstanceId: 'Frame_01' }];

describe('FUSION-02 API head-guarded impact preview', () => {
  it('reports a bounded proposal, preserving the branch head', async () => {
    const { app } = buildServer();
    const created = await app.inject({ method: 'POST', url: '/models', payload: { name: 'Hotel' } });
    const { model, branchId, headHash } = created.json() as {
      model: { modelId: string }; branchId: string; headHash: string;
    };
    const f = composeFirstFusion({ buildProject, loftProject, bindings });
    const payload = {
      modelId: model.modelId, branchId, expectedHeadHash: headHash,
      buildProject, loftProject, bindings,
      expectedSourceHashes: {
        build: f.sources[0]!.sourceHash, loft: f.sources[1]!.sourceHash,
      },
      buildParameterId: 'parameter:build:width', nextValue: 1800,
      loftLink: {
        loftAssemblyId: 'Main', loftInstanceId: 'Frame_01',
        loftPartId: 'Frame', loftParameter: 'W',
      },
    };
    const preview = await app.inject({
      method: 'POST', url: '/imports/fusion/changeset-preview', payload,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      status: 'proposed-only', committed: false, geometryCompiled: false,
      basedOnHeadHash: headHash, loftParameter: { before: 1500, after: 1800 },
    });
    const head = await app.inject({
      method: 'GET', url: `/models/${model.modelId}/branches/${branchId}/head`,
    });
    expect(head.json().branch.headHash).toBe(headHash);
    const conflict = await app.inject({
      method: 'POST', url: '/imports/fusion/changeset-preview',
      payload: { ...payload, expectedHeadHash: 'stale' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ failureCode: 'FUSION_HEAD_CONFLICT' });
    await app.close();
  });
});
