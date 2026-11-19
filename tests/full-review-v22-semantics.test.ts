import { describe, expect, it } from 'vitest';
import baseline from '../research/blind/target-v20/full-review-v22/baseline-bank-v21.json';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { BANK_VERSION, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v22';
import { compare } from '../src/scoring/compare';
import type { Profile, Question } from '../src/types';

const behaviorCases = [
  { id: 'space-07', improving: [1, 2, 3, 4, 5], constructive: [3, 4, 5] },
  { id: 'intimacy-03', improving: [5, 4, 3, 2, 1], constructive: [1, 2] },
  { id: 'conflicts-10', improving: [5, 4, 3, 2, 1], constructive: [1, 2, 3] },
  { id: 'relatives-08', improving: [5, 4, 3, 2, 1], constructive: [1, 2, 3] },
];

function question(id: string): Question {
  const q = QUESTIONS.find(item => item.id === id);
  if (!q) throw new Error(`Missing metadata-only review question: ${id}`);
  return q;
}

function result(id: string, aOption: number, bOption: number) {
  const q = question(id);
  const profile = (option: number): Profile => ({
    name: '', bankVersion: BANK_VERSION,
    responses: { [id]: answerFor(OPTION_VALUES[option - 1]) },
  });
  return compare([q], profile(aOption), profile(bOption)).relationship;
}

describe('v22 metadata-only semantics preserve the answered question', () => {
  it.each(['kids-01', ...behaviorCases.map(c => c.id)])('%s preserves native wording and five answer meanings', id => {
    const old = baseline.questions.find(q => q.id === id)!;
    const current = question(id);
    for (const key of ['id', 'block', 'sphere', 'text', 'left', 'right', 'topic', 'optional', 'options'] as const) {
      expect(current[key], `${id}.${key}`).toEqual(old[key]);
    }
  });
});

describe('v22 pregnancy uncertainty is not evidence of agreement', () => {
  it.each([1, 2, 3, 4, 5])('excludes an unknown position paired with option %i, in either direction', other => {
    for (const [a, b] of [[3, other], [other, 3]]) {
      const r = result('kids-01', a, b);
      expect(r.percent).toBeNull();
      expect(r.spheres).toEqual([]);
      expect(r.uncertain?.map(q => q.id)).toEqual(['kids-01']);
      expect(r.superMatches).toEqual([]);
      expect(r.strongMatches).toEqual([]);
    }
  });

  it('retains the ordinary five-answer distance for determined positions', () => {
    expect(result('kids-01', 1, 1).percent).toBe(100);
    expect(result('kids-01', 1, 2).percent).toBe(75);
    expect(result('kids-01', 1, 5).percent).toBe(0);
  });
});

describe.each(behaviorCases)('v22 own-action semantics: $id', ({ id, improving, constructive }) => {
  it('never lowers the percentage or weakest action when either actor improves', () => {
    for (let fixed = 1; fixed <= 5; fixed++) {
      for (let i = 1; i < improving.length; i++) {
        const worse = improving[i - 1], better = improving[i];
        for (const reverse of [false, true]) {
          const before = result(id, reverse ? fixed : worse, reverse ? worse : fixed);
          const after = result(id, reverse ? fixed : better, reverse ? better : fixed);
          expect(after.percent!, `${id}: ${worse} → ${better}; other ${fixed}`).toBeGreaterThanOrEqual(before.percent!);
          expect(after.spheres[0].items[0].match).toBeGreaterThanOrEqual(before.spheres[0].items[0].match);
        }
      }
    }
  });

  it('treats alternative constructive choices as equally workable', () => {
    for (const a of constructive) for (const b of constructive) {
      const r = result(id, a, b);
      expect(r.percent, `${id}: constructive ${a}/${b}`).toBe(100);
      expect(r.spheres[0].items[0].match).toBe(1);
      expect(r.talkZones).toEqual([]);
    }
  });

  it('does not award similarity of actions as a shared conviction', () => {
    for (let option = 1; option <= 5; option++) {
      const r = result(id, option, option);
      expect(r.superMatches).toEqual([]);
      expect(r.strongMatches).toEqual([]);
      expect(r.spheres[0].items[0].kind).toBe('behavior');
    }
  });
});

describe('v22 action examples distinguish pair percentage from the weaker action', () => {
  it('recognizes consent requests and avoids rewarding mutual secret access', () => {
    expect(result('space-07', 1, 1).percent).toBe(0);
    expect(result('space-07', 1, 5).percent).toBe(0);
    const r = result('space-07', 2, 3);
    expect(r.percent).toBeCloseTo(50, 10);
    expect(r.spheres[0].items[0].match).toBe(.25);
  });

  it('does not make matching silence better than a direct statement of desire', () => {
    expect(result('intimacy-03', 5, 5).percent).toBeCloseTo(25, 10);
    expect(result('intimacy-03', 1, 5).percent).toBeCloseTo(50, 10);
    expect(result('intimacy-03', 1, 5).spheres[0].items[0].match).toBe(.25);
  });

  it('does not punish a direct request about the cup relative to reciprocal hints', () => {
    expect(result('conflicts-10', 4, 4).percent).toBeCloseTo(75, 10);
    const r = result('conflicts-10', 1, 4);
    expect(r.percent).toBeCloseTo(Math.sqrt(.75) * 100, 10);
    expect(r.spheres[0].items[0].match).toBe(.75);
  });

  it('does not punish independent friendships relative to reciprocal restrictions', () => {
    expect(result('relatives-08', 4, 4).percent).toBeCloseTo(50, 10);
    const r = result('relatives-08', 3, 4);
    expect(r.percent).toBeCloseTo(Math.sqrt(.5) * 100, 10);
    expect(r.spheres[0].items[0].match).toBe(.5);
    expect(result('relatives-08', 5, 5).percent).toBe(0);
  });
});
