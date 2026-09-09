/** Hybrid (C) — map header PanelId to the focused right-pane kind. */

import type { PanelId } from './shell.js';

export type RightPaneKind =
  | 'inspector'
  | 'pipeline'
  | 'validation'
  | 'history'
  | 'ai'
  | 'analysis-mesh'
  | 'schema';

/** Right-pane views shown in the header dropdown (not explorer/viewport). */
export const RIGHT_PANE_KINDS: readonly RightPaneKind[] = [
  'inspector',
  'pipeline',
  'validation',
  'history',
  'ai',
  'analysis-mesh',
  'schema',
] as const;

const RIGHT_PANE_LABELS: Record<RightPaneKind, string> = {
  inspector: 'Inspector',
  pipeline: 'Pipeline',
  validation: 'Validation',
  history: 'History',
  ai: 'AI',
  'analysis-mesh': 'Analysis mesh',
  schema: 'Schema',
};

export function rightPaneLabel(kind: RightPaneKind): string {
  return RIGHT_PANE_LABELS[kind];
}

/** Explorer / viewport / inspector tabs reset the right pane to Inspector. */
export function rightPaneForPanel(panel: PanelId): RightPaneKind {
  switch (panel) {
    case 'explorer':
    case 'viewport':
    case 'inspector':
      return 'inspector';
    case 'pipeline':
      return 'pipeline';
    case 'validation':
      return 'validation';
    case 'history':
      return 'history';
    case 'ai':
      return 'ai';
    case 'analysis-mesh':
      return 'analysis-mesh';
    case 'schema':
      return 'schema';
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

/** Viewport stays mounted for every panel (hybrid C). */
export function shouldMountViewport(_panel: PanelId): boolean {
  void _panel;
  return true;
}
