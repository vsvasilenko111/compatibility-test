import { SPHERES } from '../questions/spheres';
import type { Profile, Question } from '../types';

export interface AnswerRow { id: string; text: string; left: string; right: string; sphere: string; a: number; b: number; diff: number; opposite: boolean }
export interface AnswerGroup { title: string; rows: AnswerRow[] }

/** Расхождение — от 3 делений, как у «стоит обсудить». */
export const DIVERGENCE = 3;

/** Вопросы, на которые ответили оба; пропущенные не показываются никогда. */
export function bothAnswered(questions: Question[], pa: Profile, pb: Profile): AnswerRow[] {
  const labels = new Map(SPHERES.map((s) => [s.id, s.label]));
  return questions.flatMap((q) => {
    const x = pa.responses[q.id], y = pb.responses[q.id];
    if (!x || !y || x === 'skipped' || y === 'skipped') return [];
    return [{ id: q.id, text: q.text, left: q.left, right: q.right, sphere: labels.get(q.sphere) ?? q.sphere,
      a: x.value, b: y.value, diff: Math.abs(x.value - y.value), opposite: (x.value - 5) * (y.value - 5) < 0 }];
  });
}

/**
 * Расхождения по группам: противоположные мнения, разные стороны от середины, одна сторона с разной силой. Внутри — от большей разницы.
 * Вопросы, где разница не минус (scored: false), сюда не попадают — они видны только во всех ответах.
 */
export function divergences(questions: Question[], pa: Profile, pb: Profile): AnswerGroup[] {
  const rows = bothAnswered(questions.filter((q) => q.scored !== false), pa, pb).filter((r) => r.diff >= DIVERGENCE).sort((x, y) => y.diff - x.diff);
  return [
    { title: 'Противоположные мнения', rows: rows.filter((r) => r.opposite && r.diff >= 6) },
    { title: 'По разные стороны от середины', rows: rows.filter((r) => r.opposite && r.diff < 6) },
    { title: 'Мнение одно, сила разная', rows: rows.filter((r) => !r.opposite) },
  ].filter((g) => g.rows.length > 0);
}
