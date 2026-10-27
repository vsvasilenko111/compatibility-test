import type { Answer, Priority, Profile, Question } from '../types';
import { maturity, type MaturityResult } from './maturity';
import { resources, type Resource } from './resources';
import { fit, steps, strength } from './primitives';

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
export interface CompareResult { relationship: ModeResult; friendship: ModeResult; maturity: MaturityResult | null; resources: Resource[] | null }

/**
 * Красный флаг — только по явной отметке «Для меня это не обсуждается»: кто-то из пары её поставил, а ответы расходятся
 * через вариант и дальше (FIRM_STEPS). Раньше флаг ставился по крайнему ответу — и выпадал у 82% случайных пар.
 */
export const FIRM_STEPS = 2;
/**
 * Каждый красный флаг умножает «совместимость в отношениях» на FIRM_FACTOR (до калибровки). Сейчас 1 — процент флаг не снижает:
 * подбор на старых синтетических парах дал оптимум ≈1 (×0,95 — то же 82,8%), а на свежих любой штраф ухудшал согласие
 * с оценщиками (73,3% → 71,2% при ×0,85). research/scripts/review/v9-eval.ts. Флаг остаётся на экране.
 */
export const FIRM_FACTOR = 1;

/**
 * Личная важность сферы умножает её вес только для того, кто её выбрал: проценты считаются «насколько партнёр подходит мне
 * по моим меркам», поэтому у каждого свои множители. Вес по исследованиям остаётся — личный выбор его усиливает.
 * Человек выбирает 5 важных сфер (×3). «Менее важные» (low) остались только в ссылках формата 4 и ничего не меняют:
 * на синтетике они точности не добавляли. ×3 — лучший из ×1,5…×4 (research/review/priorities-eval-v14.txt).
 */
export const PRIORITY_FACTOR: Record<Priority, number> = { top: 3, low: 1 };
const priorityOf = (p: Profile, sphere: string): number => {
  const pr = p.priorities?.[sphere];
  return pr ? PRIORITY_FACTOR[pr] : 1;
};

export type SphereWeight = (sphere: string) => number;
const EQUAL: SphereWeight = () => 1;
/** Тема для разговора — расхождение через вариант и дальше; соседние варианты темой не считаются. */
const TALK_STEPS = 2;

interface Pair {
  q: Question; a: Answer; b: Answer;
  /** Совпадение по таблице MATCH и расстояние в вариантах. */
  match: number; steps: number; s: number;
  /** Личная важность сферы для каждого (PRIORITY_FACTOR). */
  mA: number; mB: number;
}

function pairs(questions: Question[], pa: Profile, pb: Profile): Pair[] {
  const out: Pair[] = [];
  for (const q of questions) {
    const a = pa.responses[q.id];
    const b = pb.responses[q.id];
    if (!a || !b || a === 'skipped' || b === 'skipped') continue;
    out.push({
      q, a, b, match: fit(a, b), steps: steps(a, b), s: strength(a, b),
      mA: priorityOf(pa, q.sphere), mB: priorityOf(pb, q.sphere),
    });
  }
  return out;
}

function percent(ps: Pair[], k: SphereWeight = EQUAL): number | null {
  let numA = 0, sumA = 0, numB = 0, sumB = 0;
  for (const p of ps) {
    const m = k(p.q.sphere);
    numA += m * p.mA * p.match; sumA += m * p.mA;
    numB += m * p.mB * p.match; sumB += m * p.mB;
  }
  if (sumA === 0 && sumB === 0) return null;
  const sA = sumA === 0 ? 1 : numA / sumA;
  const sB = sumB === 0 ? 1 : numB / sumB;
  return Math.sqrt(sA * sB) * 100;
}

const ref = (p: Pair): ItemRef => ({ id: p.q.id, topic: p.q.topic, sphere: p.q.sphere });
const desc = (key: (p: Pair) => number) => (x: Pair, y: Pair) => key(y) - key(x);
const award = (p: Pair) => p.s * (p.mA + p.mB);

const isRed = (p: Pair) => p.q.firm === true && (p.a.firm === true || p.b.firm === true)
  && p.steps >= FIRM_STEPS;

/** firmPenalty — снижать ли процент за красные флаги (только «совместимость в отношениях»). */
function mode(ps: Pair[], k: SphereWeight = EQUAL, firmPenalty = false): ModeResult {
  // Награды — только за совпадение по одну сторону от середины (strength > 0): общее убеждение, а не компромисс.
  const supers = ps.filter((p) => p.s >= 0.8).sort(desc(award));
  const strongs = ps.filter((p) => p.s >= 0.5 && p.s < 0.8).sort(desc(award));
  const talks = ps
    .filter((p) => !isRed(p) && p.steps >= TALK_STEPS)
    // Сначала темы из сфер с большим весом: в «отношениях» дети и деньги раньше досуга и юмора; выше — то, что важно кому-то лично.
    .sort(desc((p) => k(p.q.sphere) * (p.mA + p.mB) * (1 - p.match)));
  const reds = ps.filter(isRed).sort(desc((p) => p.steps + k(p.q.sphere)));
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
        items: inSphere.map((p) => ({ id: p.q.id, topic: p.q.topic, match: p.match })),
      };
    }),
    redFlags: reds.map(ref),
    // Показываются все темы, не только первые: порядок — от самых важных.
    superMatches: supers.map(ref),
    strongMatches: strongs.map(ref),
    talkZones: talks.map(ref),
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
    resources: resources(questions, a, b),
  };
}
