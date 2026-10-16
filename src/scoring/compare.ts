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
const CRITICAL = 50;
const CARES = 10;
/** Красный флаг ставится только в сферах с весом от 0,4 — расхождения в стиле ссор, юморе, досуге идут в «обсудить». */
const RED_MIN_WEIGHT = 0.4;

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

function mode(ps: Pair[], k: SphereWeight = EQUAL): ModeResult {
  const isRed = (p: Pair) => k(p.q.sphere) >= RED_MIN_WEIGHT
    && ((p.wA === CRITICAL && p.fitA === 0) || (p.wB === CRITICAL && p.fitB === 0));
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

  return {
    percent: percent(ps, k),
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
    relationship: mode(all, relationshipWeight),
    friendship: friendshipWeight
      ? mode(all.filter((p) => friendshipWeight(p.q.sphere) > 0), friendshipWeight)
      : mode(all.filter((p) => p.q.block === 'friendship')),
    maturity: maturity(questions, a, b),
  };
}
