import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSchemaLayoutPrefs,
  loadSchemaModelLayoutPrefs,
  parseSchemaLayoutPrefsStore,
  persistSchemaModelLayoutPrefs,
  positionsMapFromPrefs,
  positionsRecordFromMap,
} from './schema-layout-prefs.js';

describe('schema-layout-prefs', () => {
  beforeEach(() => {
    clearSchemaLayoutPrefs();
  });

  it('round-trips positions, expanded sets, and lens per model', () => {
    persistSchemaModelLayoutPrefs('model:d01', {
      positions: { 'param:d01:length': { x: 120, y: 40 } },
      expandedSetIds: ['structural.y-component'],
      lens: 'full',
      parameterContainer: false,
    });
    const loaded = loadSchemaModelLayoutPrefs('model:d01');
    expect(loaded.lens).toBe('full');
    expect(loaded.expandedSetIds).toEqual(['structural.y-component']);
    expect(loaded.positions['param:d01:length']).toEqual({ x: 120, y: 40 });
    expect(loaded.parameterContainer).toBe(false);
    expect(loadSchemaModelLayoutPrefs('model:other').parameterContainer).toBe(true);
    expect(loadSchemaModelLayoutPrefs('model:other').positions).toEqual({});
  });

  it('ignores corrupt position rows', () => {
    const store = parseSchemaLayoutPrefsStore({
      byModel: {
        m: {
          positions: {
            ok: { x: 1, y: 2 },
            bad: { x: 'nope', y: 2 },
          },
          expandedSetIds: ['a'],
          lens: 'mutable',
        },
      },
    });
    expect(store.byModel.m?.positions).toEqual({ ok: { x: 1, y: 2 } });
  });

  it('converts map ↔ record', () => {
    const map = new Map([['a', { x: 3, y: 4 }]]);
    const record = positionsRecordFromMap(map);
    expect(
      positionsMapFromPrefs({
        positions: record,
        expandedSetIds: [],
        lens: 'mutable',
        parameterContainer: true,
      }).get('a'),
    ).toEqual({
      x: 3,
      y: 4,
    });
  });
});
