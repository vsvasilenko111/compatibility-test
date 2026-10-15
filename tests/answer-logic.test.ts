import { describe, it, expect } from 'vitest';
import { answerFor, importanceFor } from '../src/ui/answer-logic';
import { compare } from '../src/scoring/compare';
import type { Profile, Question } from '../src/types';

describe('answer-logic', () => {
  it('важность выводится из ответа: края — критично, 2–3 и 7–8 — очень, середина — немного', () => {
    expect([0, 1, 9, 10].map(importanceFor)).toEqual([3, 3, 3, 3]);
    expect([2, 3, 7, 8].map(importanceFor)).toEqual([2, 2, 2, 2]);
    expect([4, 5, 6].map(importanceFor)).toEqual([1, 1, 1]);
  });

  it('приемлемый диапазон — ±2 от ответа с обрезкой до 0..10', () => {
    expect(answerFor(5)).toEqual({ value: 5, lo: 3, hi: 7, importance: 1 });
    expect(answerFor(1)).toEqual({ value: 1, lo: 0, hi: 3, importance: 3 });
    expect(answerFor(10)).toEqual({ value: 10, lo: 8, hi: 10, importance: 3 });
    expect(answerFor(7)).toEqual({ value: 7, lo: 5, hi: 9, importance: 2 });
  });
});


describe('важность из ответа → результат', () => {
  const qs: Question[] = [{ id: 'q', block: 'relationship', sphere: 'kids', text: 't', left: 'l', right: 'r', topic: 'дети', optional: false }];
  const p = (v: number): Profile => ({ name: '', bankVersion: 1, responses: { q: answerFor(v) } });

  it('10 и 5 (5 делений от края) → красный флаг', () => {
    expect(compare(qs, p(10), p(5)).relationship.redFlags.map((x) => x.id)).toEqual(['q']);
  });
  it('10 и 6 → не флаг, а тема для разговора', () => {
    const r = compare(qs, p(10), p(6)).relationship;
    expect(r.redFlags).toEqual([]);
    expect(r.talkZones.map((x) => x.id)).toEqual(['q']);
  });
  it('9 и 9 → супер-совпадение', () => {
    expect(compare(qs, p(9), p(9)).relationship.superMatches.map((x) => x.id)).toEqual(['q']);
  });
});
