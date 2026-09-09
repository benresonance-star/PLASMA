import type { MeasureCompareResult, MeasureKind, MeasureResult } from '@spds/geometry-contracts/measure';
import type { MeasurePick, MeasureSnapKind } from './measure-tool.js';
import { formatMeasureQuantity } from './measure-tool.js';

export const MEASURE_LIBRARY_KEY = 'spds-measure-library';

export interface SavedMeasurement {
  readonly id: string;
  readonly name: string;
  readonly kind: MeasureKind;
  readonly snap: MeasureSnapKind;
  readonly result: MeasureResult;
  readonly compare: MeasureCompareResult | null;
  readonly picks: readonly MeasurePick[];
  readonly createdAtMs: number;
}

export interface MeasureLibraryState {
  readonly items: readonly SavedMeasurement[];
  readonly selectedId: string | null;
  /** When false, saved measurements are hidden in the viewport. */
  readonly overlaysVisible: boolean;
  readonly listCollapsed: boolean;
}

export function createMeasureLibraryState(
  partial?: Partial<MeasureLibraryState>,
): MeasureLibraryState {
  return {
    items: [],
    selectedId: null,
    overlaysVisible: true,
    listCollapsed: false,
    ...partial,
  };
}

export function defaultMeasurementName(
  kind: MeasureKind,
  result: MeasureResult,
  index: number,
): string {
  const kindLabel =
    kind === 'distance'
      ? 'Distance'
      : kind === 'edgeLength'
        ? 'Edge'
        : kind === 'faceArea'
          ? 'Area'
          : 'Angle';
  return `${kindLabel} ${index} · ${formatMeasureQuantity(result)}`;
}

export function addMeasurement(
  state: MeasureLibraryState,
  input: {
    readonly kind: MeasureKind;
    readonly snap: MeasureSnapKind;
    readonly result: MeasureResult;
    readonly compare: MeasureCompareResult | null;
    readonly picks: readonly MeasurePick[];
    readonly id?: string;
    readonly name?: string;
    readonly createdAtMs?: number;
  },
): MeasureLibraryState {
  const id = input.id ?? `meas:${input.createdAtMs ?? Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const item: SavedMeasurement = {
    id,
    name:
      input.name ??
      defaultMeasurementName(input.kind, input.result, state.items.length + 1),
    kind: input.kind,
    snap: input.snap,
    result: input.result,
    compare: input.compare,
    picks: input.picks,
    createdAtMs: input.createdAtMs ?? Date.now(),
  };
  return {
    ...state,
    items: [...state.items, item],
    selectedId: id,
    listCollapsed: false,
  };
}

export function renameMeasurement(
  state: MeasureLibraryState,
  id: string,
  name: string,
): MeasureLibraryState {
  return {
    ...state,
    items: state.items.map((item) => (item.id === id ? { ...item, name } : item)),
  };
}

export function deleteMeasurement(
  state: MeasureLibraryState,
  id: string,
): MeasureLibraryState {
  const items = state.items.filter((item) => item.id !== id);
  return {
    ...state,
    items,
    selectedId: state.selectedId === id ? (items[items.length - 1]?.id ?? null) : state.selectedId,
  };
}

export function updateMeasurementResult(
  state: MeasureLibraryState,
  id: string,
  patch: {
    readonly result?: MeasureResult;
    readonly compare?: MeasureCompareResult | null;
  },
): MeasureLibraryState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        result: patch.result ?? item.result,
        compare: patch.compare !== undefined ? patch.compare : item.compare,
      };
    }),
  };
}

export function selectMeasurement(
  state: MeasureLibraryState,
  id: string | null,
): MeasureLibraryState {
  if (id !== null && !state.items.some((item) => item.id === id)) return state;
  return { ...state, selectedId: id };
}

export function setOverlaysVisible(
  state: MeasureLibraryState,
  overlaysVisible: boolean,
): MeasureLibraryState {
  return { ...state, overlaysVisible };
}

export function setListCollapsed(
  state: MeasureLibraryState,
  listCollapsed: boolean,
): MeasureLibraryState {
  return { ...state, listCollapsed };
}

export function clearMeasurements(state: MeasureLibraryState): MeasureLibraryState {
  return { ...state, items: [], selectedId: null };
}

export function serializeMeasureLibrary(state: MeasureLibraryState): string {
  return JSON.stringify({
    items: state.items,
    selectedId: state.selectedId,
    overlaysVisible: state.overlaysVisible,
    listCollapsed: state.listCollapsed,
  });
}

export function parseMeasureLibrary(raw: string): MeasureLibraryState | null {
  try {
    const data = JSON.parse(raw) as Partial<MeasureLibraryState>;
    if (!Array.isArray(data.items)) return null;
    return createMeasureLibraryState({
      items: data.items as SavedMeasurement[],
      selectedId: typeof data.selectedId === 'string' ? data.selectedId : null,
      overlaysVisible: data.overlaysVisible !== false,
      listCollapsed: Boolean(data.listCollapsed),
    });
  } catch {
    return null;
  }
}

export function loadMeasureLibrary(): MeasureLibraryState {
  if (typeof window === 'undefined') return createMeasureLibraryState();
  const raw = window.localStorage.getItem(MEASURE_LIBRARY_KEY);
  if (!raw) return createMeasureLibraryState();
  return parseMeasureLibrary(raw) ?? createMeasureLibraryState();
}

export function persistMeasureLibrary(state: MeasureLibraryState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MEASURE_LIBRARY_KEY, serializeMeasureLibrary(state));
}
