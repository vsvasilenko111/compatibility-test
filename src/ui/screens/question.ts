import { IMPORTANCE_LABELS, MAX_CRITICAL, type ImportanceLevel, type Question, type Response } from '../../types';
import { canChooseCritical, draftFrom, setImportance, setValue, toAnswer } from '../answer-logic';
import { h } from '../dom';

export interface QuestionProps {
  question: Question;
  index: number;
  total: number;
  response: Response | undefined;
  criticalUsed: number; // «критично» на других вопросах
  onBack: (() => void) | null;
  onSubmit(r: Response): void;
}

export function questionScreen(p: QuestionProps): HTMLElement {
  let d = draftFrom(p.response);
  const root = h('section', { class: 'screen question' });

  const scale = (cls: string, isOn: (i: number) => boolean, onTap: (i: number) => void) =>
    h('div', { class: `scale ${cls}`, role: 'group' },
      ...Array.from({ length: 11 }, (_, i) =>
        h('button', {
          type: 'button',
          class: isOn(i) ? 'cell on' : 'cell',
          'aria-pressed': isOn(i) ? 'true' : 'false',
          onclick: () => { onTap(i); draw(); },
        }, String(i))));

  function draw() {
    const q = p.question;
    const critBlocked = !canChooseCritical(p.criticalUsed) && d.importance !== 3;
    const answer = toAnswer(d);

    const nodes: (Node | null)[] = [
      h('div', { class: 'progress' },
        h('div', { class: 'bar', style: `width:${(p.index / p.total) * 100}%` }),
        h('span', {}, `${p.index + 1} / ${p.total}`)),
      h('h2', {}, q.text),
      h('div', { class: 'poles' }, h('span', {}, `0 — ${q.left}`), h('span', {}, `10 — ${q.right}`)),
      h('p', { class: 'label' }, 'Мой ответ'),
      scale('mine', (i) => i === d.value, (i) => { d = setValue(d, i); }),
      h('p', { class: 'label' }, 'Насколько это важно'),
      h('div', { class: 'importance' },
        ...IMPORTANCE_LABELS.map((label, i) =>
          h('button', {
            type: 'button',
            class: d.importance === i ? 'imp on' : 'imp',
            disabled: i === 3 && critBlocked,
            onclick: () => { d = setImportance(d, i as ImportanceLevel); draw(); },
          }, label))),
      h('p', { class: 'hint' },
        `Критично: ${p.criticalUsed + (d.importance === 3 ? 1 : 0)} из ${MAX_CRITICAL}`
          + (critBlocked ? ' — снимите «критично» с другого вопроса' : '')),
      h('div', { class: 'nav' },
        p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        q.optional ? h('button', { type: 'button', class: 'secondary', onclick: () => p.onSubmit('skipped') }, 'Пропустить') : null,
        h('button', {
          type: 'button', class: 'primary', disabled: !answer,
          onclick: () => { if (answer) p.onSubmit(answer); },
        }, 'Дальше')),
    ];
    root.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  }

  draw();
  return root;
}
