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
  // Вопросы других блоков, которые участвуют в сочетаниях (conflicts-02, space-06).
  for (const [id, v] of Object.entries(over)) if (!MAT.includes(id)) responses[id] = v === null ? 'skipped' : answerFor(v);
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
    expect(keys(person({ 'attach-01': 9 }), person({ 'attach-03': 10 }))[0]).toBe('closeness');
    // в обратную сторону — то же
    expect(keys(person({ 'attach-03': 10 }), person({ 'attach-01': 9 }))[0]).toBe('closeness');
  });

  it('внезапная тишина: чувствительность к отдалению у одного и частая нужда побыть одному у другого', () => {
    expect(keys(person({ 'trauma-06': 9 }), person({ 'space-06': 9 }))).toContain('silence');
    // привычка не грузить партнёра (attach-03) — не то же, что нужда в тишине
    expect(keys(person({ 'trauma-06': 9 }), person({ 'attach-03': 8, 'space-06': 0 }))).not.toContain('silence');
  });

  it('при «Когда один замолкает» тишина и тяжёлые периоды не повторяются, а разное время для себя — только без тишины', () => {
    const k = keys(person({ 'attach-01': 9, 'trauma-06': 9, 'attach-03': 0, 'space-06': 0 }), person({ 'attach-03': 10, 'space-06': 10 }));
    expect(k).toContain('closeness');
    expect(k).not.toContain('silence');
    expect(k).not.toContain('stress');
    expect(k).toContain('dosage');
    expect(keys(person({ 'trauma-06': 9, 'space-06': 0 }), person({ 'space-06': 10 }))).not.toContain('dosage');
  });

  it('«Когда один замолкает» — только при крайнем «справлюсь сам(а)»', () => {
    expect(keys(person({ 'attach-01': 9 }), person({ 'attach-03': 7.5 }))).not.toContain('closeness');
  });

  it('когда задели больное: у одного болезненные темы, другой в споре отвечает громко', () => {
    expect(keys(person({ 'trauma-05': 9 }), person({ 'conflicts-02': 9 }))).toContain('escalation');
    expect(keys(person({ 'trauma-05': 9, 'conflicts-02': 0 }), person({ 'conflicts-02': 3 }))).not.toContain('escalation');
  });

  it('вопросы о прошлом не учитываются, если человек пропустил больше половины', () => {
    const skipped = { 'trauma-05': null, 'trauma-06': null };
    expect(keys(person(skipped), person({ 'space-06': 9 }))).not.toContain('silence');
  });

  it('пропуск сам по себе не даёт тем', () => {
    const allSkipped = Object.fromEntries(MAT.filter((id) => id.startsWith('trauma')).map((id) => [id, null]));
    const r = maturity(QUESTIONS, person(allSkipped), person())!;
    expect(r.talks).toEqual([]);
    expect(r.softTopics).toEqual([]);
  });

  it('большая разница в переживании стресса и в отношении к психологу — темы для разговора', () => {
    const k = keys(person({ 'attach-03': 1, 'reflect-04': 0 }), person({ 'attach-03': 8, 'reflect-04': 9 }));
    expect(k).toEqual(expect.arrayContaining(['stress', 'help']));
  });

  it('все темы, самые важные первыми', () => {
    const a = person({ 'attach-01': 9, 'attach-03': 0, 'reflect-04': 0, 'space-06': 5 });
    const b = person({ 'attach-03': 10, 'reflect-04': 10, 'space-06': 5 });
    expect(keys(a, b)).toEqual(['closeness', 'help']);
    expect(keys(person({ 'trauma-05': 9, 'attach-03': 0, 'reflect-04': 0 }), person({ 'conflicts-02': 10, 'attach-03': 9, 'reflect-04': 10 })))
      .toEqual(['escalation', 'stress', 'help']);
  });

  it('трудно хотя бы одному, но без опасного сочетания — мягкая тема без текста', () => {
    const r = maturity(QUESTIONS, person({ 'regul-08': 9 }), person())!;
    expect(r.talks).toEqual([]);
    expect(r.softTopics).toEqual(['признать, что перегнули']);
  });
});

describe('громкие споры', () => {
  it('оба отвечают громко или криком (conflicts-02) — тема «Громкие споры»; один — нет', () => {
    expect(keys(person({ 'conflicts-02': 7 }), person({ 'conflicts-02': 10 }))).toContain('loud');
    expect(keys(person({ 'conflicts-02': 10 }), person({ 'conflicts-02': 3 }))).not.toContain('loud');
  });
});
