import { optionIndex } from '../answer';
import type { Answer } from '../types';

/**
 * Совпадение по одному вопросу — по номерам вариантов (строка — ответ одного, столбец — другого). Таблица симметрична.
 * Шаг в сторону — 75%, через вариант — 35%, через два — 10%, противоположные края — 0. Одинаковые ответы: в крае 100%,
 * во втором и четвёртом 95%, в середине 90% — совпасть в убеждении чуть ценнее, чем в компромиссе.
 * Все вопросы весят одинаково: важность задают вес сферы, личный выбор сфер и отметка «не обсуждается».
 * На синтетике (research/review/scoring-eval.txt) так согласие с оценщиками выше, чем при весах из удалённости от середины.
 */
export const MATCH: readonly (readonly number[])[] = [
  [1, 0.75, 0.35, 0.1, 0],
  [0.75, 0.95, 0.75, 0.35, 0.1],
  [0.35, 0.75, 0.9, 0.75, 0.35],
  [0.1, 0.35, 0.75, 0.95, 0.75],
  [0, 0.1, 0.35, 0.75, 1],
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
