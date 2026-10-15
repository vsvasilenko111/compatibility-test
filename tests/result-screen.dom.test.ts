// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resultScreen } from '../src/ui/screens/result';
import { compare } from '../src/scoring/compare';
import { answerFor } from '../src/ui/answer-logic';
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
