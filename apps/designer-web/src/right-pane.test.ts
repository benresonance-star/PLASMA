import { describe, expect, it } from 'vitest';
import type { PanelId } from './shell.js';
import {
  RIGHT_PANE_KINDS,
  rightPaneForPanel,
  rightPaneLabel,
  shouldMountViewport,
} from './right-pane.js';

const PANELS: readonly PanelId[] = [
  'explorer',
  'viewport',
  'inspector',
  'pipeline',
  'validation',
  'history',
  'ai',
  'analysis-mesh',
  'schema',
];

describe('rightPaneForPanel', () => {
  it('maps every PanelId', () => {
    expect(rightPaneForPanel('explorer')).toBe('inspector');
    expect(rightPaneForPanel('viewport')).toBe('inspector');
    expect(rightPaneForPanel('inspector')).toBe('inspector');
    expect(rightPaneForPanel('pipeline')).toBe('pipeline');
    expect(rightPaneForPanel('validation')).toBe('validation');
    expect(rightPaneForPanel('history')).toBe('history');
    expect(rightPaneForPanel('ai')).toBe('ai');
    expect(rightPaneForPanel('analysis-mesh')).toBe('analysis-mesh');
    expect(rightPaneForPanel('schema')).toBe('schema');
  });

  it('covers all PanelIds in a table', () => {
    const kinds = PANELS.map(rightPaneForPanel);
    expect(kinds).toHaveLength(9);
    expect(new Set(kinds).size).toBe(7);
  });

  it('lists seven right-pane dropdown kinds with labels', () => {
    expect(RIGHT_PANE_KINDS).toHaveLength(7);
    expect(RIGHT_PANE_KINDS).not.toContain('viewport');
    expect(RIGHT_PANE_KINDS).not.toContain('explorer');
    expect(rightPaneLabel('ai')).toBe('AI');
    expect(rightPaneLabel('analysis-mesh')).toBe('Analysis mesh');
  });

  it('benchmarks 10k map calls under 5ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      rightPaneForPanel(PANELS[i % PANELS.length]!);
    }
    expect(performance.now() - t0).toBeLessThan(5);
  });
});

describe('shouldMountViewport', () => {
  it('is true for every panel', () => {
    for (const panel of PANELS) {
      expect(shouldMountViewport(panel)).toBe(true);
    }
  });
});
