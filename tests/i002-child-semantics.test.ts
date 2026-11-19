import { describe, expect, it } from 'vitest';
import bank from '../research/blind/target-v20/iterations/I002-child-uncertainty/candidate-bank.json';
import base from '../research/blind/target-v20/v26-rollback/candidate-bank-v26.json';
import { QUESTIONS, BANK_VERSION } from '../research/blind/target-v20/legacy-questions-v26';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { compare } from '../src/scoring/compare';
import type { Profile, Question } from '../src/types';
const q = bank.questions.find(x => x.id === 'kids-count-uncertainty-01') as Question;
const p = (option: number): Profile => ({ name: '', bankVersion: 26, responses: { [q.id]: answerFor(OPTION_VALUES[option - 1]) } });
describe('I002 explicit child-count uncertainty', () => {
  it('only replaces one research question; the v26 reference and remaining 124 meanings stay intact', () => {
    expect(BANK_VERSION).toBe(26);
    expect(QUESTIONS).toEqual(base.questions);
    expect(bank.questions).toHaveLength(125);
    expect(bank.questions.filter(x => x.id !== q.id)).toEqual(base.questions.filter(x => x.id !== 'kids-02'));
  });
  it('does not turn uncertainty into agreement, disagreement or a neutral number', () => {
    for (let option = 1; option <= 5; option++) {
      const result = compare([q], p(2), p(option));
      expect(result.relationship.percent).toBeNull();
      expect(result.relationship.uncertain?.map(x => x.id)).toEqual([q.id]);
      expect(result.relationship.talkZones).toEqual([]);
    }
  });
  it('preserves one-vs-two proximity and no-children-vs-three incompatibility', () => {
    expect(compare([q], p(3), p(4)).relationship.percent).toBe(75);
    expect(compare([q], p(1), p(5)).relationship.percent).toBe(0);
    expect(compare([q], p(1), p(1)).relationship.percent).toBe(100);
  });
  it('does not reinterpret the orphan old child-count answer as the new meaning', () => {
    const old: Profile = { name: '', bankVersion: 26, responses: { 'kids-02': answerFor(7) } };
    expect(compare([q], old, old).relationship.percent).toBeNull();
  });
});
