import type { Progress } from '../storage';

/** Ответы — те же при любом приглашении, поэтому продолжаем с ними в текущем контексте (inviterCode меняется на текущий). */
export function resumeFor(saved: Progress | null, inviterCode: string | null, total: number): Progress | null {
  if (!saved) return null;
  return { ...saved, inviterCode, index: Math.min(Math.max(saved.index, 0), total) };
}
