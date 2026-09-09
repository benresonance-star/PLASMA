import { describe, expect, it } from 'vitest';
import {
  addMeasurement,
  createMeasureLibraryState,
  deleteMeasurement,
  parseMeasureLibrary,
  renameMeasurement,
  selectMeasurement,
  serializeMeasureLibrary,
  setOverlaysVisible,
  updateMeasurementResult,
} from './measure-library.js';
import type { MeasurePick } from './measure-tool.js';

const pick: MeasurePick = {
  featurePath: 'semantic:component:y:1/box/vertex:0',
  semanticOwner: 'component:y:1',
  engineLayer: 'reference',
  kernel: 'exact-adapter',
  worldPoint: [0, 0, 0],
  snap: 'vertex',
};

const result = {
  kind: 'distance' as const,
  quantity: 100,
  unit: 'mm' as const,
  provenance: 'brep' as const,
  engine: { layer: 'reference' as const, kernel: 'exact-adapter', label: 'Exact' },
  features: [pick.featurePath],
};

describe('measure library', () => {
  it('supports add, rename, select, delete and persistence round-trip', () => {
    let lib = createMeasureLibraryState();
    lib = addMeasurement(lib, {
      id: 'meas:1',
      kind: 'distance',
      snap: 'vertex',
      result,
      compare: null,
      picks: [pick, { ...pick, featurePath: 'semantic:component:y:1/box/vertex:1' }],
      createdAtMs: 1,
    });
    expect(lib.items).toHaveLength(1);
    expect(lib.selectedId).toBe('meas:1');

    lib = renameMeasurement(lib, 'meas:1', 'Span A');
    expect(lib.items[0]?.name).toBe('Span A');

    lib = updateMeasurementResult(lib, 'meas:1', {
      result: { ...result, quantity: 120 },
    });
    expect(lib.items[0]?.result.quantity).toBe(120);

    lib = setOverlaysVisible(lib, false);
    expect(lib.overlaysVisible).toBe(false);

    const roundTrip = parseMeasureLibrary(serializeMeasureLibrary(lib));
    expect(roundTrip?.items[0]?.name).toBe('Span A');
    expect(roundTrip?.overlaysVisible).toBe(false);

    lib = selectMeasurement(lib, null);
    expect(lib.selectedId).toBeNull();
    lib = deleteMeasurement(lib, 'meas:1');
    expect(lib.items).toHaveLength(0);
  });
});
