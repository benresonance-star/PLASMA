/** G8.4 Parameter editing — preview drag vs exact/validated commit. */

export type ParamEditMode = 'idle' | 'preview' | 'exact' | 'validated' | 'domain-error';

export interface ParameterSpec {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
}

export interface ParameterEditState {
  readonly spec: ParameterSpec;
  readonly draftValue: number;
  readonly mode: ParamEditMode;
  readonly statusLabel: string;
}

export function createParameterEditState(spec: ParameterSpec): ParameterEditState {
  return {
    spec,
    draftValue: spec.value,
    mode: 'idle',
    statusLabel: 'Idle',
  };
}

function inDomain(spec: ParameterSpec, value: number): boolean {
  return value >= spec.min && value <= spec.max;
}

/** Slider drag → preview (approximate); domain enforced immediately. */
export function beginPreview(state: ParameterEditState, draftValue: number): ParameterEditState {
  if (!inDomain(state.spec, draftValue)) {
    return {
      ...state,
      draftValue,
      mode: 'domain-error',
      statusLabel: `Out of domain [${state.spec.min}, ${state.spec.max}] ${state.spec.unit}`,
    };
  }
  return {
    ...state,
    draftValue,
    mode: 'preview',
    statusLabel: 'Preview (approximate)',
  };
}

/** Release → exact compile job request. */
export function commitExact(state: ParameterEditState): ParameterEditState {
  if (state.mode === 'domain-error' || !inDomain(state.spec, state.draftValue)) {
    return {
      ...state,
      mode: 'domain-error',
      statusLabel: `Cannot commit — out of domain [${state.spec.min}, ${state.spec.max}] ${state.spec.unit}`,
    };
  }
  return {
    ...state,
    mode: 'exact',
    statusLabel: 'Exact compile requested',
    spec: { ...state.spec, value: state.draftValue },
  };
}

export function markValidated(state: ParameterEditState): ParameterEditState {
  if (state.mode !== 'exact') return state;
  return { ...state, mode: 'validated', statusLabel: 'Validated' };
}
