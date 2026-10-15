import type { Answer, ImportanceLevel } from './types';

/** Важность — из удалённости ответа от середины: 0–1 и 9–10 — критично, 2–3 и 7–8 — очень, 4–6 — немного. */
export function importanceFor(value: number): ImportanceLevel {
  const k = Math.abs(value - 5);
  if (k >= 4) return 3;
  if (k >= 2) return 2;
  return 1;
}

/** Ответ целиком: диапазон — сама точка, поэтому совпадение плавно падает с каждым делением разницы. */
export function answerFor(value: number): Answer {
  return { value, lo: value, hi: value, importance: importanceFor(value) };
}
