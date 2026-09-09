import { describe, expect, it } from 'vitest';
import {
  findPatternParameter,
  parsePatternDefinition,
  resolvePatternParameters,
} from './pattern.js';

const pattern = parsePatternDefinition({
  id: 'pattern:test',
  version: '1.0.0',
  name: 'Test pattern',
  lifecycle: 'published',
  parameters: [
    {
      name: 'count',
      semanticId: 'param:test:count',
      path: 'params.count',
      type: 'integer',
      unit: '1',
      default: 2,
      min: 1,
      max: 8,
      aliases: ['param:legacy:count'],
    },
  ],
});

describe('pattern-owned parameter contracts', () => {
  it('resolves defaults and path overrides', () => {
    expect(resolvePatternParameters(pattern)).toEqual({ 'params.count': 2 });
    expect(resolvePatternParameters(pattern, { 'params.count': 3 })).toEqual({
      'params.count': 3,
    });
  });

  it('resolves semantic ids and aliases without model-specific maps', () => {
    expect(findPatternParameter(pattern, 'param:test:count')?.path).toBe('params.count');
    expect(findPatternParameter(pattern, 'param:legacy:count')?.path).toBe('params.count');
  });

  it('rejects values outside the package-declared domain', () => {
    expect(() => resolvePatternParameters(pattern, { 'params.count': 9 })).toThrow(
      /outside its domain/,
    );
  });
});
