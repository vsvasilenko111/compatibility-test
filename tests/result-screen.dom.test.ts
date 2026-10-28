// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resultScreen } from '../src/ui/screens/result';
import { compare } from '../src/scoring/compare';
import { answerFor } from '../src/answer';
import type { Profile, Question } from '../src/types';

const qs: Question[] = [
  { id: 'h1', block: 'friendship', sphere: 'humor', text: 't', left: 'l', right: 'r', topic: 'шутки', optional: false },
  { id: 'h2', block: 'friendship', sphere: 'humor', text: 't', left: 'l', right: 'r', topic: 'чёрный юмор', optional: false },
  { id: 'k1', block: 'relationship', sphere: 'kids', text: 't', left: 'l', right: 'r', topic: 'дети', optional: false },
];
const p = (name: string, vals: number[]): Profile => ({
  name, bankVersion: 1, responses: Object.fromEntries(qs.map((q, i) => [q.id, answerFor(vals[i])])),
});

describe('карта сфер в DOM', () => {
  const a = p('Аня', [10, 0, 10]);
  const b = p('Миша', [10, 10, 9]);
  const screen = () => resultScreen(a, b, compare(qs, a, b), 'https://x/#r.a.b');

  it('нажатие на плитку показывает темы сферы от расхождения к совпадению, без ответов', () => {
    const root = screen();
    const panel = root.querySelector<HTMLElement>('.sphere-detail')!;
    expect(panel.hidden).toBe(true);
    const humor = [...root.querySelectorAll<HTMLButtonElement>('.tile')].find((t) => t.textContent!.includes('Юмор'))!;
    humor.click();
    expect(panel.hidden).toBe(false);
    expect(humor.getAttribute('aria-expanded')).toBe('true');
    expect(panel.textContent).toContain('2 вопроса');
    const rows = [...panel.querySelectorAll('li')].map((li) => `${li.querySelector('.topic')!.textContent} — ${li.querySelector('.lvl')!.textContent}`);
    expect(rows).toEqual(['чёрный юмор — противоположно', 'шутки — совпадаете']);
    expect(panel.textContent).not.toMatch(/\d+ ?·|Аня|Миша/);
  });

  it('повторное нажатие закрывает, нажатие на другую сферу переключает', () => {
    const root = screen();
    const panel = root.querySelector<HTMLElement>('.sphere-detail')!;
    const tiles = [...root.querySelectorAll<HTMLButtonElement>('.tile')];
    tiles[0].click();
    tiles[0].click();
    expect(panel.hidden).toBe(true);
    tiles[0].click();
    tiles[1].click();
    expect(panel.hidden).toBe(false);
    expect(tiles[0].getAttribute('aria-expanded')).toBe('false');
    expect(tiles[1].getAttribute('aria-expanded')).toBe('true');
  });
});

describe('блок «Ресурсы пары» в DOM', () => {
  const mq: Question[] = [
    ...qs,
    { id: 'attach-03', block: 'maturity', sphere: 'attachment', text: 't', left: 'l', right: 'r', topic: 'опора на партнёра', optional: false },
    { id: 'reflect-04', block: 'maturity', sphere: 'reflection', text: 't', left: 'l', right: 'r', topic: 'помощь со стороны', optional: false },
  ];
  const mp = (name: string, vals: number[]): Profile => ({
    name, bankVersion: 4, responses: Object.fromEntries(mq.map((q, i) => [q.id, answerFor(vals[i])])),
  });

  it('тема «тяжёлые периоды» с текстом, без имён и баллов', () => {
    const a = mp('Аня', [10, 0, 10, 0, 2]);
    const b = mp('Миша', [10, 10, 9, 9, 2]);
    const section = resultScreen(a, b, compare(mq, a, b), 'https://x/#r.a.b').querySelector('.resources')!;
    expect(section.textContent).toContain('Тяжёлые периоды');
    expect(section.textContent).not.toMatch(/Аня|Миша|\d+ ?из|\b9\b/);
  });

  it('у ссылок прошлой версии блока нет', () => {
    const a = p('Аня', [10, 0, 10]);
    const b = p('Миша', [10, 10, 9]);
    expect(resultScreen(a, b, compare(mq, a, b), 'https://x/#r.a.b').querySelector('.resources')).toBeNull();
  });

  it('уровень навыков пары — без имён и ответов', () => {
    const rq: Question[] = [...qs, ...['conflicts-02', 'conflicts-03'].map((id, i): Question => ({
      id, block: 'maturity', sphere: 'regulation', text: 't', left: 'l', right: 'r', topic: `t${i}`, optional: false }))];
    const rp = (name: string, vals: number[]): Profile => ({
      name, bankVersion: 9, responses: Object.fromEntries(rq.map((q, i) => [q.id, answerFor(vals[i])])),
    });
    const a = rp('Аня', [10, 0, 10, 1, 9]);
    const b = rp('Миша', [10, 10, 9, 0, 9]);
    const items = [...resultScreen(a, b, compare(rq, a, b), 'https://x/#r.a.b').querySelectorAll('.resources .res')];
    expect(items.map((li) => li.querySelector('.res-head')!.textContent)).toEqual(['Спорить, не обжигаяполучается', 'Отпускать после ссорызона роста']);
    expect(items.map((li) => li.textContent).join()).not.toMatch(/Аня|Миша/);
  });
});

describe('дозаполнение после обновления теста', () => {
  const a = p('Аня', [10, 0, 10]);
  const b = p('Миша', [10, 10, 9]);

  it('без новых вопросов блока нет', () => {
    expect(resultScreen(a, b, compare(qs, a, b), 'https://x/#r.a.b').querySelector('.fill')).toBeNull();
  });

  it('кнопка на каждого, у кого есть новые вопросы, и нажатие запускает дозаполнение', () => {
    let filled = '';
    const root = resultScreen(a, b, compare(qs, a, b), 'https://x/#r.a.b', qs, [{ name: 'Аня', count: 10, onFill: () => { filled = 'Аня'; } }]);
    const btn = root.querySelector<HTMLButtonElement>('.fill button')!;
    expect(btn.textContent).toBe('Аня: ответить на 10 новых вопросов');
    btn.click();
    expect(filled).toBe('Аня');
  });
});
