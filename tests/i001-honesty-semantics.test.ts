import { describe, expect, it } from 'vitest';
import candidate from '../research/blind/target-v20/iterations/I001-honesty/candidate-bank.json';
import base from '../research/blind/target-v20/v26-rollback/candidate-bank-v26.json';
import { QUESTIONS, BANK_VERSION, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v26';
import { compare } from '../src/scoring/compare';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import type { Profile, Question } from '../src/types';

const question = candidate.questions.find(q => q.id === 'honesty-frequency-01') as Question;
const profile = (option: number): Profile => ({ name: 'Участник', bankVersion: 26, responses: { [question.id]: answerFor(OPTION_VALUES[option - 1]) } });
const score = (a: number, b: number) => compare([question], profile(a), profile(b)).relationship.percent;

describe('I001 isolated honesty pilot', () => {
  it('keeps the frozen v26 reference and all existing meanings intact', () => {
    expect(BANK_VERSION).toBe(26);
    expect(QUESTIONS).toEqual(base.questions);
    expect(candidate.questions).toHaveLength(126);
    expect(candidate.questions.filter(q => q.id !== question.id)).toEqual(base.questions);
    expect(MANIFEST[26]).not.toContain(question.id);
  });
  it('grades frequent lying as an action rather than rewarding equal answers', () => {
    expect(score(1, 1)).toBe(100);
    expect(score(5, 5)).toBe(0);
    expect(score(4, 4)).toBe(25);
    expect(score(1, 5)).toBe(0);
  });
  it('preserves the existing directional quality aggregation', () => {
    expect(score(1, 2)).toBeCloseTo(86.60254038);
    expect(score(2, 1)).toBeCloseTo(86.60254038);
  });
  it('does not reward increasing reported lying for either person', () => {
    for (let other = 1; other <= 5; other++) {
      let previous = Infinity;
      for (let option = 1; option <= 5; option++) {
        const now = score(option, other)!;
        expect(now).toBeLessThanOrEqual(previous);
        previous = now;
      }
    }
  });
  it('preserves existing links and gives no score for a missing new answer', () => {
    const old: Profile = { name: 'Аня', bankVersion: 26, responses: Object.fromEntries(MANIFEST[26].map((id, i) => [id, answerFor(OPTION_VALUES[i % 5])])) };
    expect(decode(encode(old, MANIFEST[26], FIRM[26] ?? []), MANIFEST, FIRM)).toEqual(old);
    expect(compare([question], old, old).relationship.percent).toBeNull();
    expect(compare(candidate.questions as Question[], old, old)).toEqual(compare(QUESTIONS, old, old));
  });
});
