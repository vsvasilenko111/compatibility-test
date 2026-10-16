import { describe, it, expect } from 'vitest';
import { QUESTIONS } from '../src/questions';
import { relationshipWeight } from '../src/questions/spheres';
import { answerFor } from '../src/answer';
import { compare } from '../src/scoring/compare';
import { maturity } from '../src/scoring/maturity';
import type { Profile, Response } from '../src/types';

const MAT = QUESTIONS.filter((q) => q.block === 'maturity').map((q) => q.id);
const BASE = QUESTIONS.filter((q) => q.block !== 'maturity').map((q) => q.id);

/** Профиль: все вопросы блока — `fill`, кроме перечисленных; null — пропуск. */
function person(over: Record<string, number | null> = {}, fill = 2, withBase = true): Profile {
  const responses: Record<string, Response> = {};
  if (withBase) BASE.forEach((id, i) => { responses[id] = answerFor(i % 11); });
  for (const id of MAT) {
    const v = id in over ? over[id] : fill;
    responses[id] = v === null ? 'skipped' : answerFor(v);
  }
  return { name: '', bankVersion: 4, responses };
}
const keys = (a: Profile, b: Profile) => maturity(QUESTIONS, a, b)!.talks.map((t) => t.key);

describe('блок «Эмоциональная зрелость»', () => {
  it('на проценты не влияет', () => {
    const calm = person({}, 1), stormy = person({}, 9);
    const r1 = compare(QUESTIONS, calm, calm, relationshipWeight);
    const r2 = compare(QUESTIONS, calm, stormy, relationshipWeight);
    expect(r2.relationship.percent).toBe(r1.relationship.percent);
    expect(r2.friendship.percent).toBe(r1.friendship.percent);
    expect(r2.relationship.spheres.map((s) => s.sphere)).not.toContain('attachment');
  });

  it('ссылка прошлой версии без блока — ничего не выводим', () => {
    const old: Profile = { name: '', bankVersion: 3, responses: Object.fromEntries(BASE.map((id) => [id, answerFor(5)])) };
    expect(maturity(QUESTIONS, old, person())).toBeNull();
    expect(compare(QUESTIONS, old, person()).maturity).toBeNull();
  });

  it('у обоих устойчиво — опоры, тем для разговора нет', () => {
    const r = maturity(QUESTIONS, person({}, 1), person({}, 2))!;
    expect(r.talks).toEqual([]);
    expect(r.softTopics).toEqual([]);
    expect(r.strengths.length).toBeGreaterThan(0);
  });

  it('тревога у одного и потребность в пространстве у другого — «близость и пространство» первой', () => {
    expect(keys(person({ 'attach-01': 9 }), person({ 'attach-02': 8, 'attach-03': 7 }))[0]).toBe('closeness');
    // в обратную сторону — то же
    expect(keys(person({ 'attach-02': 8, 'attach-03': 7 }), person({ 'attach-01': 9 }))[0]).toBe('closeness');
  });

  it('один догоняет в споре, другой уходит — «если спор накаляется»', () => {
    expect(keys(person({ 'regul-03': 8 }), person({ 'regul-04': 9 }))).toContain('heated');
    expect(keys(person({ 'regul-03': 8 }), person({ 'regul-04': 5 }))).not.toContain('heated');
  });

  it('внезапная тишина: чувствительность к отдалению у одного и привычка уходить в себя у другого', () => {
    expect(keys(person({ 'trauma-06': 9 }), person({ 'regul-04': 8 }))).toContain('silence');
  });

  it('вопросы о прошлом не учитываются, если человек пропустил больше половины', () => {
    const skipped = { 'trauma-01': null, 'trauma-02': null, 'trauma-03': null, 'trauma-04': null, 'trauma-06': 9 };
    expect(keys(person(skipped), person({ 'regul-04': 8 }))).not.toContain('silence');
  });

  it('пропуск сам по себе не даёт тем', () => {
    const allSkipped = Object.fromEntries(MAT.filter((id) => id.startsWith('trauma')).map((id) => [id, null]));
    const r = maturity(QUESTIONS, person(allSkipped), person())!;
    expect(r.talks).toEqual([]);
    expect(r.softTopics).toEqual([]);
  });

  it('большая разница в переживании стресса и в отношении к психологу — темы для разговора', () => {
    const k = keys(person({ 'regul-05': 1, 'reflect-04': 0 }), person({ 'regul-05': 8, 'reflect-04': 9 }));
    expect(k).toEqual(expect.arrayContaining(['stress', 'help']));
  });

  it('все темы, самые важные первыми', () => {
    const a = person({ 'attach-01': 9, 'regul-03': 9, 'regul-05': 0, 'reflect-04': 0 });
    const b = person({ 'attach-02': 9, 'attach-03': 9, 'regul-04': 9, 'regul-05': 9, 'reflect-04': 10 });
    expect(keys(a, b)).toEqual(['closeness', 'heated', 'stress', 'help']);
  });

  it('трудно хотя бы одному, но без опасного сочетания — мягкая тема без текста', () => {
    const r = maturity(QUESTIONS, person({ 'regul-02': 9 }), person())!;
    expect(r.talks).toEqual([]);
    expect(r.softTopics).toEqual(['время на восстановление']);
  });
});
