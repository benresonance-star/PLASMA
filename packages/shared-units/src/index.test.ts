import { describe, expect, it } from 'vitest';
import { convertLength, quantity, toMillimetres } from './index.js';

describe('@spds/shared-units', () => {
  it('converts metres to millimetres', () => {
    expect(toMillimetres(quantity(2, 'm'))).toBe(2000);
  });

  it('converts inches to millimetres', () => {
    expect(toMillimetres(quantity(1, 'in'))).toBeCloseTo(25.4, 6);
  });

  it('round-trips mm → m → mm', () => {
    const original = quantity(1500, 'mm');
    const metres = convertLength(original, 'm');
    const back = convertLength(metres, 'mm');
    expect(back.value).toBeCloseTo(1500, 10);
    expect(back.unit).toBe('mm');
  });

  it('rejects non-finite values', () => {
    expect(() => quantity(Number.NaN, 'mm')).toThrow(/finite/);
  });
});
