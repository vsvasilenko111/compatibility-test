import type { Question, Response } from '../../types';
import { answerFor, OPTION_VALUES } from '../../answer';
import { h } from '../dom';

/** О ком вопрос: тест только для пар; блок дружбы — о партнёре как друге. */
export const BLOCK_TAG: Record<Question['block'], string> = { friendship: 'Партнёр как друг', relationship: 'О вас как паре', maturity: 'О вас и ваших чувствах' };

export interface QuestionProps {
  question: Question;
  index: number;
  total: number;
  response: Response | undefined;
  /** Вводная строка над вопросом — перед подблоком. */
  lead?: string;
  onBack: (() => void) | null;
  onSubmit(r: Response): void;
}

export function questionScreen(p: QuestionProps): HTMLElement {
  let value: number | null = p.response && p.response !== 'skipped' ? p.response.value : null;
  let firm = p.response !== undefined && p.response !== 'skipped' && p.response.firm === true;
  const answered = value;
  let locked = false;
  const root = h('section', { class: 'screen question' });
  const submit = (i: number) => p.onSubmit(firm ? { ...answerFor(i), firm: true } : answerFor(i));

  /**
   * Тап по числу сразу переходит дальше; короткая пауза показывает выбранное число.
   * У вопроса с отметкой «не обсуждается» — не переходит: сначала можно поставить отметку, потом «Дальше».
   */
  function choose(i: number) {
    if (locked) return;
    value = i;
    if (p.question.firm) return draw();
    locked = true;
    draw();
    setTimeout(() => submit(i), 180);
  }

  function draw() {
    const q = p.question;

    const nodes: (Node | null)[] = [
      h('div', { class: 'progress' },
        h('div', { class: 'bar', style: `width:${(p.index / p.total) * 100}%` }),
        h('span', {}, `${p.index + 1} / ${p.total}`)),
      p.lead ? h('p', { class: 'lead' }, p.lead) : null,
      h('p', { class: 'tag' }, BLOCK_TAG[q.block]),
      h('h2', {}, q.text),
      ...(q.options ? [optionList(q.options)] : legacyScale(q)),
      q.firm
        ? h('label', { class: 'firm' },
          h('input', { type: 'checkbox', checked: firm, onchange: (e: Event) => { firm = (e.target as HTMLInputElement).checked; } }),
          h('span', {}, 'Для меня это не обсуждается'))
        : null,
      h('div', { class: 'nav' },
        p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        q.optional ? h('button', { type: 'button', class: 'secondary', onclick: () => p.onSubmit('skipped') }, 'Пропустить') : null,
        // «Дальше» нужна только при возврате к уже отвеченному вопросу — чтобы оставить ответ как есть.
        (q.firm ? value : answered) !== null
          ? h('button', { type: 'button', class: 'primary', onclick: () => submit((q.firm ? value : answered)!) }, 'Дальше')
          : null),
    ];
    root.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  }

  /** 5 вариантов словами — по одной оси, сверху вниз от левого края к правому. */
  function optionList(options: string[]): HTMLElement {
    return h('div', { class: 'options mine', role: 'group' },
      ...options.map((label, i) => {
        const v = OPTION_VALUES[i];
        return h('button', {
          type: 'button',
          class: v === value ? 'option on' : 'option',
          'aria-pressed': v === value ? 'true' : 'false',
          onclick: () => choose(v),
        }, label);
      }));
  }

  /** Прежняя шкала 0–10 — для вопросов без вариантов. */
  function legacyScale(q: Question): HTMLElement[] {
    return [
      h('div', { class: 'poles' }, h('span', {}, `0 — ${q.left}`), h('span', {}, `10 — ${q.right}`)),
      h('div', { class: 'scale mine', role: 'group' },
        ...Array.from({ length: 11 }, (_, i) =>
          h('button', {
            type: 'button',
            class: i === value ? 'cell on' : 'cell',
            'aria-pressed': i === value ? 'true' : 'false',
            onclick: () => choose(i),
          }, String(i)))),
    ];
  }

  draw();
  return root;
}
