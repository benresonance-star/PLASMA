import { describe, expect, it } from 'vitest';
import { validationSourceLabel } from './validation-source.js';

describe('validationSourceLabel', () => {
  it('labels compile vs fixture honestly', () => {
    expect(validationSourceLabel({ validationFromCompile: true })).toMatch(/Live compile/i);
    expect(validationSourceLabel({ validationFromCompile: false })).toMatch(/fixture/i);
  });
});
