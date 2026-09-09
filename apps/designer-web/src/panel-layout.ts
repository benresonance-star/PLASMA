/** Desktop shell column widths (explorer / inspector / causal lens). */

export interface PanelWidthPrefs {
  readonly explorerPx: number;
  readonly inspectorPx: number;
  readonly causalPx: number;
}

export type PanelWidthKey = keyof PanelWidthPrefs;

export const DEFAULT_PANEL_WIDTHS: PanelWidthPrefs = {
  explorerPx: 272,
  inspectorPx: 288,
  causalPx: 352,
};

export const PANEL_WIDTH_LIMITS: Record<
  PanelWidthKey,
  { readonly min: number; readonly max: number }
> = {
  explorerPx: { min: 180, max: 480 },
  inspectorPx: { min: 200, max: 560 },
  causalPx: { min: 240, max: 720 },
};

export function clampPanelWidth(px: number, min: number, max: number): number {
  if (!Number.isFinite(px)) return min;
  return Math.min(max, Math.max(min, Math.round(px)));
}

export function normalizePanelWidths(
  partial?: Partial<PanelWidthPrefs> | null,
): PanelWidthPrefs {
  return {
    explorerPx: clampPanelWidth(
      partial?.explorerPx ?? DEFAULT_PANEL_WIDTHS.explorerPx,
      PANEL_WIDTH_LIMITS.explorerPx.min,
      PANEL_WIDTH_LIMITS.explorerPx.max,
    ),
    inspectorPx: clampPanelWidth(
      partial?.inspectorPx ?? DEFAULT_PANEL_WIDTHS.inspectorPx,
      PANEL_WIDTH_LIMITS.inspectorPx.min,
      PANEL_WIDTH_LIMITS.inspectorPx.max,
    ),
    causalPx: clampPanelWidth(
      partial?.causalPx ?? DEFAULT_PANEL_WIDTHS.causalPx,
      PANEL_WIDTH_LIMITS.causalPx.min,
      PANEL_WIDTH_LIMITS.causalPx.max,
    ),
  };
}

export function panelWidthsDifferFromDefault(widths: PanelWidthPrefs): boolean {
  return (
    widths.explorerPx !== DEFAULT_PANEL_WIDTHS.explorerPx ||
    widths.inspectorPx !== DEFAULT_PANEL_WIDTHS.inspectorPx ||
    widths.causalPx !== DEFAULT_PANEL_WIDTHS.causalPx
  );
}
