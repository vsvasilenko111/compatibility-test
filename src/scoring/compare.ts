import type { Answer, Profile, Question } from '../types';
import { fit, strength, weight } from './primitives';

export interface ItemRef { id: string; topic: string; sphere: string }
export interface SphereScore { sphere: string; percent: number | null }
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
export interface CompareResult { relationship: ModeResult; friendship: ModeResult }

export const TOP_N = 5;
const CRITICAL = 50;
const CARES = 10;

interface Pair {
  q: Question; a: Answer; b: Answer;
  wA: number; wB: number; fitA: number; fitB: number; s: number;
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
    });
  }
  return out;
}

function percent(ps: Pair[]): number | null {
  let numA = 0, sumA = 0, numB = 0, sumB = 0;
  for (const p of ps) {
    numA += p.wA * p.fitA; sumA += p.wA;
    numB += p.wB * p.fitB; sumB += p.wB;
  }
  if (sumA === 0 && sumB === 0) return null;
  const sA = sumA === 0 ? 1 : numA / sumA;
  const sB = sumB === 0 ? 1 : numB / sumB;
  return Math.sqrt(sA * sB) * 100;
}

const ref = (p: Pair): ItemRef => ({ id: p.q.id, topic: p.q.topic, sphere: p.q.sphere });
const desc = (key: (p: Pair) => number) => (x: Pair, y: Pair) => key(y) - key(x);
const isRed = (p: Pair) => (p.wA === CRITICAL && p.fitA === 0) || (p.wB === CRITICAL && p.fitB === 0);
const bothCare = (p: Pair) => p.wA >= CARES && p.wB >= CARES;
const award = (p: Pair) => p.s * (p.wA + p.wB);

function mode(ps: Pair[]): ModeResult {
  const supers = ps.filter((p) => bothCare(p) && p.s >= 0.8).sort(desc(award));
  const strongs = ps.filter((p) => bothCare(p) && p.s >= 0.5 && p.s < 0.8).sort(desc(award));
  const talks = ps
    .filter((p) => !isRed(p) && ((p.wA >= CARES && p.fitA < 1) || (p.wB >= CARES && p.fitB < 1)))
    .sort(desc((p) => p.wA * (1 - p.fitA) + p.wB * (1 - p.fitB)));
  const reds = ps.filter(isRed).sort(desc((p) => p.wA + p.wB));
  const flexible = ps.filter(
    (p) => Math.abs(p.a.value - 5) <= 1 && Math.abs(p.b.value - 5) <= 1 && p.fitA === 1 && p.fitB === 1,
  );
  const sphereIds = [...new Set(ps.map((p) => p.q.sphere))];

  return {
    percent: percent(ps),
    spheres: sphereIds.map((sphere) => ({ sphere, percent: percent(ps.filter((p) => p.q.sphere === sphere)) })),
    redFlags: reds.map(ref),
    superMatches: supers.slice(0, TOP_N).map(ref),
    strongMatches: strongs.slice(0, TOP_N).map(ref),
    talkZones: talks.slice(0, TOP_N).map(ref),
    superCount: supers.length,
    flexibleCount: flexible.length,
  };
}

export function compare(questions: Question[], a: Profile, b: Profile): CompareResult {
  const all = pairs(questions, a, b);
  return {
    relationship: mode(all),
    friendship: mode(all.filter((p) => p.q.block === 'friendship')),
  };
}
