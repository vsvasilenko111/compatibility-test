/** Controlled historical mechanisms on the current bank; not a replay of old questionnaires. */
import type { Answer, Profile, Question } from '../../../src/types';
import { IMPORTANCE_WEIGHTS } from '../../../src/types';
import { optionIndex } from '../../../src/answer';
import { fit } from './legacy-primitives';
import type { SphereWeight } from './legacy-compare';

export type HistoricalCurve = 'table' | 'linear' | 'same-side' | 'table-equal' | 'linear-old-diagonal';
export type HistoricalWeighting = 'current' | 'old-importance';
export function historicalFit(curve: HistoricalCurve, a: Answer, b: Answer): number {
  if (curve === 'table') return fit(a, b);
  if (curve === 'table-equal') return optionIndex(a.value) === optionIndex(b.value) ? 1 : fit(a, b);
  if (curve === 'linear-old-diagonal') return optionIndex(a.value) === optionIndex(b.value) ? fit(a, b) : Math.max(0, 1 - Math.abs(a.value - b.value) / 6);
  if (curve !== 'linear' && curve !== 'same-side') throw new Error('Unknown historical curve');
  const sameSide = (a.value - 5) * (b.value - 5) > 0;
  const factor = curve === 'same-side' && sameSide ? .5 : 1;
  return Math.max(0, 1 - Math.abs(a.value - b.value) * factor / 6);
}
const answered = (p: Profile, id: string): Answer | null => {
  const response = p.responses[id];
  return response && response !== 'skipped' ? response : null;
};
export function historicalPercent(questions: Question[], a: Profile, b: Profile, curve: HistoricalCurve,
  weighting: HistoricalWeighting, sphereWeight: SphereWeight = () => 1): number | null {
  let numA = 0, sumA = 0, numB = 0, sumB = 0;
  if (weighting !== 'current' && weighting !== 'old-importance') throw new Error('Unknown weighting');
  for (const q of questions) {
    if (q.block === 'maturity' || q.scored === false) continue;
    const ra = answered(a, q.id), rb = answered(b, q.id);
    if (!ra || !rb) continue;
    const ia = optionIndex(ra.value), ib = optionIndex(rb.value);
    let matchA: number, matchB: number;
    if (q.cross) {
      const ha = answered(a, q.cross.id), hb = answered(b, q.cross.id);
      if (!ha || !hb) continue;
      matchA = 1 - (ia / 4) * q.cross.level[optionIndex(hb.value)];
      matchB = 1 - (ib / 4) * q.cross.level[optionIndex(ha.value)];
    } else {
      let match = historicalFit(curve, ra, rb);
      const across = q.split !== undefined && (ia < q.split) !== (ib < q.split);
      if ((q.sharedRisk && Math.min(ia, ib) >= q.sharedRisk - 1) || across) match = Math.min(match, .35);
      matchA = matchB = match;
    }
    const base = sphereWeight(q.sphere);
    const wa = base * (a.priorities?.[q.sphere] === 'top' ? 3 : 1) * (weighting === 'old-importance' ? IMPORTANCE_WEIGHTS[ra.importance] : 1);
    const wb = base * (b.priorities?.[q.sphere] === 'top' ? 3 : 1) * (weighting === 'old-importance' ? IMPORTANCE_WEIGHTS[rb.importance] : 1);
    numA += wa * matchA; sumA += wa;
    numB += wb * matchB; sumB += wb;
  }
  if (sumA === 0 && sumB === 0) return null;
  return 100 * Math.sqrt((sumA === 0 ? 1 : numA / sumA) * (sumB === 0 ? 1 : numB / sumB));
}
