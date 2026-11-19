import { describe, it, expect } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { compare } from '../research/blind/target-v20/legacy-compare';
import type { Profile, Question } from '../src/types';
import { historicalFit, historicalPercent } from '../research/blind/target-v20/historical-fit';

const q: Question = { id: 'q', text: '', topic: '', block: 'relationship', sphere: 'kids', left: '', right: '', optional: false };
const p = (values: Record<string, number>): Profile => ({ name: '', bankVersion: 19,
  responses: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, answerFor(value)])),
});

describe('historical fit rules, isolated from other scoring changes', () => {
  it('reproduces the archived linear and same-side examples', () => {
    expect(historicalFit('linear', answerFor(10), answerFor(7))).toBe(.5);
    expect(historicalFit('same-side', answerFor(10), answerFor(7))).toBe(.75);
    expect(historicalFit('same-side', answerFor(7), answerFor(4))).toBe(.5);
    expect(historicalFit('same-side', answerFor(10), answerFor(4))).toBe(0);
    expect(historicalFit('linear', answerFor(0), answerFor(10))).toBe(0);
    for (const value of OPTION_VALUES) {
      expect(historicalFit('linear', answerFor(value), answerFor(value))).toBe(1);
      expect(historicalFit('same-side', answerFor(value), answerFor(value))).toBe(1);
    }
  });
  it('isolates the identical-answer bonus from the off-diagonal curve', () => {
    expect(historicalFit('table-equal', answerFor(5), answerFor(5))).toBe(1);
    expect(historicalFit('table-equal', answerFor(0), answerFor(3))).toBe(.75);
    expect(historicalFit('linear-old-diagonal', answerFor(5), answerFor(5))).toBe(.9);
    expect(historicalFit('linear-old-diagonal', answerFor(0), answerFor(3))).toBe(.5);
  });
  it('keeps current shared-risk and child split protections under old curves', () => {
    expect(historicalPercent([{ ...q, split: 2 }], p({ q: 3 }), p({ q: 5 }), 'same-side', 'current')).toBe(35);
    expect(historicalPercent([{ ...q, sharedRisk: 4 }], p({ q: 10 }), p({ q: 10 }), 'linear', 'current')).toBe(35);
  });
  it('reproduces current cross-direction and independent priorities', () => {
    const questions: Question[] = [q, { ...q, id: 'habit', scored: false },
      { ...q, id: 'attitude', sphere: 'habits', cross: { id: 'habit', level: [0, 0, .5, .75, 1] } }];
    const a = p({ q: 3, habit: 10, attitude: 10 }), b = p({ q: 7, habit: 0, attitude: 0 });
    a.priorities = { kids: 'top' };
    b.priorities = { habits: 'top' };
    expect(historicalPercent(questions, a, b, 'table', 'current')).toBeCloseTo(compare(questions, a, b).relationship.percent!, 12);
  });
  it('restores 50/10/1 importance as a separate controlled factor', () => {
    const questions = [q, { ...q, id: 'r' }];
    const a = p({ q: 0, r: 5 }), b = p({ q: 10, r: 5 });
    expect(historicalPercent(questions, a, b, 'linear', 'current')).toBe(50);
    expect(historicalPercent(questions, a, b, 'linear', 'old-importance')).toBeCloseTo(100 / 51);
  });
  it('excludes maturity, unscored questions and missing cross evidence', () => {
    const questions: Question[] = [{ ...q, block: 'maturity' }, { ...q, id: 's', scored: false },
      { ...q, id: 'x', cross: { id: 'missing', level: [0,0,0,0,1] } }];
    expect(historicalPercent(questions, p({ q: 0, s: 0, x: 0 }), p({ q: 0, s: 0, x: 0 }), 'table', 'current')).toBeNull();
  });
});
