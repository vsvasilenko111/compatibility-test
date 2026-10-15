import { IMPORTANCE_WEIGHTS, type Answer } from '../types';

export function weight(a: Answer): number {
  return IMPORTANCE_WEIGHTS[a.importance];
}

/**
 * Насколько ответ другого (otherValue) мне подходит: 1 внутри моего диапазона, каждое деление снаружи снимает 1/6.
 * Сейчас диапазон — сама точка ответа, так что 10 и 10 → 1, 10 и 9 → 5/6, 10 и 8 → 2/3, разница 6+ → 0.
 */
export function fit(own: Answer, otherValue: number): number {
  const d = Math.max(0, own.lo - otherValue, otherValue - own.hi);
  return Math.max(0, 1 - d / 6);
}

/** Сила совпадения для наград. На процент совместимости не влияет. */
export function strength(a: Answer, b: Answer): number {
  if ((a.value - 5) * (b.value - 5) <= 0) return 0;
  const k = (Math.abs(a.value - 5) + Math.abs(b.value - 5)) / 2;
  const conviction = 1 - (1 - k / 5) ** 2;
  const closeness = Math.max(0, 1 - Math.abs(a.value - b.value) / 4);
  return conviction * closeness;
}
