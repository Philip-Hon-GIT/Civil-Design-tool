import { describe, expect, it } from 'vitest';
import { formatStation, parseStation } from '../src/core/station';

describe('formatStation', () => {
  it('formats metres as km+m', () => {
    expect(formatStation(0)).toBe('0+000.00');
    expect(formatStation(545)).toBe('0+545.00');
    expect(formatStation(1023.954)).toBe('1+023.95');
    expect(formatStation(999.999)).toBe('1+000.00');
  });
  it('handles negative stations', () => {
    expect(formatStation(-12.5)).toBe('-0+012.50');
  });
  it('rejects non-finite values', () => {
    expect(() => formatStation(Number.NaN)).toThrow(RangeError);
  });
});

describe('parseStation', () => {
  it('round-trips with formatStation', () => {
    for (const v of [0, 545, 1023.95, 12_345.67, -12.5]) {
      expect(parseStation(formatStation(v))).toBeCloseTo(v, 2);
    }
  });
  it('rejects bad input', () => {
    expect(() => parseStation('545')).toThrow(SyntaxError);
  });
});
