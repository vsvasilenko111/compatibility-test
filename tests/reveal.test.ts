// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
];
const p = (name: string, vals: (number | null)[]): Profile => ({
  name, bankVersion: 4, responses: Object.fromEntries(qs.map((q, i) => [q.id, vals[i] === null ? 'skipped' : answerFor(vals[i]!)])),
});
const A = p('Аня', [10, 0, 7, 2]), B = p('Миша', [2, 7, 9, null]);

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
      ['Противоположные мнения', ['k1', 'b1']],
    ]);
    expect(g.flatMap((x) => x.rows).some((r) => r.id === 'i1')).toBe(false);
  });
});

describe('экран результата: ответы друг друга', () => {
  const screen = (opened: [boolean, boolean], mine: 0 | 1 | null, onOpen = () => {}) =>
    resultScreen(A, B, compare(qs, A, B), 'https://x/#r.a.b', { questions: qs, opened, mine, onOpen }).querySelector('.answers');

  it('открыли оба — видны вопросы и ответы обоих, пропущенного нет', () => {
    const s = screen([true, true], null)!;
    expect(s.textContent).toContain('Сколько детей');
    expect(s.textContent).toMatch(/Аня: 10.*Миша: 2/);
    expect(s.textContent).not.toContain('Тайный вопрос');
  });
  it('открыл один — ответов не видно, второму предлагается открыть свои', () => {
    const s = screen([true, false], 1)!;
    expect(s.textContent).not.toContain('Сколько детей');
    expect(s.textContent).toContain('Партнёр уже открыл');
    const onOpen = vi.fn();
    screen([false, false], 0, onOpen)!.querySelector('button')!.click();
    expect(onOpen).toHaveBeenCalled();
  });
  it('постороннему без согласия обоих блок не показывается', () => {
    expect(screen([true, false], null)).toBeNull();
  });
});
