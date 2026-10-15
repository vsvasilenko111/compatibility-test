import { describe, it, expect } from 'vitest';
import { fit, strength, weight } from '../src/scoring/primitives';
import type { Answer, ImportanceLevel } from '../src/types';

const ans = (value: number, lo = 0, hi = 10, importance: ImportanceLevel = 2): Answer => ({
  value, lo, hi, importance,
});

describe('weight', () => {
  it('переводит уровень в вес 0/1/10/50', () => {
    expect([0, 1, 2, 3].map((i) => weight(ans(5, 0, 10, i as ImportanceLevel)))).toEqual([0, 1, 10, 50]);
  });
});

describe('fit — каждое деление разницы снимает 1/6', () => {
  it('точечный диапазон: 10 и 10 → 1, 10 и 9 → 5/6, 10 и 8 → 2/3, 10 и 4 → 0', () => {
    const ten = ans(10, 10, 10);
    expect([10, 9, 8, 7, 6, 5, 4].map((v) => fit(ten, v))).toEqual([1, 5 / 6, 4 / 6, 3 / 6, 2 / 6, 1 / 6, 0].map((x) => expect.closeTo(x, 10)));
  });
});

describe('fit', () => {
  const own = ans(2, 0, 4);
  it.each([
    [0, 1], [4, 1], [5, 5 / 6], [6, 4 / 6], [7, 0.5], [9, 1 / 6], [10, 0],
  ])('ответ %i при диапазоне [0,4] → %f', (other, expected) => {
    expect(fit(own, other)).toBeCloseTo(expected, 5);
  });
  it('штраф симметричен слева от диапазона', () => {
    expect(fit(ans(8, 6, 10), 5)).toBeCloseTo(5 / 6, 5);
  });
});

describe('strength — эталонная таблица спецификации (fit = 1)', () => {
  it.each([
    [10, 10, 1.0], [9, 9, 0.96], [8, 8, 0.84], [10, 9, 0.7425], [9, 8, 0.6825],
    [7, 7, 0.64], [8, 7, 0.5625], [10, 8, 0.48], [9, 7, 0.42], [6, 6, 0.36],
    [0, 0, 1.0], [2, 2, 0.84],
  ])('%i и %i → %f', (a, b, expected) => {
    expect(strength(ans(a), ans(b))).toBeCloseTo(expected, 4);
  });

  it.each([[5, 5], [2, 8], [0, 10], [5, 9], [4, 6]])('%i и %i → 0 (центр или разные стороны)', (a, b) => {
    expect(strength(ans(a), ans(b))).toBe(0);
  });

  it('не зависит от приемлемого диапазона — только от самих ответов', () => {
    expect(strength(ans(10, 10, 10), ans(8, 8, 8))).toBeCloseTo(0.48, 4);
  });
});
