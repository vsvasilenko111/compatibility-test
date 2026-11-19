import { describe, expect, it } from 'vitest';
import { referencePercentile } from '../src/scoring/reference-percentile';

describe('referencePercentile', () => {
  it('uses the middle rank of each tied group, including exact endpoints', () => {
    const samples = [10, 10, 30, 70, 70, 70, 90, 90];
    expect(referencePercentile(10, samples)).toBe(12.5);
    expect(referencePercentile(30, samples)).toBe(31.25);
    expect(referencePercentile(70, samples)).toBe(56.25);
    expect(referencePercentile(90, samples)).toBe(87.5);
  });

  it('interpolates over raw-score gaps between distinct tied groups', () => {
    const samples = [10, 10, 30, 70, 70, 70, 90, 90];
    expect(referencePercentile(20, samples)).toBe(21.875);
    expect(referencePercentile(40, samples)).toBe(37.5);
    expect(referencePercentile(80, samples)).toBe(71.875);
  });

  it('saturates strictly outside support while keeping endpoint midranks', () => {
    expect(referencePercentile(0, [20, 80])).toBe(0);
    expect(referencePercentile(19.999, [20, 80])).toBe(0);
    expect(referencePercentile(20, [20, 80])).toBe(25);
    expect(referencePercentile(80, [20, 80])).toBe(75);
    expect(referencePercentile(80.001, [20, 80])).toBe(100);
    expect(referencePercentile(100, [20, 80])).toBe(100);
    expect(referencePercentile(0, [0, 100])).toBe(25);
    expect(referencePercentile(100, [0, 100])).toBe(75);
  });

  it('propagates a missing score for a valid reference', () => {
    expect(referencePercentile(null, [10, 90])).toBeNull();
  });

  it.each([[], [50], [50, 50], [30, 20], [10, NaN], [10, Infinity], [-1, 20], [10, 101]])(
    'rejects an unusable reference %j even for a missing score', (...samples) => {
      expect(() => referencePercentile(50, samples)).toThrow(RangeError);
      expect(() => referencePercentile(null, samples)).toThrow(RangeError);
    },
  );

  it.each([NaN, Infinity, -Infinity, -0.001, 100.001])('rejects invalid raw score %s', raw => {
    expect(() => referencePercentile(raw, [10, 90])).toThrow(RangeError);
  });

  it('preserves fractional precision instead of rounding scores or ranks', () => {
    expect(referencePercentile(20, [10, 20, 30])).toBe(50);
    expect(referencePercentile(10, [10, 20, 30])).toBeCloseTo(16.666666666666668, 13);
    expect(referencePercentile(12.345, [10, 20, 30])).toBeCloseTo(24.483333333333334, 13);
    expect(referencePercentile(10.0001, [10, 10.0002])).toBeCloseTo(50, 8);
  });

  it('is monotone across ties, gaps and support boundaries without mutating the reference', () => {
    const samples = Object.freeze([10, 10, 30, 70, 70, 70, 90, 90]);
    let previous = -1;
    for (let raw = 0; raw <= 100; raw += 0.25) {
      const value = referencePercentile(raw, samples)!;
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      previous = value;
    }
    expect(samples).toEqual([10, 10, 30, 70, 70, 70, 90, 90]);
  });

  it('maps a symmetric reference symmetrically around its central score', () => {
    const samples = [10, 10, 30, 50, 70, 90, 90];
    expect(referencePercentile(50, samples)).toBe(50);
    for (const raw of [0, 10, 15, 30, 43.25, 50]) {
      expect(referencePercentile(raw, samples)! + referencePercentile(100 - raw, samples)!).toBeCloseTo(100, 12);
    }
  });
});
