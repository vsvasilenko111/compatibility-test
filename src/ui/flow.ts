import type { Progress } from '../storage';
import type { Response } from '../types';

const hasAnswer = (r: Response | undefined) => r !== undefined && r !== 'skipped';

/** Для дозаполнения старых ссылок: пропуски и отсутствующие ответы обязательны. */
export function unansweredIds(ids: string[], responses: Record<string, Response>): string[] {
  return ids.filter((id) => !hasAnswer(responses[id]));
}

/** Индекс первого обязательного ответа; старый пропуск требует заполнения. */
export function firstUnanswered(ids: string[], responses: Record<string, Response>): number {
  const i = ids.findIndex((id) => !hasAnswer(responses[id]));
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
