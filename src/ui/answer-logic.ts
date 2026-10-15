import type { Answer, ImportanceLevel } from '../types';

export const DEFAULT_SPREAD = 2;

/** Важность — из удалённости ответа от середины: 0–1 и 9–10 — критично, 2–3 и 7–8 — очень, 4–6 — немного. */
export function importanceFor(value: number): ImportanceLevel {
  const k = Math.abs(value - 5);
  if (k >= 4) return 3;
  if (k >= 2) return 2;
  return 1;
}

/** Ответ целиком: приемлемым для партнёра считается всё в пределах ±2 от своего ответа. */
export function answerFor(value: number): Answer {
  return {
    value,
    lo: Math.max(0, value - DEFAULT_SPREAD),
    hi: Math.min(10, value + DEFAULT_SPREAD),
    importance: importanceFor(value),
  };
}
