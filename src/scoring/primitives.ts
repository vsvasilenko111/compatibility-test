import { optionIndex } from '../answer';
import type { Answer } from '../types';

/**
 * Пять вариантов, четыре равных шага: 100 / 75 / 50 / 25 / 0 процентов совпадения.
 * Любые одинаковые варианты дают 100%; степень убеждённости не снижает совпадение.
 * Смысловые ограничения sharedRisk/split и взаимная приемлемость привычек применяются отдельно в compare().
 */
export const MATCH: readonly (readonly number[])[] = [
  [1, 0.75, 0.5, 0.25, 0],
  [0.75, 1, 0.75, 0.5, 0.25],
  [0.5, 0.75, 1, 0.75, 0.5],
  [0.25, 0.5, 0.75, 1, 0.75],
  [0, 0.25, 0.5, 0.75, 1],
];

export function fit(a: Answer, b: Answer): number {
  return MATCH[optionIndex(a.value)][optionIndex(b.value)];
}

/** На сколько вариантов расходятся ответы: 0 — одинаковые, 4 — противоположные края. */
export function steps(a: Answer, b: Answer): number {
  return Math.abs(optionIndex(a.value) - optionIndex(b.value));
}

/** Сила совпадения для наград. На процент совместимости не влияет. */
export function strength(a: Answer, b: Answer): number {
  if ((a.value - 5) * (b.value - 5) <= 0) return 0;
  const k = (Math.abs(a.value - 5) + Math.abs(b.value - 5)) / 2;
  const conviction = 1 - (1 - k / 5) ** 2;
  const closeness = Math.max(0, 1 - Math.abs(a.value - b.value) / 4);
  return conviction * closeness;
}
