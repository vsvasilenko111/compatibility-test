import { describe, expect, it } from 'vitest';
import * as v33 from '../research/blind/target-v20/legacy-questions-v33';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v34';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

const added = ['budget-01-r34', 'budget-08-funding-r34'];
const removed = ['budget-01', 'budget-08-r22'];
const question = (id: string) => QUESTIONS.find(q => q.id === id)!;

describe('historical withdrawn v34 ownership and funding contexts', () => {
  it('replaces exactly the two budget questions in place and preserves all other current facts', () => {
    expect(BANK_VERSION).toBe(34);
    expect(QUESTIONS).toHaveLength(120);
    expect(CURRENT_IDS).toEqual(QUESTIONS.map(q => q.id));
    expect(new Set(CURRENT_IDS).size).toBe(120);
    expect(CURRENT_IDS.filter(id => !v33.CURRENT_IDS.includes(id))).toEqual(added);
    expect(v33.CURRENT_IDS.filter(id => !CURRENT_IDS.includes(id))).toEqual(removed);
    expect(CURRENT_IDS).toEqual(v33.CURRENT_IDS.map(id => removed.includes(id) ? added[removed.indexOf(id)] : id));
    expect(QUESTIONS.filter(q => !added.includes(q.id))).toEqual(v33.QUESTIONS.filter(q => !removed.includes(q.id)));
    expect(MANIFEST[33]).toEqual(v33.CURRENT_IDS);
    expect(FIRM[33]).toEqual(v33.CURRENT_FIRM);
    expect(MANIFEST[34]).toEqual(CURRENT_IDS);
  });

  it('decodes the old release without reinterpreting either retired answer and asks exactly two new contexts', () => {
    const old: Profile = { name: 'Аня', bankVersion: 33,
      responses: Object.fromEntries(v33.CURRENT_IDS.map((id, i) => [id, answerFor(OPTION_VALUES[i % 5])])) };
    const restored = decode(encode(old, v33.CURRENT_IDS, v33.CURRENT_FIRM), MANIFEST, FIRM);
    expect(restored).toEqual(old);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(added);
    for (const id of removed) expect(restored.responses[id]).toEqual(old.responses[id]);
    for (const id of added) expect(restored.responses).not.toHaveProperty(id);
    const filled: Profile = { ...restored, bankVersion: BANK_VERSION,
      responses: { ...restored.responses, 'budget-01-r34': answerFor(0), 'budget-08-funding-r34': answerFor(10) } };
    const current = decode(encode(filled, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(Object.keys(current.responses)).toHaveLength(120);
    expect(unansweredIds(CURRENT_IDS, current.responses)).toEqual([]);
    for (const id of removed) expect(current.responses).not.toHaveProperty(id);
    for (const id of CURRENT_IDS) expect(current.responses[id]).toEqual(filled.responses[id]);
  });

  it('allows all income to belong to both even when only one partner earns it', () => {
    const ownership = question(added[0]);
    expect(ownership).toBeDefined();
    expect(ownership.text).toMatch(/общ|принадлеж|распоряж/i);
    expect(ownership.text).toMatch(/независимо|один|зарабатывает/i);
    expect(ownership.options).toHaveLength(5);
    expect(ownership.options![0]).toMatch(/все|всё|полностью/i);
    expect(ownership.options![0]).toMatch(/общ/i);
  });

  it('covers personal spending in the funding question without assuming two equal incomes', () => {
    const funding = question(added[1]);
    expect(funding).toBeDefined();
    expect(funding.text).toMatch(/расход/i);
    expect(funding.text).toMatch(/личн/i);
    expect(funding.text).not.toMatch(/одинаков\w* доход|равн\w* доход|оба работа|оба зарабатыва/i);
    expect(funding.options).toHaveLength(5);
    expect(funding.options![0]).toMatch(/мужчин/i);
    expect(funding.options![0]).toMatch(/все|всё|полностью/i);
    expect(funding.options![0]).toMatch(/женщин/i);
    expect(funding.options![0]).toMatch(/не (?:обяз|треб)/i);
    expect(funding.options![4]).toMatch(/женщин/i);
    expect(funding.options![4]).toMatch(/все|всё|полностью/i);
    expect(funding.options![4]).toMatch(/мужчин/i);
    expect(funding.options![4]).toMatch(/не (?:обяз|треб)/i);
    expect(funding.options![1]).toMatch(/мужчин/i);
    expect(funding.options![2]).toMatch(/пополам|половин|поровну|50/i);
    expect(funding.options![3]).toMatch(/женщин/i);
  });

  it('stores ownership and funding independently for either single-earner arrangement', () => {
    expect(question(added[0])).toBeDefined();
    expect(question(added[1])).toBeDefined();
    for (const funding of [0, 10]) {
      const p: Profile = { name: 'Аня', bankVersion: BANK_VERSION,
        responses: { 'budget-01-r34': answerFor(0), 'budget-08-funding-r34': answerFor(funding) } };
      const restored = decode(encode(p, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
      expect(restored.responses['budget-01-r34']).toEqual(answerFor(0));
      expect(restored.responses['budget-08-funding-r34']).toEqual(answerFor(funding));
    }
  });
});
