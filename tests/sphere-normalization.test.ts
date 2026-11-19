import { describe, expect, it } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { compare, type SphereWeight } from '../src/scoring/compare';
import type { Profile, Question } from '../src/types';
import { normalizedCompare } from '../research/blind/target-v20/sphere-normalization/normalized';

const equal = () => 1;
const q = (id: string, sphere: string, extra: Partial<Question> = {}): Question => ({
  id, sphere, block: 'relationship', text: id, topic: id, left: '', right: '', optional: false, ...extra,
});
const p = (values: Record<string, number>, priorities?: Profile['priorities']): Profile => ({
  name: '', bankVersion: 24, priorities,
  responses: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, answerFor(OPTION_VALUES[value - 1])])),
});
const qs = [q('k1', 'kids'), q('k2', 'kids'), q('b', 'budget')];
const a = p({ k1: 1, k2: 1, b: 1 });
const b = p({ k1: 1, k2: 1, b: 5 });
const score = (questions = qs, first = a, second = b, weight: SphereWeight = equal) =>
  normalizedCompare(questions, first, second, weight, equal).relationship.percent;

describe('research sphere normalization', () => {
  it('gives equally weighted spheres equal influence despite different item counts', () => {
    expect(compare(qs, a, b, equal, equal).relationship.percent).toBeCloseTo(66.66666667);
    expect(score()).toBeCloseTo(50);
  });
  it('duplicating an entire sphere preserves its influence', () => {
    const expanded = [...qs, q('k3', 'kids'), q('k4', 'kids')];
    expect(score(expanded, p({ k1: 1, k2: 1, k3: 1, k4: 1, b: 1 }), p({ k1: 1, k2: 1, k3: 1, k4: 1, b: 5 }))).toBeCloseTo(50);
  });
  it('preserves the base sphere coefficients', () => {
    expect(score(qs, a, b, sphere => sphere === 'kids' ? 2 : 1)).toBeCloseTo(66.66666667);
  });
  it('keeps all matches at 100 and all opposite answers at zero', () => {
    expect(score(qs, a, a)).toBe(100);
    expect(score(qs, a, p({ k1: 5, k2: 5, b: 5 }))).toBe(0);
  });
  it('counts only compared items, excluding uncertain, missing cross habits, and skipped answers', () => {
    const questions = [...qs, q('u', 'kids', { uncertainOptions: [3] }), q('c', 'kids', { cross: { id: 'habit', level: [0, .25, .5, .75, 1] } }), q('s', 'kids')];
    const first = p({ k1: 1, k2: 1, b: 1, u: 3, c: 5 });
    first.responses.s = 'skipped';
    expect(score(questions, first, p({ k1: 1, k2: 1, b: 5, u: 1, c: 1, s: 1 }))).toBeCloseTo(50);
  });
  it('keeps each person’s priority denominator and takes their geometric mean', () => {
    expect(score(qs, { ...a, priorities: { kids: 'top' } }, { ...b, priorities: { budget: 'top' } })).toBeCloseTo(43.30127019);
  });
  it('is invariant under swapping the two people', () => {
    const first = { ...a, priorities: { kids: 'top' as const } };
    const second = { ...b, priorities: { budget: 'top' as const } };
    expect(score(qs, second, first)).toBeCloseTo(43.30127019);
    expect(score(qs, first, second)).toBeCloseTo(43.30127019);
  });
  it('normalizes friendship independently using only positive-weight spheres', () => {
    const result = normalizedCompare(qs, a, b, equal, sphere => sphere === 'kids' ? 1 : 0);
    expect(result.relationship.percent).toBeCloseTo(50);
    expect(result.friendship.percent).toBe(100);
    expect(normalizedCompare(qs, a, b, equal, equal).friendship.percent).toBeCloseTo(50);
  });
  it('retains the five-step match scale', () => {
    const questions = [q('one', 'kids')];
    for (const [option, expected] of [[1, 100], [2, 75], [3, 50], [4, 25], [5, 0]]) {
      expect(score(questions, p({ one: 1 }), p({ one: option }))).toBeCloseTo(expected);
    }
  });
  it('preserves behavior, format and cross semantics', () => {
    const behavior = q('action', 'kids', { behaviorLevels: [1, .75, .5, .25, 0] });
    expect(score([behavior], p({ action: 1 }), p({ action: 3 }))).toBeCloseTo(70.71067812);
    const formats = q('format', 'kids', { formats: [{ accepted: ['a', 'b'], preferred: 'a' }, { accepted: ['a', 'b'], preferred: 'b' }] });
    expect(score([formats], p({ format: 1 }), p({ format: 2 }))).toBe(75);
    const cross = q('tolerance', 'kids', { cross: { id: 'habit', level: [0, .25, .5, .75, 1] } });
    expect(score([cross], p({ tolerance: 5, habit: 1 }), p({ tolerance: 1, habit: 3 }))).toBeCloseTo(70.71067812);
  });
  it('returns null when no paired scored items exist', () => {
    expect(score(qs, p({}), b)).toBeNull();
  });
});
