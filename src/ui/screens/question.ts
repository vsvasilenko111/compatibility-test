import type { Question, Response } from '../../types';
import { answerFor } from '../answer-logic';
import { h } from '../dom';

export interface QuestionProps {
  question: Question;
  index: number;
  total: number;
  response: Response | undefined;
  onBack: (() => void) | null;
  onSubmit(r: Response): void;
}

export function questionScreen(p: QuestionProps): HTMLElement {
  let value: number | null = p.response && p.response !== 'skipped' ? p.response.value : null;
  const root = h('section', { class: 'screen question' });

  function draw() {
    const q = p.question;

    const nodes: (Node | null)[] = [
      h('div', { class: 'progress' },
        h('div', { class: 'bar', style: `width:${(p.index / p.total) * 100}%` }),
        h('span', {}, `${p.index + 1} / ${p.total}`)),
      h('h2', {}, q.text),
      h('div', { class: 'poles' }, h('span', {}, `0 — ${q.left}`), h('span', {}, `10 — ${q.right}`)),
      h('div', { class: 'scale mine', role: 'group' },
        ...Array.from({ length: 11 }, (_, i) =>
          h('button', {
            type: 'button',
            class: i === value ? 'cell on' : 'cell',
            'aria-pressed': i === value ? 'true' : 'false',
            onclick: () => { value = i; draw(); },
          }, String(i)))),
      h('div', { class: 'nav' },
        p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        q.optional ? h('button', { type: 'button', class: 'secondary', onclick: () => p.onSubmit('skipped') }, 'Пропустить') : null,
        h('button', {
          type: 'button', class: 'primary', disabled: value === null,
          onclick: () => { if (value !== null) p.onSubmit(answerFor(value)); },
        }, 'Дальше')),
    ];
    root.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  }

  draw();
  return root;
}
