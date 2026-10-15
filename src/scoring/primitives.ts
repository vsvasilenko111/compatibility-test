import { IMPORTANCE_WEIGHTS, type Answer } from '../types';

export function weight(a: Answer): number {
  return IMPORTANCE_WEIGHTS[a.importance];
}

/**
 * Насколько ответ другого мне подходит: каждое деление разницы снимает 1/6 — 10 и 10 → 1, 10 и 9 → 5/6, 10 и 8 → 2/3, разница 6+ → 0.
 * Считается только по самим ответам: диапазоны lo/hi в ссылках остались от старых версий и больше не учитываются.
 */
export function fit(own: Answer, otherValue: number): number {
  return Math.max(0, 1 - Math.abs(own.value - otherValue) / 6);
}

/** Сила совпадения для наград. На процент совместимости не влияет. */
export function strength(a: Answer, b: Answer): number {
  if ((a.value - 5) * (b.value - 5) <= 0) return 0;
  const k = (Math.abs(a.value - 5) + Math.abs(b.value - 5)) / 2;
  const conviction = 1 - (1 - k / 5) ** 2;
  const closeness = Math.max(0, 1 - Math.abs(a.value - b.value) / 4);
  return conviction * closeness;
}
