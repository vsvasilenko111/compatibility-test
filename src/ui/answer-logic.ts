import { MAX_CRITICAL, type Answer, type ImportanceLevel, type Response } from '../types';

export interface Draft {
  value: number | null;
  lo: number;
  hi: number;
  importance: ImportanceLevel | null;
}

export const DEFAULT_SPREAD = 2;

export const emptyDraft = (): Draft => ({ value: null, lo: 0, hi: 10, importance: null });

export function draftFrom(r: Response | undefined): Draft {
  if (!r || r === 'skipped') return emptyDraft();
  return { value: r.value, lo: r.lo, hi: r.hi, importance: r.importance };
}

export function setValue(d: Draft, value: number): Draft {
  return {
    ...d,
    value,
    lo: Math.max(0, value - DEFAULT_SPREAD),
    hi: Math.min(10, value + DEFAULT_SPREAD),
  };
}

/** Тап левее своего ответа — новая нижняя граница, правее — верхняя, по ответу — диапазон сжимается до точки. */
export function tapRange(d: Draft, cell: number): Draft {
  if (d.value === null) return d;
  if (cell < d.value) return { ...d, lo: cell };
  if (cell > d.value) return { ...d, hi: cell };
  return { ...d, lo: d.value, hi: d.value };
}

export const setImportance = (d: Draft, importance: ImportanceLevel): Draft => ({ ...d, importance });

export function toAnswer(d: Draft): Answer | null {
  if (d.value === null || d.importance === null) return null;
  return { value: d.value, lo: d.lo, hi: d.hi, importance: d.importance };
}

export function criticalCount(responses: Record<string, Response>, exceptId: string): number {
  return Object.entries(responses).filter(
    ([id, r]) => id !== exceptId && r !== 'skipped' && r.importance === 3,
  ).length;
}

export const canChooseCritical = (usedElsewhere: number) => usedElsewhere < MAX_CRITICAL;
