import type { Profile } from '../../../src/types';
import { QUESTIONS } from './legacy-questions';
import { optionIndex } from '../../../src/answer';
import { relationshipWeight } from '../../../src/questions/spheres';
import { compare } from './legacy-compare';
import { extractFeatures, type WellbeingFeatures } from './features';

export type CandidateWeightsV2 = Record<keyof WellbeingFeatures, number>;
export const METADATA_V2 = { candidate_version: 'research-v2', bank_version: 19, validation_status: 'research_only' } as const;

/** Explicit mechanism rules, not empirically fitted judgments or clinical scales. */
export const BEHAVIOR_LEVELS_V2: Readonly<Record<string, readonly number[]>> = {
  'conflicts-02': [1, 1, 0.75, 0.25, 0],
  'conflicts-03': [1, 0.75, 0.5, 0.25, 0],
  'regul-08': [1, 0.75, 0.5, 0.25, 0],
  'reflect-01': [1, 0.75, 0.5, 0.25, 0],
  'reflect-02': [1, 0.75, 0.5, 0.25, 0],
  'attach-03': [1, 0.75, 0.5, 0.25, 0],
  'reflect-03': [1, 0.75, 0.5, 0.25, 0],
  'honesty-03': [0, 0.25, 0.5, 1, 1],
  'intimacy-03': [1, 1, 0.75, 0.5, 0],
  'conflicts-10': [1, 1, 0.75, 0.5, 0],
  'relatives-04': [0.75, 1, 1, 0.5, 0],
  'relatives-08': [1, 1, 1, 0.5, 0],
};
const behaviorIds = Object.keys(BEHAVIOR_LEVELS_V2);
const excludedFromSimilarity = new Set([...behaviorIds, 'kids-02']);
const preferenceQuestions = QUESTIONS.filter(q => !excludedFromSimilarity.has(q.id));

export function extractFeaturesV2(a: Profile, b: Profile): WellbeingFeatures {
  const original = extractFeatures(a, b); // Reuse strict v19 input validation and the unchanged child-plan rule.
  const similarity = compare(preferenceQuestions, a, b, relationshipWeight).relationship.percent;
  if (similarity === null) throw new Error('No preference evidence');
  const level = (p: Profile): number => behaviorIds.reduce((sum, id) => {
    const response = p.responses[id];
    if (!response || response === 'skipped') throw new Error(`Missing behavior answer: ${id}`);
    return sum + BEHAVIOR_LEVELS_V2[id][optionIndex(response.value)];
  }, 0) / behaviorIds.length;
  return { similarity: similarity / 100, behavior: Math.min(level(a), level(b)), childPlans: original.childPlans };
}

/** Convex mean: changing the common scale of the weights cannot erase a feature by saturation. */
export function predictCandidateV2(features: WellbeingFeatures, weights: CandidateWeightsV2): number {
  const keys = ['similarity', 'behavior', 'childPlans'] as const;
  for (const key of keys) {
    if (!Number.isFinite(features[key]) || features[key] < 0 || features[key] > 1) throw new Error(`Invalid feature: ${key}`);
    if (!Number.isFinite(weights[key]) || weights[key] < 0) throw new Error(`Invalid weight: ${key}`);
  }
  const maxWeight = Math.max(...keys.map(key => weights[key]));
  if (maxWeight === 0) throw new Error('At least one positive weight is required');
  const denominator = keys.reduce((sum, key) => sum + weights[key] / maxWeight, 0);
  const numerator = keys.reduce((sum, key) => sum + (weights[key] / maxWeight) * features[key], 0);
  return 100 * (numerator / denominator);
}
