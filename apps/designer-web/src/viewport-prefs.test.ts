import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearViewportPrefs,
  createDefaultViewportPrefs,
  parseViewportPrefs,
  persistEngineLayers,
  persistViewportBackground,
  persistViewportCamera,
  loadViewportPrefs,
} from './viewport-prefs.js';

describe('viewport prefs persistence', () => {
  beforeEach(() => {
    clearViewportPrefs();
  });

  it('round-trips engine opacities and camera pose via localStorage', () => {
    persistEngineLayers({
      reference: { visible: true, opacity: 0.27 },
      geometryService: { visible: true, opacity: 0.15 },
    });
    persistViewportCamera({
      position: [100, 200, 300],
      target: [10, 20, 30],
    });
    const loaded = loadViewportPrefs();
    expect(loaded.engines.reference.opacity).toBeCloseTo(0.27);
    expect(loaded.engines.geometryService.opacity).toBeCloseTo(0.15);
    expect(loaded.camera?.position).toEqual([100, 200, 300]);
    expect(loaded.camera?.target).toEqual([10, 20, 30]);
    expect(loaded.backgroundHexDark).toBeNull();
    expect(loaded.backgroundHexLight).toBeNull();
  });

  it('stores separate dark and light viewport background colours', () => {
    persistViewportBackground('dark', '#1e293b');
    persistViewportBackground('light', '#eef2f6');
    const loaded = loadViewportPrefs();
    expect(loaded.backgroundHexDark).toBe('#1e293b');
    expect(loaded.backgroundHexLight).toBe('#eef2f6');
    persistViewportBackground('dark', null);
    expect(loadViewportPrefs().backgroundHexDark).toBeNull();
    expect(loadViewportPrefs().backgroundHexLight).toBe('#eef2f6');
  });

  it('migrates legacy single backgroundHex into both theme slots', () => {
    const parsed = parseViewportPrefs(
      JSON.stringify({
        engines: createDefaultViewportPrefs().engines,
        backgroundHex: '#334155',
      }),
    );
    expect(parsed?.backgroundHexDark).toBe('#334155');
    expect(parsed?.backgroundHexLight).toBe('#334155');
  });

  it('rejects invalid camera payloads', () => {
    const parsed = parseViewportPrefs(
      JSON.stringify({
        engines: createDefaultViewportPrefs().engines,
        camera: { position: [1, 2], target: [0, 0, 0] },
      }),
    );
    expect(parsed?.camera).toBeNull();
  });

  it('rejects invalid background hex', () => {
    const parsed = parseViewportPrefs(
      JSON.stringify({
        engines: createDefaultViewportPrefs().engines,
        backgroundHexDark: 'not-a-color',
        backgroundHexLight: '#gg0000',
      }),
    );
    expect(parsed?.backgroundHexDark).toBeNull();
    expect(parsed?.backgroundHexLight).toBeNull();
  });
});
