import type { Question, Response } from '../../types';
import { answerFor } from '../../answer';
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
  const answered = value;
  let locked = false;
  const root = h('section', { class: 'screen question' });

  /** Тап по числу сразу переходит дальше; короткая пауза показывает выбранное число. */
  function choose(i: number) {
    if (locked) return;
    locked = true;
    value = i;
    draw();
    setTimeout(() => p.onSubmit(answerFor(i)), 180);
  }

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
            onclick: () => choose(i),
          }, String(i)))),
      h('div', { class: 'nav' },
        p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        q.optional ? h('button', { type: 'button', class: 'secondary', onclick: () => p.onSubmit('skipped') }, 'Пропустить') : null,
        // «Дальше» нужна только при возврате к уже отвеченному вопросу — чтобы оставить ответ как есть.
        answered !== null
          ? h('button', { type: 'button', class: 'primary', onclick: () => p.onSubmit(answerFor(answered)) }, 'Дальше')
          : null),
    ];
    root.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  }

  draw();
  return root;
}
