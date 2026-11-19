import type { WellbeingFeatures } from './features';

export interface CandidateParameters {
  intercept: number;
  similarity: number;
  behavior: number;
  childPlans: number;
}
export const CANDIDATE_METADATA = {
  candidate_version: 'research-v1', bank_version: 19, validation_status: 'research_only',
} as const;

/** Explicit coefficients only: no fitted or recommended weights are shipped. */
export function predictCandidate(features: WellbeingFeatures, parameters: CandidateParameters): number {
  if (!Number.isFinite(parameters.intercept)) throw new Error('Intercept must be finite');
  let score = parameters.intercept;
  for (const key of ['similarity', 'behavior', 'childPlans'] as const) {
    const value = features[key], weight = parameters[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Invalid feature: ${key}`);
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Invalid coefficient: ${key}`);
    score += value * weight;
  }
  return Math.max(0, Math.min(100, score));
}
