// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { hasOpened, openToken } from '../src/consent';
import { parseHash, resultHash } from '../src/router';
import { divergences } from '../src/ui/answers-view';
import { resultScreen } from '../src/ui/screens/result';
import { compare } from '../src/scoring/compare';
import { answerFor } from '../src/answer';
import type { Profile, Question } from '../src/types';

const qs: Question[] = [
  { id: 'k1', block: 'relationship', sphere: 'kids', text: 'Сколько детей', left: 'Один', right: 'Трое', topic: 'дети', optional: false },
  { id: 'b1', block: 'relationship', sphere: 'budget', text: 'Подушка', left: 'Полгода', right: 'Потом', topic: 'подушка', optional: false },
  { id: 'h1', block: 'friendship', sphere: 'humor', text: 'Шутки', left: 'Смешно', right: 'Нет', topic: 'шутки', optional: false },
  { id: 'i1', block: 'relationship', sphere: 'intimacy', text: 'Тайный вопрос', left: 'l', right: 'r', topic: 'тайна', optional: true },
  { id: 't1', block: 'maturity', sphere: 'past', text: 'Вопрос о прошлом', left: 'l', right: 'r', topic: 'прошлое', optional: true },
];
const p = (name: string, vals: (number | null)[]): Profile => ({
  name, bankVersion: 4, responses: Object.fromEntries(qs.map((q, i) => [q.id, vals[i] === null ? 'skipped' : answerFor(vals[i]!)])),
});
const A = p('Аня', [10, 0, 7, 2, 0]), B = p('Миша', [2, 7, 9, null, 10]);

describe('согласие открыть ответы', () => {
  it('метка своя у каждого кода и проверяется', () => {
    expect(openToken('abc')).not.toBe(openToken('abd'));
    expect(hasOpened('abc', [openToken('abc')])).toBe(true);
    expect(hasOpened('abc', [openToken('xyz')])).toBe(false);
    expect(openToken('abc')).toMatch(/^o[A-Za-z0-9_-]+$/);
  });
  it('метки переживают разбор ссылки', () => {
    const t = [openToken('aaa'), openToken('bbb')];
    expect(parseHash(`#${resultHash('aaa', 'bbb', false, t)}`)).toEqual({ kind: 'result', a: 'aaa', b: 'bbb', quick: false, open: t });
    expect(parseHash(`#${resultHash('aaa', 'bbb', false)}`)).toEqual({ kind: 'result', a: 'aaa', b: 'bbb', quick: false });
  });
});

describe('расхождения', () => {
  it('группы по силе, пропущенные не показываются', () => {
    const g = divergences(qs, A, B);
    expect(g.map((x) => [x.title, x.rows.map((r) => r.id)])).toEqual([
      ['Противоположные мнения', ['t1', 'k1', 'b1']],
    ]);
    expect(g.flatMap((x) => x.rows).some((r) => r.id === 'i1')).toBe(false);
  });
});

describe('экран результата: ответы друг друга', () => {
  it('видны сразу, без согласия: все вопросы с ответами обоих, включая прошлый опыт; пропущенного нет', () => {
    const s = resultScreen(A, B, compare(qs, A, B), 'https://x/#r.a.b', qs).querySelector('.answers')!;
    expect(s.textContent).toContain('Сколько детей');
    expect(s.textContent).toMatch(/Аня: 10.*Миша: 2/);
    expect(s.textContent).toContain('Вопрос о прошлом');
    expect(s.textContent).not.toContain('Тайный вопрос');
  });
  it('без списка вопросов блока нет', () => {
    expect(resultScreen(A, B, compare(qs, A, B), 'https://x/#r.a.b').querySelector('.answers')).toBeNull();
  });
});

describe('расхождения: отношение к привычке партнёра', () => {
  it('вопросы с cross не попадают в расхождения: у двух некурящих «Нормально» и «Против» — не разногласие', () => {
    const cq: Question[] = [{ id: 'smoke', block: 'relationship', sphere: 'habits', text: 'Курение', left: 'l', right: 'r', topic: 'курение', optional: false, cross: { id: 'me', level: [0, 0, 0.5, 0.75, 1] } }];
    const x: Profile = { name: '', bankVersion: 4, responses: { smoke: answerFor(0) } };
    const y: Profile = { name: '', bankVersion: 4, responses: { smoke: answerFor(10) } };
    expect(divergences(cq, x, y)).toEqual([]);
  });
});
