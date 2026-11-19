import { optionIndex, OPTION_VALUES } from '../answer';
import type { Profile, Question } from '../types';
import { h } from './dom';

/** Literal selected option; knowing it does not imply compatibility with the other person. */
export function answerSelection(q: Question, person: Profile): { label: string; known: boolean; index: number | null } {
  const response = person.responses[q.id];
  if (!response) return { label: 'Нет ответа', known: false, index: null };
  if (response === 'skipped') return { label: 'Вопрос пропущен', known: false, index: null };
  const value = response.value;
  if (!Number.isFinite(value) || value < 0 || value > 10) return { label: 'Ответ недоступен', known: false, index: null };
  const index = optionIndex(value);
  if (q.answerKind === 'categorical' && (!q.options?.[index] || value !== OPTION_VALUES[index])) return { label: 'Ответ недоступен', known: false, index: null };
  const label = q.options ? q.options[index] : `${value} из 10 · ${q.left} — ${q.right}`;
  if (!label) return { label: 'Ответ недоступен', known: false, index: null };
  const uncertain = q.uncertainOptions?.includes(index + 1);
  return { label: uncertain ? `${label} · пока не определились` : label, known: !uncertain, index: q.options ? index : null };
}

/** Read-only choices: participant colours identify ownership, never a computed match. */
export function answerComparison(q: Question, a: Profile, b: Profile): HTMLElement {
  const selections = [answerSelection(q, a), answerSelection(q, b)];
  const baseNames = [a.name.trim() || 'Первый', b.name.trim() || 'Второй'];
  const names = baseNames.map((name, i) => baseNames[0] === baseNames[1] ? `${name} (${i + 1})` : name);
  return h('div', { class: `answer-comparison${q.options ? '' : ' answer-comparison-legacy'}` },
    h('div', { class: 'sphere-question-answers comparison-participants' },
      ...selections.map((selection, i) => h('div', {
        class: `sphere-person-answer comparison-participant participant-${i === 0 ? 'a' : 'b'}`,
        'data-participant': i === 0 ? 'a' : 'b',
      },
      h('span', { class: 'comparison-person-dot', 'aria-hidden': 'true' }),
      h('b', {}, names[i]),
      h('p', { class: q.options && selection.known ? 'comparison-selected-label' : 'comparison-answer-status' }, selection.label)))),
    q.options ? h('ul', { class: 'answer-choice-list', 'aria-label': 'Все варианты ответа' },
      ...q.options.map((label, index) => {
        const chosen = selections.map(selection => selection.index === index);
        const owners = [chosen[0] ? 'a' : '', chosen[1] ? 'b' : ''].filter(Boolean).join(' ');
        return h('li', { class: 'answer-choice', 'data-option-index': String(index), 'data-selected-by': owners },
          h('span', { class: 'answer-choice-label' }, label),
          h('span', { class: 'answer-choice-marks' }, ...chosen.map((selected, i) => h('span', {
            class: `answer-choice-mark participant-${i === 0 ? 'a' : 'b'}${selected ? ' is-selected' : ''}`,
            'data-participant': i === 0 ? 'a' : 'b',
            ...(selected ? { role: 'img', 'aria-label': `Ответ ${names[i]}` } : { 'aria-hidden': 'true' }),
          }))));
      })) : null);
}
