import type { Progress } from '../storage';
import type { Response } from '../types';

/** Индекс первого вопроса без ответа (пропуск считается ответом); ids.length, если отвечено всё. */
export function firstUnanswered(ids: string[], responses: Record<string, Response>): number {
  const i = ids.findIndex((id) => !(id in responses));
  return i === -1 ? ids.length : i;
}

/**
 * Ответы — те же при любом приглашении, поэтому продолжаем с ними в текущем контексте (inviterCode меняется на текущий).
 * Продолжаем с первого вопроса без ответа, а не с сохранённого индекса: после обновления банка порядок мог измениться.
 */
export function resumeFor(saved: Progress | null, inviterCode: string | null, ids: string[]): Progress | null {
  if (!saved) return null;
  return { ...saved, inviterCode, index: firstUnanswered(ids, saved.responses) };
}
