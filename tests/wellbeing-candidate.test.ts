import { describe, it, expect } from 'vitest';
import { QUESTIONS, BANK_VERSION } from '../research/blind/target-v20/legacy-questions';
import { answerFor } from '../src/answer';
import type { Profile } from '../src/types';
import { extractFeatures } from '../research/blind/target-v20/features';
import { predictCandidate } from '../research/blind/target-v20/candidate';

const behaviorIds = ['conflicts-02', 'conflicts-03', 'regul-08', 'reflect-01', 'reflect-02', 'attach-03', 'reflect-03'];
const profile = (overrides: Record<string, number> = {}): Profile => ({
  name: 'fictional', bankVersion: BANK_VERSION,
  responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(overrides[q.id] ?? 0)])),
});
const difficult = Object.fromEntries(behaviorIds.map(id => [id, 10]));
const weights = { intercept: 0, similarity: 20, behavior: 60, childPlans: 20 };

describe('research wellbeing candidate', () => {
  it('uses the weaker behavior level instead of rewarding identical difficult answers', () => {
    expect(extractFeatures(profile(), profile()).behavior).toBe(1);
    expect(extractFeatures(profile(difficult), profile(difficult)).behavior).toBe(0);
    expect(extractFeatures(profile(), profile(difficult)).behavior).toBe(0);
    expect(extractFeatures(profile({ ...difficult, 'conflicts-02': 0 }), profile()).behavior).toBeCloseTo(1 / 7);
  });
  it('keeps opposite child plans visible and is symmetric', () => {
    const a = profile(), b = profile({ 'kids-02': 10 });
    expect(extractFeatures(a, a).childPlans).toBe(1);
    expect(extractFeatures(a, b).childPlans).toBe(0);
    expect(extractFeatures(a, b)).toEqual(extractFeatures(b, a));
    expect(extractFeatures(a, a).similarity).toBe(1);
  });
  it.each(['missing', 'skipped', 'invalid', 'nan', 'v18', 'future'] as const)('rejects %s profiles', kind => {
    const a = profile();
    if (kind === 'missing') delete a.responses['regul-08'];
    if (kind === 'skipped') a.responses['kids-02'] = 'skipped';
    if (kind === 'invalid') a.responses['kids-02'] = answerFor(4);
    if (kind === 'nan') a.responses['kids-02'] = answerFor(NaN);
    if (kind === 'v18') a.bankVersion = 18;
    if (kind === 'future') a.bankVersion = 20;
    expect(() => extractFeatures(a, profile())).toThrow();
  });
  it('rejects malformed priorities rather than emitting nonfinite features', () => {
    const a = profile();
    a.priorities = { kids: 'unknown' } as unknown as Profile['priorities'];
    expect(() => extractFeatures(a, profile())).toThrow();
  });
  it('requires explicit parameters and clips the linear prediction', () => {
    expect(predictCandidate({ similarity: 1, behavior: 0, childPlans: 1 }, weights)).toBe(40);
    expect(predictCandidate({ similarity: 1, behavior: 1, childPlans: 1 }, weights)).toBe(100);
    expect(predictCandidate({ similarity: 0, behavior: 0, childPlans: 0 }, { ...weights, intercept: -20 })).toBe(0);
    expect(predictCandidate({ similarity: 1, behavior: 1, childPlans: 1 }, { ...weights, intercept: 20 })).toBe(100);
  });
  it('rejects negative weights and nonfinite or out-of-range inputs', () => {
    const f = { similarity: 1, behavior: 1, childPlans: 1 };
    for (const bad of [-1, NaN, Infinity]) expect(() => predictCandidate(f, { ...weights, behavior: bad })).toThrow();
    expect(() => predictCandidate(f, { ...weights, intercept: Infinity })).toThrow();
    for (const bad of [-0.1, 1.1, NaN]) expect(() => predictCandidate({ ...f, behavior: bad }, weights)).toThrow();
  });
});
