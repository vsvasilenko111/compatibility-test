import { describe, it, expect } from 'vitest';
import { QUESTIONS, BANK_VERSION } from '../research/blind/target-v20/legacy-questions';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile } from '../src/types';
import { extractFeaturesV3, predictCandidateV3 } from '../research/blind/target-v20/candidate-v3';

const weights = { similarity: 20, behavior: 60 };
const p = (kids: number): Profile => ({ name: '', bankVersion: BANK_VERSION,
  responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(q.id === 'kids-02' ? kids : q.id === 'honesty-03' ? 7 : 0)])),
});

describe('research-v3 child-plan aggregation', () => {
  it('does not compensate a missing child-plan condition with other high features', () => {
    expect(predictCandidateV3({ similarity: 1, behavior: 1, childPlans: 0 }, weights)).toBe(0);
    expect(predictCandidateV3({ similarity: 1, behavior: 1, childPlans: .5 }, weights)).toBe(50);
    expect(predictCandidateV3({ similarity: 1, behavior: 1, childPlans: .75 }, weights)).toBe(75);
  });
  it('applies no extra penalty below either bound and leaves the subtotal when plans match', () => {
    expect(predictCandidateV3({ similarity: 0, behavior: 1, childPlans: 1 }, weights)).toBe(75);
    expect(predictCandidateV3({ similarity: 0, behavior: 1, childPlans: .9 }, weights)).toBe(75);
    expect(predictCandidateV3({ similarity: 1, behavior: 0, childPlans: .5 }, weights)).toBe(25);
  });
  it('treats all identical plans as full agreement, without favoring endpoint answers', () => {
    for (const value of OPTION_VALUES) expect(extractFeaturesV3(p(value), p(value)).childPlans).toBe(1);
  });
  it('uses equal ordinal steps instead of an undocumented discontinuity', () => {
    const fits = OPTION_VALUES.map(value => extractFeaturesV3(p(0), p(value)).childPlans);
    expect(fits).toEqual([1, .75, .5, .25, 0]);
    for (const a of OPTION_VALUES) for (const b of OPTION_VALUES) {
      expect(extractFeaturesV3(p(a), p(b)).childPlans).toBe(extractFeaturesV3(p(b), p(a)).childPlans);
    }
  });
  it('satisfies the noncompensation bound throughout the feature grid', () => {
    for (const similarity of [0, .25, .5, .75, 1]) for (const behavior of [0, .25, .5, .75, 1])
      for (const childPlans of [0, .25, .5, .75, 1]) {
        const score = predictCandidateV3({ similarity, behavior, childPlans }, weights);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100 * childPlans);
        expect(score).toBeCloseTo(100 * Math.min(childPlans, .25 * similarity + .75 * behavior));
      }
  });
  it('requires finite nonnegative weights and validated features and preserves weight scale', () => {
    const f = { similarity: .5, behavior: 1, childPlans: 1 };
    expect(predictCandidateV3(f, weights)).toBeCloseTo(87.5);
    expect(predictCandidateV3(f, { similarity: 2e307, behavior: 6e307 })).toBeCloseTo(87.5);
    expect(() => predictCandidateV3(f, { similarity: 0, behavior: 0 })).toThrow();
    for (const value of [-1, NaN, Infinity]) expect(() => predictCandidateV3(f, { similarity: value, behavior: 1 })).toThrow();
    for (const value of [-.1, 1.1, NaN]) expect(() => predictCandidateV3({ ...f, childPlans: value }, weights)).toThrow();
  });
  it('preserves strict profile validation and ignores legacy firm flags as inputs to child fit', () => {
    const old = p(0); old.bankVersion = 18;
    expect(() => extractFeaturesV3(old, p(0))).toThrow();
    const missing = p(0); delete missing.responses['kids-02'];
    expect(() => extractFeaturesV3(missing, p(0))).toThrow();
    const a = p(0), b = p(10);
    const answer = a.responses['kids-02'];
    if (answer !== 'skipped') answer.firm = true;
    expect(extractFeaturesV3(a, b).childPlans).toBe(0);
  });
});
