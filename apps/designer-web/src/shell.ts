/** G8.1 Application shell — project/model/branch context and panel layout. */

export type PanelId =
  | 'explorer'
  | 'inspector'
  | 'viewport'
  | 'pipeline'
  | 'validation'
  | 'history'
  | 'ai';

export type LayoutMode = 'desktop' | 'mobile-tabs';

export interface ShellContext {
  readonly projectId: string;
  readonly modelId: string;
  readonly branchId: string;
  readonly branchName: string;
}

export interface ShellState {
  readonly context: ShellContext;
  readonly layoutMode: LayoutMode;
  readonly activePanel: PanelId;
  readonly collapsedPanels: readonly PanelId[];
  readonly openPanels: readonly PanelId[];
}

const DEFAULT_OPEN: readonly PanelId[] = ['explorer', 'viewport', 'inspector'];

export function createShellState(input: {
  readonly projectId: string;
  readonly modelId: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly viewportWidthPx?: number;
}): ShellState {
  const width = input.viewportWidthPx ?? 1280;
  const layoutMode: LayoutMode = width < 768 ? 'mobile-tabs' : 'desktop';
  return {
    context: {
      projectId: input.projectId,
      modelId: input.modelId,
      branchId: input.branchId,
      branchName: input.branchName,
    },
    layoutMode,
    activePanel: 'viewport',
    collapsedPanels: layoutMode === 'mobile-tabs' ? ['pipeline', 'validation', 'history', 'ai'] : [],
    openPanels: layoutMode === 'mobile-tabs' ? ['viewport'] : DEFAULT_OPEN,
  };
}

export function switchBranch(state: ShellState, branchId: string, branchName: string): ShellState {
  return {
    ...state,
    context: { ...state.context, branchId, branchName },
  };
}

export function switchModel(state: ShellState, modelId: string, branchId: string, branchName: string): ShellState {
  return {
    ...state,
    context: { ...state.context, modelId, branchId, branchName },
  };
}

export function setActivePanel(state: ShellState, panel: PanelId): ShellState {
  if (state.layoutMode === 'mobile-tabs') {
    return { ...state, activePanel: panel, openPanels: [panel] };
  }
  const open = state.openPanels.includes(panel) ? state.openPanels : [...state.openPanels, panel];
  return { ...state, activePanel: panel, openPanels: open };
}

export function resizeShell(state: ShellState, viewportWidthPx: number): ShellState {
  const layoutMode: LayoutMode = viewportWidthPx < 768 ? 'mobile-tabs' : 'desktop';
  if (layoutMode === state.layoutMode) return state;
  if (layoutMode === 'mobile-tabs') {
    return {
      ...state,
      layoutMode,
      openPanels: [state.activePanel],
      collapsedPanels: DEFAULT_OPEN.filter((p) => p !== state.activePanel),
    };
  }
  return {
    ...state,
    layoutMode,
    openPanels: DEFAULT_OPEN,
    collapsedPanels: [],
  };
}
