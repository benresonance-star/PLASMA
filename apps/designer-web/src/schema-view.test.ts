import { describe, expect, it } from 'vitest';
import { PARAM_D01_LENGTH_ID } from '@spds/ai-interface';
import {
  attachSchemaMutateSlice,
  defaultSchemaMutateSlice,
  parseSchemaViewPayload,
  schemaSampleSelectableId,
} from './schema-view.js';

describe('schema-view', () => {
  it('parses static+live payload with sdi + contextMissing', () => {
    const t0 = performance.now();
    const vm = parseSchemaViewPayload({
      modelId: 'model:d01',
      contextMissing: true,
      kinds: Array.from({ length: 32 }, (_, i) => `Kind${i}`),
      relationships: {
        core: ['part-of'],
        sdi: ['CONTAINS'],
        sdiToStorage: [{ sdi: 'CONTAINS', storage: 'part-of' }],
      },
      liveTypes: [
        {
          semanticType: 'structural.y-component',
          count: 3,
          sampleIds: ['component:y:0000'],
        },
      ],
      organisation: { folderCount: 1, folderIds: ['folder:bay'] },
      mutate: {
        acceptOps: ['update', 'apply_pattern'],
        unsupportedOps: ['delete'],
        kindsAllowlist: ['Parameter'],
        parameters: [
          {
            id: 'param:goldberg:frequency',
            path: 'params.frequency',
            domain: { min: 1, max: 8 },
            quantity: { value: 3, unit: '1' },
            role: 'design-variable',
          },
        ],
        examples: [],
        worldNotes: 'WORLD +Z',
      },
    });
    const withMutate = attachSchemaMutateSlice(vm!, defaultSchemaMutateSlice({ lengthMm: 2300 }));
    expect(performance.now() - t0).toBeLessThan(5);
    expect(vm?.kinds).toHaveLength(32);
    expect(vm?.live).toBe(false);
    expect(vm?.contextMissing).toBe(true);
    expect(vm?.sdiToStorage[0]?.storage).toBe('part-of');
    expect(vm?.liveTypes[0]?.semanticType).toBe('structural.y-component');
    expect(vm?.organisation.folderCount).toBe(1);
    expect(vm?.mutate?.parameters[0]?.path).toBe('params.frequency');
    expect(withMutate.mutate?.parameters.some((p) => p.id === PARAM_D01_LENGTH_ID)).toBe(true);
    expect(withMutate.mutate?.parameters.find((p) => p.id === PARAM_D01_LENGTH_ID)?.domain).toEqual(
      {
        min: 500,
        max: 4000,
      },
    );

    const catalog = parseSchemaViewPayload({
      modelId: null,
      live: false,
      kinds: ['Parameter'],
      relationships: { core: [], sdi: [] },
      liveTypes: [],
      organisation: { folderCount: 0, folderIds: [] },
    });
    expect(catalog?.modelId).toBe('catalog');
  });

  it('maps sample ids to selectable owners', () => {
    expect(schemaSampleSelectableId(['param:d01:x', 'component:y:0001'])).toBe('component:y:0001');
    expect(schemaSampleSelectableId([])).toBeNull();
  });
});
