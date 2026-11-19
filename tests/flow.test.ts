import { describe, it, expect } from 'vitest';
import { firstUnanswered, unansweredIds, resumeFor } from '../src/ui/flow';
import type { Progress } from '../src/storage';

const IDS = ['a', 'b', 'c', 'd'];
const answer = { value: 5, lo: 3, hi: 7, importance: 2 } as const;
const saved: Progress = { name: 'Аня', index: 1, inviterCode: 'old', responses: { a: answer } };

describe('firstUnanswered', () => {
  it('дозаполнение включает старые пропуски и отсутствующие ответы', () => {
    expect(unansweredIds(IDS, { a: answer, b: 'skipped', removed: answer })).toEqual(['b', 'c', 'd']);
    expect(unansweredIds(IDS, { a: answer, b: answer, c: answer, d: answer })).toEqual([]);
  });
  it('первый вопрос без ответа; старый пропуск требует ответа', () => {
    expect(firstUnanswered(IDS, {})).toBe(0);
    expect(firstUnanswered(IDS, { a: answer, b: 'skipped' })).toBe(1);
  });
  it('все отвечены → длина списка', () => {
    expect(firstUnanswered(IDS, { a: answer, b: answer, c: answer, d: answer })).toBe(4);
    expect(firstUnanswered(IDS, { a: answer, b: answer, c: answer, d: 'skipped' })).toBe(3);
  });
  it('новый вопрос в середине банка находится, ответы на удалённые вопросы игнорируются', () => {
    expect(firstUnanswered(['a', 'new', 'b'], { a: answer, b: answer, removed: answer })).toBe(1);
  });
});

describe('resumeFor', () => {
  it('нет сохранённого → null', () => {
    expect(resumeFor(null, 'x', IDS)).toBeNull();
  });
  it('другой пригласивший: те же ответы, новый inviterCode', () => {
    expect(resumeFor(saved, 'new', IDS)).toEqual({ ...saved, inviterCode: 'new' });
    expect(resumeFor(saved, null, IDS)).toEqual({ ...saved, inviterCode: null });
  });
  it('продолжает с первого вопроса без ответа, а не с сохранённого индекса', () => {
    expect(resumeFor({ ...saved, index: 3 }, null, IDS)?.index).toBe(1);
    expect(resumeFor({ ...saved, index: -4 }, null, IDS)?.index).toBe(1);
  });
  it('после смены банка новые вопросы не теряются', () => {
    const p: Progress = { ...saved, index: 2, responses: { a: answer, b: answer } };
    expect(resumeFor(p, null, ['a', 'new', 'b'])?.index).toBe(1);
  });
});
