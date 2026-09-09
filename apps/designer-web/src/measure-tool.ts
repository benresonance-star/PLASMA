import type {
  MeasureCompareResult,
  MeasureKind,
  MeasureResult,
  Vec3,
} from '@spds/geometry-contracts/measure';

export type MeasureSnapKind = 'vertex' | 'edge' | 'face';
export type MeasureToolMode = 'idle' | MeasureKind;

export interface MeasurePick {
  readonly featurePath: string;
  readonly semanticOwner: string;
  readonly engineLayer: 'reference' | 'geometry-service';
  readonly kernel: string;
  readonly worldPoint: Vec3;
  readonly snap: MeasureSnapKind;
  /** Edge direction or face normal when relevant. */
  readonly direction?: Vec3;
  /** Edge segment endpoints for overlay (edgeLength / angle arms). */
  readonly segment?: readonly [Vec3, Vec3];
  /** Owner mesh AABB at pick time (face highlight). */
  readonly extents?: {
    readonly min: Vec3;
    readonly max: Vec3;
  };
}

export interface MeasureToolState {
  readonly mode: MeasureToolMode;
  readonly snap: MeasureSnapKind;
  readonly pending: MeasurePick | null;
  readonly active: MeasureResult | null;
  readonly compare: MeasureCompareResult | null;
  readonly picks: readonly MeasurePick[];
  readonly status: string;
}

export function createMeasureToolState(
  partial?: Partial<MeasureToolState>,
): MeasureToolState {
  return {
    mode: 'idle',
    snap: 'vertex',
    pending: null,
    active: null,
    compare: null,
    picks: [],
    status: 'Measure idle',
    ...partial,
  };
}

export function setMeasureMode(state: MeasureToolState, mode: MeasureToolMode): MeasureToolState {
  const snap =
    mode === 'edgeLength'
      ? 'edge'
      : mode === 'faceArea'
        ? 'face'
        : mode === 'angle'
          ? state.snap === 'vertex'
            ? 'edge'
            : state.snap
          : mode === 'distance'
            ? 'vertex'
            : state.snap;
  return createMeasureToolState({
    mode,
    snap,
    status:
      mode === 'idle'
        ? 'Measure idle'
        : mode === 'angle'
          ? `Angle: pick two ${snap}s`
          : mode === 'distance'
            ? 'Distance: pick two vertices'
            : mode === 'edgeLength'
              ? 'Edge: pick one edge'
              : 'Area: pick one face',
  });
}

export function setMeasureSnap(state: MeasureToolState, snap: MeasureSnapKind): MeasureToolState {
  if (state.mode === 'angle' && snap === 'vertex') {
    return { ...state, status: 'Angle requires edge or face snap' };
  }
  if (state.mode === 'distance' && snap !== 'vertex') {
    return { ...state, snap: 'vertex', status: 'Distance uses vertex snap' };
  }
  if (state.mode === 'edgeLength') {
    return { ...state, snap: 'edge', status: 'Edge: pick one edge' };
  }
  if (state.mode === 'faceArea') {
    return { ...state, snap: 'face', status: 'Area: pick one face' };
  }
  return {
    ...state,
    snap,
    pending: null,
    picks: [],
    status:
      state.mode === 'angle' ? `Angle: pick two ${snap}s` : state.status,
  };
}

export function clearMeasure(state: MeasureToolState): MeasureToolState {
  return createMeasureToolState({
    mode: state.mode,
    snap: state.snap,
    status:
      state.mode === 'idle'
        ? 'Measure idle'
        : state.mode === 'angle'
          ? `Angle: pick two ${state.snap}s`
          : 'Measure cleared',
  });
}

export type MeasureCommit =
  | { readonly type: 'pending'; readonly state: MeasureToolState }
  | { readonly type: 'complete'; readonly state: MeasureToolState; readonly features: readonly string[] }
  | { readonly type: 'reject'; readonly state: MeasureToolState; readonly reason: string };

/**
 * Apply a snapped pick. Distance/angle need two compatible picks; edge/face complete on one.
 */
export function commitMeasurePick(state: MeasureToolState, pick: MeasurePick): MeasureCommit {
  if (state.mode === 'idle') {
    return { type: 'reject', state, reason: 'Measure tool idle' };
  }
  if (state.mode === 'angle' && pick.snap !== 'edge' && pick.snap !== 'face') {
    return {
      type: 'reject',
      state: { ...state, status: 'Angle requires edge or face pick' },
      reason: 'Angle requires edge or face pick',
    };
  }
  if (state.mode === 'angle' && state.snap !== pick.snap) {
    return {
      type: 'reject',
      state: { ...state, status: `Angle snap is ${state.snap}; got ${pick.snap}` },
      reason: 'Angle pair kind mismatch',
    };
  }
  if (state.mode === 'distance' && pick.snap !== 'vertex') {
    return {
      type: 'reject',
      state: { ...state, status: 'Distance requires vertex pick' },
      reason: 'Distance requires vertex',
    };
  }
  if (state.mode === 'edgeLength') {
    if (pick.snap !== 'edge') {
      return {
        type: 'reject',
        state: { ...state, status: 'Edge length requires edge pick' },
        reason: 'edgeLength requires edge',
      };
    }
    return {
      type: 'complete',
      state: {
        ...state,
        pending: null,
        picks: [pick],
        status: `Edge length · ${pick.kernel}`,
      },
      features: [pick.featurePath],
    };
  }
  if (state.mode === 'faceArea') {
    if (pick.snap !== 'face') {
      return {
        type: 'reject',
        state: { ...state, status: 'Face area requires face pick' },
        reason: 'faceArea requires face',
      };
    }
    return {
      type: 'complete',
      state: {
        ...state,
        pending: null,
        picks: [pick],
        status: `Face area · ${pick.kernel}`,
      },
      features: [pick.featurePath],
    };
  }

  // distance or angle — two picks
  if (!state.pending) {
    return {
      type: 'pending',
      state: {
        ...state,
        pending: pick,
        picks: [pick],
        // Drop prior readout so the old value does not jump onto the new first node.
        active: null,
        compare: null,
        status:
          state.mode === 'angle'
            ? `Angle: pick second ${state.snap}`
            : 'Distance: pick second vertex',
      },
    };
  }

  if (state.mode === 'angle' && state.pending.snap !== pick.snap) {
    return {
      type: 'reject',
      state: {
        ...state,
        status: 'Angle needs two edges or two faces (not mixed)',
      },
      reason: 'mixed angle features',
    };
  }

  return {
    type: 'complete',
    state: {
      ...state,
      pending: null,
      picks: [state.pending, pick],
      status:
        state.mode === 'angle'
          ? `Angle · ${pick.kernel}`
          : `Distance · ${pick.kernel}`,
    },
    features: [state.pending.featurePath, pick.featurePath],
  };
}

export function formatMeasureQuantity(result: MeasureResult): string {
  const q =
    result.unit === 'deg'
      ? result.quantity.toFixed(2)
      : result.unit === 'mm2'
        ? result.quantity.toFixed(1)
        : result.quantity.toFixed(2);
  const unit = result.unit === 'mm2' ? 'mm²' : result.unit;
  return `${q} ${unit}`;
}

export function formatCompareRow(compare: MeasureCompareResult): string {
  const exact = compare.exact ? formatMeasureQuantity(compare.exact) : '—';
  const occt = compare.occt ? formatMeasureQuantity(compare.occt) : '—';
  const delta =
    compare.delta !== undefined
      ? `Δ ${compare.delta.toFixed(compare.toleranceUnit === 'deg' ? 2 : 2)} ${compare.toleranceUnit === 'mm2' ? 'mm²' : compare.toleranceUnit}`
      : 'Δ —';
  return `Exact ${exact} · OCCT ${occt} · ${delta}${compare.withinTolerance ? ' ✓' : ''}`;
}
