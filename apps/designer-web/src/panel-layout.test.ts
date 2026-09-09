import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PANEL_WIDTHS,
  clampPanelWidth,
  normalizePanelWidths,
  panelWidthsDifferFromDefault,
} from './panel-layout.js';

describe('panel-layout', () => {
  it('clamps widths to bounds', () => {
    expect(clampPanelWidth(10, 180, 480)).toBe(180);
    expect(clampPanelWidth(999, 180, 480)).toBe(480);
    expect(clampPanelWidth(250.6, 180, 480)).toBe(251);
    expect(clampPanelWidth(Number.NaN, 180, 480)).toBe(180);
  });

  it('normalizes partial prefs to defaults', () => {
    expect(normalizePanelWidths(null)).toEqual(DEFAULT_PANEL_WIDTHS);
    expect(normalizePanelWidths({ explorerPx: 400 }).explorerPx).toBe(400);
    expect(normalizePanelWidths({ explorerPx: 400 }).inspectorPx).toBe(
      DEFAULT_PANEL_WIDTHS.inspectorPx,
    );
    expect(normalizePanelWidths({ causalPx: 50 }).causalPx).toBe(240);
  });

  it('detects non-default widths', () => {
    expect(panelWidthsDifferFromDefault(DEFAULT_PANEL_WIDTHS)).toBe(false);
    expect(
      panelWidthsDifferFromDefault({ ...DEFAULT_PANEL_WIDTHS, explorerPx: 300 }),
    ).toBe(true);
  });
});
