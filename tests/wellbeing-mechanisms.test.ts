import { describe, it, expect } from 'vitest';
import { QUESTIONS, BANK_VERSION } from '../research/blind/target-v20/legacy-questions';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile } from '../src/types';
import { extractFeaturesV2, predictCandidateV2 } from '../research/blind/target-v20/candidate-v2';

const weights = { similarity: 20, behavior: 60, childPlans: 20 };
const ids = ['conflicts-02', 'conflicts-03', 'regul-08', 'reflect-01', 'reflect-02', 'attach-03', 'reflect-03'];
const profile = (overrides: Record<string, number> = {}): Profile => ({ name: '', bankVersion: BANK_VERSION,
  responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(overrides[q.id] ?? (q.id === 'honesty-03' ? 7 : 0))])),
});
const score = (a: Profile, b: Profile) => predictCandidateV2(extractFeaturesV2(a, b), weights);

describe('research-v2 mechanism regressions', () => {
  it('does not reward a second partner for adopting the same difficult behavior', () => {
    const bad = profile(Object.fromEntries(ids.map(id => [id, 10])));
    const good = profile();
    expect(score(bad, bad)).toBeLessThanOrEqual(score(bad, good));
    expect(score(bad, good)).toBeLessThan(score(good, good));
  });
  it('does not reward agreement to disclose a secret', () => {
    const discreet = profile({ 'honesty-03': 7 }), disclosing = profile({ 'honesty-03': 0 });
    expect(score(disclosing, disclosing)).toBeLessThanOrEqual(score(disclosing, discreet));
    expect(score(discreet, discreet)).toBeGreaterThan(score(disclosing, disclosing));
  });
  it('does not favor quiet restraint over calm firm speech', () => {
    expect(score(profile({ 'conflicts-02': 0 }), profile())).toBe(score(profile({ 'conflicts-02': 3 }), profile()));
  });
  it('keeps behavior and child answers out of preference similarity', () => {
    const a = profile(), b = profile(Object.fromEntries(ids.map(id => [id, 10])));
    expect(extractFeaturesV2(a, a).similarity).toBe(extractFeaturesV2(a, b).similarity);
    expect(extractFeaturesV2(a, profile({ 'kids-02': 10 })).similarity).toBe(extractFeaturesV2(a, a).similarity);
    expect(score(a, profile({ 'kids-02': 10 }))).toBeLessThan(score(a, a));
  });
  it('preserves direction across all option pairs in each declared behavior question', () => {
    for (const id of [...ids, 'honesty-03']) {
      const values = id === 'honesty-03' ? [10, 7, 5, 3, 0] : [...OPTION_VALUES];
      for (const other of OPTION_VALUES) {
        const scores = values.map(value => score(profile({ [id]: value }), profile({ [id]: other })));
        for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1] + 1e-9);
      }
    }
  });
  it('does not reward convergence to other shared-risk answers already identified by the bank', () => {
    for (const id of ['intimacy-03', 'conflicts-10', 'relatives-04', 'relatives-08']) {
      const bad = profile({ [id]: 10 });
      expect(score(bad, bad)).toBeLessThanOrEqual(score(bad, profile()) + 1e-9);
    }
    expect(score(profile({ 'relatives-08': 0 }), profile())).toBe(score(profile({ 'relatives-08': 5 }), profile()));
  });
  it('is symmetric, scale-invariant, finite, and bounded without clipping', () => {
    const a = profile(), b = profile({ 'kids-02': 10, 'conflicts-02': 10 });
    expect(score(a, b)).toBe(score(b, a));
    const f = { similarity: 1, behavior: 0, childPlans: 0 };
    expect(predictCandidateV2(f, weights)).toBe(20);
    expect(predictCandidateV2(f, { similarity: 200, behavior: 600, childPlans: 200 })).toBe(20);
    expect(predictCandidateV2(f, { similarity: 1e308, behavior: 1e308, childPlans: 1e308 })).toBeCloseTo(100 / 3);
    for (const bad of [-1, NaN, Infinity]) expect(() => predictCandidateV2(f, { ...weights, behavior: bad })).toThrow();
    expect(() => predictCandidateV2(f, { similarity: 0, behavior: 0, childPlans: 0 })).toThrow();
    expect(() => predictCandidateV2({ ...f, similarity: 2 }, weights)).toThrow();
  });
  it('requires complete valid profiles just like research-v1', () => {
    const a = profile(); delete a.responses['reflect-02'];
    expect(() => extractFeaturesV2(a, profile())).toThrow();
    const old = profile(); old.bankVersion = 18;
    expect(() => extractFeaturesV2(old, profile())).toThrow();
  });
});
