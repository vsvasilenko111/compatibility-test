import type { Answer, Profile, Question } from '../types';
import { maturity, type MaturityResult } from './maturity';
import { fit, rawFit, strength, weight } from './primitives';

export interface ItemRef { id: string; topic: string; sphere: string }
/** Тема вопроса и степень совпадения 0..1 — без самих ответов. */
export interface SphereItem { id: string; topic: string; match: number }
export interface SphereScore { sphere: string; percent: number | null; items: SphereItem[] }
export interface ModeResult {
  percent: number | null;
  spheres: SphereScore[];
  redFlags: ItemRef[];
  superMatches: ItemRef[];
  strongMatches: ItemRef[];
  talkZones: ItemRef[];
  superCount: number;
  flexibleCount: number;
}
export interface CompareResult { relationship: ModeResult; friendship: ModeResult; maturity: MaturityResult | null }

export const TOP_N = 5;
const CARES = 10;
/**
 * Красный флаг — только по явной отметке «Для меня это не обсуждается»: кто-то из пары её поставил, а ответы расходятся
 * на FIRM_GAP делений и больше. Раньше флаг ставился по крайнему ответу — и выпадал у 82% случайных пар.
 */
export const FIRM_GAP = 4;
/**
 * Каждый красный флаг умножает «совместимость в отношениях» на FIRM_FACTOR (до калибровки). Сейчас 1 — процент флаг не снижает:
 * подбор на старых синтетических парах дал оптимум ≈1 (×0,95 — то же 82,8%), а на свежих любой штраф ухудшал согласие
 * с оценщиками (73,3% → 71,2% при ×0,85). research/scripts/review/v9-eval.ts. Флаг остаётся на экране.
 */
export const FIRM_FACTOR = 1;

export type SphereWeight = (sphere: string) => number;
const EQUAL: SphereWeight = () => 1;
/** Тема для разговора — расхождение от 3 делений (fit ≤ 0,5); мелкая разница в 1–2 деления темой не считается. */
const TALK_FIT = 0.5;

interface Pair {
  q: Question; a: Answer; b: Answer;
  wA: number; wB: number; fitA: number; fitB: number; s: number;
  /** Совпадение по полной разнице — для «стоит обсудить». */
  rawA: number; rawB: number;
}

function pairs(questions: Question[], pa: Profile, pb: Profile): Pair[] {
  const out: Pair[] = [];
  for (const q of questions) {
    const a = pa.responses[q.id];
    const b = pb.responses[q.id];
    if (!a || !b || a === 'skipped' || b === 'skipped') continue;
    out.push({
      q, a, b, wA: weight(a), wB: weight(b),
      fitA: fit(a, b.value), fitB: fit(b, a.value), s: strength(a, b),
      rawA: rawFit(a, b.value), rawB: rawFit(b, a.value),
    });
  }
  return out;
}

function percent(ps: Pair[], k: SphereWeight = EQUAL): number | null {
  let numA = 0, sumA = 0, numB = 0, sumB = 0;
  for (const p of ps) {
    const m = k(p.q.sphere);
    numA += m * p.wA * p.fitA; sumA += m * p.wA;
    numB += m * p.wB * p.fitB; sumB += m * p.wB;
  }
  if (sumA === 0 && sumB === 0) return null;
  const sA = sumA === 0 ? 1 : numA / sumA;
  const sB = sumB === 0 ? 1 : numB / sumB;
  return Math.sqrt(sA * sB) * 100;
}

const ref = (p: Pair): ItemRef => ({ id: p.q.id, topic: p.q.topic, sphere: p.q.sphere });
const desc = (key: (p: Pair) => number) => (x: Pair, y: Pair) => key(y) - key(x);
const bothCare = (p: Pair) => p.wA >= CARES && p.wB >= CARES;
const award = (p: Pair) => p.s * (p.wA + p.wB);

const isRed = (p: Pair) => p.q.firm === true && (p.a.firm === true || p.b.firm === true)
  && Math.abs(p.a.value - p.b.value) >= FIRM_GAP;

/** firmPenalty — снижать ли процент за красные флаги (только «совместимость в отношениях»). */
function mode(ps: Pair[], k: SphereWeight = EQUAL, firmPenalty = false): ModeResult {
  const supers = ps.filter((p) => bothCare(p) && p.s >= 0.8).sort(desc(award));
  const strongs = ps.filter((p) => bothCare(p) && p.s >= 0.5 && p.s < 0.8).sort(desc(award));
  const talks = ps
    .filter((p) => !isRed(p) && ((p.wA >= CARES && p.rawA <= TALK_FIT) || (p.wB >= CARES && p.rawB <= TALK_FIT)))
    .sort(desc((p) => p.wA * (1 - p.rawA) + p.wB * (1 - p.rawB)));
  const reds = ps.filter(isRed).sort(desc((p) => p.wA + p.wB));
  const flexible = ps.filter(
    (p) => Math.abs(p.a.value - 5) <= 1 && Math.abs(p.b.value - 5) <= 1,
  );
  const sphereIds = [...new Set(ps.map((p) => p.q.sphere))];
  const base = percent(ps, k);

  return {
    percent: base !== null && firmPenalty ? base * FIRM_FACTOR ** reds.length : base,
    spheres: sphereIds.map((sphere) => {
      const inSphere = ps.filter((p) => p.q.sphere === sphere);
      return {
        sphere,
        percent: percent(inSphere),
        items: inSphere.map((p) => ({ id: p.q.id, topic: p.q.topic, match: Math.min(p.fitA, p.fitB) })),
      };
    }),
    redFlags: reds.map(ref),
    superMatches: supers.slice(0, TOP_N).map(ref),
    strongMatches: strongs.slice(0, TOP_N).map(ref),
    talkZones: talks.slice(0, TOP_N).map(ref),
    superCount: supers.length,
    flexibleCount: flexible.length,
  };
}

/**
 * relationshipWeight — вес сферы в «отношениях», friendshipWeight — в «партнёр как друг» (сфера с весом 0 не входит).
 * По умолчанию: отношения — все сферы поровну, дружба — только блок дружбы поровну.
 */
export function compare(questions: Question[], a: Profile, b: Profile, relationshipWeight: SphereWeight = EQUAL, friendshipWeight?: SphereWeight): CompareResult {
  const all = pairs(questions.filter((q) => q.block !== 'maturity' && q.scored !== false), a, b);
  return {
    relationship: mode(all, relationshipWeight, true),
    friendship: friendshipWeight
      ? mode(all.filter((p) => friendshipWeight(p.q.sphere) > 0), friendshipWeight)
      : mode(all.filter((p) => p.q.block === 'friendship')),
    maturity: maturity(questions, a, b),
  };
}
