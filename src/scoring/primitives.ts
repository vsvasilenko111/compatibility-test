import { IMPORTANCE_WEIGHTS, type Answer } from '../types';

export function weight(a: Answer): number {
  return IMPORTANCE_WEIGHTS[a.importance];
}

/** Ответы по одну сторону от середины — одно мнение разной силы: их разница считается вдвое мягче. */
export const SAME_SIDE_FACTOR = 0.5;

/**
 * Насколько ответ другого мне подходит: каждое деление разницы снимает 1/6 — 10 и 10 → 1, 10 и 4 → 0, разница 6+ → 0.
 * Если оба ответа по одну сторону от середины (10 и 7), разница считается вдвое мягче: 10 и 7 → 3/4, а не 1/2.
 * Так решительная манера отвечать (много 0 и 10) не превращает «то же мнение, но мягче» в расхождение.
 * Считается только по самим ответам: диапазоны lo/hi в ссылках остались от старых версий и больше не учитываются.
 */
export function fit(own: Answer, otherValue: number): number {
  const sameSide = (own.value - 5) * (otherValue - 5) > 0;
  return Math.max(0, 1 - (Math.abs(own.value - otherValue) * (sameSide ? SAME_SIDE_FACTOR : 1)) / 6);
}

/** Совпадение по полной разнице, без смягчения: для «стоит обсудить» — 10 и 6 остаётся темой, даже если мнение одно. */
export function rawFit(own: Answer, otherValue: number): number {
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
