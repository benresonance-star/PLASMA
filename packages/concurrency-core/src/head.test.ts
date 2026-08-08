import { describe, expect, it } from 'vitest';
import { assertExpectedHead, isHeadConflict } from './head.js';

describe('G3C.2 expected-head concurrency', () => {
  it('allows matching heads and rejects stale writes', () => {
    expect(() =>
      assertExpectedHead({ expectedHeadHash: 'abc', actualHeadHash: 'abc' }),
    ).not.toThrow();
    try {
      assertExpectedHead({
        expectedHeadHash: 'old',
        actualHeadHash: 'new',
        changedIds: ['param:x'],
        conflictingActors: ['user:1', 'ai:2'],
      });
      expect.unreachable('should throw');
    } catch (err) {
      expect(isHeadConflict(err)).toBe(true);
    }
  });
});
