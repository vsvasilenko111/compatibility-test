import type { Profile } from '../../../src/types';
import { BANK_VERSION, QUESTIONS } from './legacy-questions';
import { OPTION_VALUES } from '../../../src/answer';
import { relationshipWeight } from '../../../src/questions/spheres';
import { compare } from './legacy-compare';

export interface WellbeingFeatures { similarity: number; behavior: number; childPlans: number }
const BEHAVIOR_IDS = ['conflicts-02', 'conflicts-03', 'regul-08', 'reflect-01', 'reflect-02', 'attach-03', 'reflect-03'];

/** Frozen research-v1 feature contract. A bank change requires a new review. */
export function extractFeatures(a: Profile, b: Profile): WellbeingFeatures {
  if (BANK_VERSION !== 19) throw new Error('Research features require bank v19');
  for (const p of [a, b]) {
    if (p.bankVersion !== 19) throw new Error('Research features require complete v19 profiles');
    if (p.priorities && Object.entries(p.priorities).some(([sphere, priority]) =>
      !QUESTIONS.some(q => q.sphere === sphere) || (priority !== 'top' && priority !== 'low'))) {
      throw new Error('Invalid profile priorities');
    }
    for (const q of QUESTIONS) {
      const r = p.responses[q.id];
      if (!r || r === 'skipped' || !(OPTION_VALUES as readonly number[]).includes(r.value)) {
        throw new Error(`Missing or invalid answer: ${q.id}`);
      }
    }
  }
  const known = new Set(QUESTIONS.map(q => q.id));
  if (!BEHAVIOR_IDS.every(id => known.has(id))) throw new Error('Missing behavior question in bank');
  const result = compare(QUESTIONS, a, b, relationshipWeight).relationship;
  const childPlans = result.spheres.flatMap(s => s.items).find(item => item.id === 'kids-02')?.match;
  if (result.percent === null || childPlans === undefined) throw new Error('Incomplete research features');
  const personLevel = (p: Profile): number => BEHAVIOR_IDS.reduce((sum, id) => {
    const r = p.responses[id];
    if (!r || r === 'skipped') throw new Error(`Missing behavior answer: ${id}`);
    return sum + 1 - r.value / 10;
  }, 0) / BEHAVIOR_IDS.length;
  return { similarity: result.percent / 100, behavior: Math.min(personLevel(a), personLevel(b)), childPlans };
}
