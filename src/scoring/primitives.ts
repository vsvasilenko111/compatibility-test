import { IMPORTANCE_WEIGHTS, type Answer } from '../types';

export function weight(a: Answer): number {
  return IMPORTANCE_WEIGHTS[a.importance];
}

/** Насколько ответ другого (otherValue) попадает в мой приемлемый диапазон: 1 внутри, −1/3 за каждое деление снаружи. */
export function fit(own: Answer, otherValue: number): number {
  const d = Math.max(0, own.lo - otherValue, otherValue - own.hi);
  return Math.max(0, 1 - d / 3);
}

/** Сила совпадения для наград. На процент совместимости не влияет. */
export function strength(a: Answer, b: Answer): number {
  if ((a.value - 5) * (b.value - 5) <= 0) return 0;
  const k = (Math.abs(a.value - 5) + Math.abs(b.value - 5)) / 2;
  const conviction = 1 - (1 - k / 5) ** 2;
  const closeness = Math.max(0, 1 - Math.abs(a.value - b.value) / 4);
  return conviction * closeness * Math.min(fit(a, b.value), fit(b, a.value));
}
