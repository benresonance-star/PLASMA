import { describe, expect, it } from 'vitest';
import { PatternRegistry } from '@spds/pattern-engine';
import {
  GOLDBERG_PATTERN_ID,
  GOLDBERG_PATTERN_VERSION,
  loadGoldbergPatternManifest,
} from './index.js';

describe('E11 goldberg pattern package', () => {
  it('loads published manifest and registers for instantiate', () => {
    const pattern = loadGoldbergPatternManifest();
    expect(pattern.id).toBe(GOLDBERG_PATTERN_ID);
    expect(pattern.version).toBe(GOLDBERG_PATTERN_VERSION);
    expect(pattern.lifecycle).toBe('published');
    expect(pattern.operatorBindings.some((b) => b.operatorId === 'topology.goldberg.class-i')).toBe(
      true,
    );

    const registry = new PatternRegistry();
    registry.register(pattern);
    const instance = registry.instantiate(
      GOLDBERG_PATTERN_ID,
      GOLDBERG_PATTERN_VERSION,
      'pattern-instance:d01',
    );
    expect(instance.pattern.id).toBe(GOLDBERG_PATTERN_ID);
  });
});
