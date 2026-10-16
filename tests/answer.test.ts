import { describe, it, expect } from 'vitest';
import { answerFor, importanceFor } from '../src/answer';
import { compare } from '../src/scoring/compare';
import type { Profile, Question } from '../src/types';

describe('answer-logic', () => {
  it('важность выводится из ответа: края — критично, 2–3 и 7–8 — очень, середина — немного', () => {
    expect([0, 1, 9, 10].map(importanceFor)).toEqual([3, 3, 3, 3]);
    expect([2, 3, 7, 8].map(importanceFor)).toEqual([2, 2, 2, 2]);
    expect([4, 5, 6].map(importanceFor)).toEqual([1, 1, 1]);
  });

  it('ответ — точка: совпадение считается по разнице ответов', () => {
    expect(answerFor(5)).toEqual({ value: 5, lo: 5, hi: 5, importance: 1 });
    expect(answerFor(10)).toEqual({ value: 10, lo: 10, hi: 10, importance: 3 });
  });
});

describe('важность из ответа → результат', () => {
  const qs: Question[] = [{ id: 'q', block: 'relationship', sphere: 'kids', text: 't', left: 'l', right: 'r', topic: 'дети', optional: false, firm: true }];
  const p = (v: number, firm = false): Profile => ({ name: '', bankVersion: 1, responses: { q: firm ? { ...answerFor(v), firm } : answerFor(v) } });

  it('10 и 4 без отметки «не обсуждается» → не флаг, а тема для разговора', () => {
    const r = compare(qs, p(10), p(4)).relationship;
    expect(r.redFlags).toEqual([]);
    expect(r.talkZones.map((x) => x.id)).toEqual(['q']);
  });
  it('10 с отметкой и 6 (разница 4) → красный флаг; 10 с отметкой и 7 → нет', () => {
    expect(compare(qs, p(10, true), p(6)).relationship.redFlags.map((x) => x.id)).toEqual(['q']);
    expect(compare(qs, p(10, true), p(7)).relationship.redFlags).toEqual([]);
  });
  it('10 и 7 → не флаг, а тема для разговора', () => {
    const r = compare(qs, p(10), p(7)).relationship;
    expect(r.redFlags).toEqual([]);
    expect(r.talkZones.map((x) => x.id)).toEqual(['q']);
  });
  it('9 и 9 → супер-совпадение', () => {
    expect(compare(qs, p(9), p(9)).relationship.superMatches.map((x) => x.id)).toEqual(['q']);
  });
});

describe('процент совместимости по одному вопросу', () => {
  const qs: Question[] = [{ id: 'q', block: 'friendship', sphere: 'humor', text: 't', left: 'l', right: 'r', topic: 'юмор', optional: false }];
  const p = (v: number): Profile => ({ name: '', bankVersion: 1, responses: { q: answerFor(v) } });

  // По одну сторону от середины разница вдвое мягче; 5 — середина, смягчения нет.
  it.each([[10, 100], [9, 91.67], [8, 83.33], [7, 75], [6, 66.67], [5, 16.67], [4, 0]])('10 и %i → %f%%', (v, pct) => {
    expect(compare(qs, p(10), p(v)).relationship.percent).toBeCloseTo(pct, 1);
  });
  it('10 и 6 — тема для разговора: «стоит обсудить» считается по полной разнице', () => {
    expect(compare(qs, p(10), p(6)).relationship.talkZones.map((i) => i.id)).toEqual(['q']);
  });
  it('8 и 9 — не тема для разговора (разница меньше 3)', () => {
    expect(compare(qs, p(8), p(9)).relationship.talkZones).toEqual([]);
  });
});
