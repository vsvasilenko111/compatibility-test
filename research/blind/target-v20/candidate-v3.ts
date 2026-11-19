import type { Profile } from '../../../src/types';
import { optionIndex } from '../../../src/answer';
import type { WellbeingFeatures } from './features';
import { extractFeaturesV2, predictCandidateV2, type CandidateWeightsV2 } from './candidate-v2';

export type SoftWeightsV3 = Pick<CandidateWeightsV2, 'similarity' | 'behavior'>;
export const METADATA_V3 = { candidate_version: 'research-v3', bank_version: 19, validation_status: 'research_only' } as const;

/** Ordinal distance is an explicit model choice; it is not a success probability. */
export function extractFeaturesV3(a: Profile, b: Profile): WellbeingFeatures {
  const base = extractFeaturesV2(a, b);
  const ra = a.responses['kids-02'], rb = b.responses['kids-02'];
  if (!ra || !rb || ra === 'skipped' || rb === 'skipped') throw new Error('Missing child-plan answers');
  return { ...base, childPlans: 1 - Math.abs(optionIndex(ra.value) - optionIndex(rb.value)) / 4 };
}

/** Largest score bounded by both the soft subtotal and the declared child-plan fit. */
export function predictCandidateV3(features: WellbeingFeatures, weights: SoftWeightsV3): number {
  const subtotal = predictCandidateV2(features, { ...weights, childPlans: 0 });
  return Math.min(subtotal, 100 * features.childPlans);
}
