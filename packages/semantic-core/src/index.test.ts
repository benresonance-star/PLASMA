import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  formatSemanticId,
  parseSemanticId,
  parseSemanticObject,
} from './index.js';

describe('@spds/semantic-core', () => {
  it('parses and formats semantic IDs', () => {
    expect(parseSemanticId('component:y:0042')).toBe('component:y:0042');
    expect(formatSemanticId(['cell', 'h', '0017'])).toBe('cell:h:0017');
  });

  it('rejects invalid IDs', () => {
    expect(() => parseSemanticId('')).toThrow(/Invalid semantic ID/);
    expect(() => parseSemanticId('NoColon')).toThrow(/Invalid semantic ID/);
  });

  it('accepts a valid semantic envelope', () => {
    const obj = parseSemanticObject({
      id: 'param:y.member-wall-thickness',
      kind: 'Parameter',
      semanticType: 'geometry.thickness',
      name: 'Member wall thickness',
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    expect(obj.kind).toBe('Parameter');
  });

  it('rejects missing id and unknown kind', () => {
    expect(() =>
      parseSemanticObject({
        kind: 'Parameter',
        semanticType: 'geometry.thickness',
        name: 'x',
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:00.000Z',
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }),
    ).toThrow();

    expect(() =>
      parseSemanticObject({
        id: 'entity:demo:1',
        kind: 'NotAKind',
        semanticType: 'demo',
        name: 'x',
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:00.000Z',
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }),
    ).toThrow();
  });
});
