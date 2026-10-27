import type { Answer, ImportanceLevel } from './types';

/** Важность — из удалённости ответа от середины: 0–1 и 9–10 — критично, 2–3 и 7–8 — очень, 4–6 — немного. */
export function importanceFor(value: number): ImportanceLevel {
  const k = Math.abs(value - 5);
  if (k >= 4) return 3;
  if (k >= 2) return 2;
  return 1;
}

/**
 * Значения пяти вариантов на внутренней шкале 0–10 (так ответ хранится в ссылке). Совпадение считается по номерам вариантов
 * (таблица MATCH); значения нужны для блока зрелости, ресурсов пары и наград, где пороги заданы на шкале 0–10.
 */
export const OPTION_VALUES = [0, 3, 5, 7, 10] as const;

/** Номер варианта (0–4) по значению; для ответов старой шкалы — ближайший вариант. */
export function optionIndex(value: number): number {
  let best = 0;
  OPTION_VALUES.forEach((v, i) => { if (Math.abs(v - value) < Math.abs(OPTION_VALUES[best] - value)) best = i; });
  return best;
}

/** Ответ целиком: диапазон — сама точка, поэтому совпадение плавно падает с каждым делением разницы. */
export function answerFor(value: number): Answer {
  return { value, lo: value, hi: value, importance: importanceFor(value) };
}
