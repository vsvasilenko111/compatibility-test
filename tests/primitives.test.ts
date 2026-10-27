import { describe, it, expect } from 'vitest';
import { fit, MATCH, steps, strength } from '../src/scoring/primitives';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Answer, ImportanceLevel } from '../src/types';

const ans = (value: number, lo = 0, hi = 10, importance: ImportanceLevel = 2): Answer => ({
  value, lo, hi, importance,
});
const opt = (n: number) => answerFor(OPTION_VALUES[n - 1]);

describe('fit — таблица совпадения 5×5', () => {
  it('строка первого варианта: 100 / 75 / 35 / 10 / 0', () => {
    expect([1, 2, 3, 4, 5].map((n) => fit(opt(1), opt(n)))).toEqual([1, 0.75, 0.35, 0.1, 0]);
  });
  it('одинаковые ответы: в крае 100, во втором и четвёртом 95, в середине 90', () => {
    expect([1, 2, 3, 4, 5].map((n) => fit(opt(n), opt(n)))).toEqual([1, 0.95, 0.9, 0.95, 1]);
  });
  it('таблица симметрична', () => {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) expect(MATCH[i][j]).toBe(MATCH[j][i]);
  });
  it('ответ прежней шкалы 0–10 берётся по ближайшему варианту', () => {
    expect(fit(answerFor(9), answerFor(10))).toBe(1);
    expect(fit(answerFor(2), answerFor(3))).toBe(0.95);
  });
});

describe('steps — расстояние в вариантах', () => {
  it('0 — тот же, 4 — противоположные края', () => {
    expect([1, 2, 3, 4, 5].map((n) => steps(opt(1), opt(n)))).toEqual([0, 1, 2, 3, 4]);
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
