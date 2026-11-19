// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { sphereExplorer } from '../src/ui/sphere-explorer';
import { resultScreen } from '../src/ui/screens/result';
import { compare } from '../src/scoring/compare';
import type { Profile, Question } from '../src/types';

const question: Question = { id: 'visual', sphere: 'humor', block: 'friendship', text: 'Как вам удобнее?', topic: 'Выбор', optional: false,
  left: 'Первый', right: 'Пятый', options: ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый'] };
const person = (name: string, choice: number | null): Profile => ({ name, bankVersion: 40,
  responses: choice === null ? {} : { visual: answerFor(OPTION_VALUES[choice]) } });
function open(q = question, a = person('Аня', 0), b = person('Борис', 4)) {
  const root = sphereExplorer([{ id: 'humor', label: 'Юмор', percent: 75, items: [{ id: 'visual', topic: 'Выбор', match: 1 }] }], [q], a, b);
  document.body.replaceChildren(root);
  root.querySelector<HTMLButtonElement>('.tile')!.click();
  const detail = root.querySelector<HTMLDetailsElement>('[data-question-id="visual"]')!;
  detail.open = true;
  return detail;
}
afterEach(() => document.body.replaceChildren());

describe('visual comparison of participant answer choices', () => {
  it('shows every original choice and marks the right participant across all 25 combinations', () => {
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
      const detail = open(question, person('Аня', a), person('Борис', b));
      const rows = [...detail.querySelectorAll<HTMLElement>('.answer-choice')];
      expect(rows).toHaveLength(5);
      expect(rows.map(row => row.querySelector('.answer-choice-label')!.textContent)).toEqual(question.options);
      rows.forEach((row, i) => {
        expect(row.querySelector('[data-participant="a"]')!.classList.contains('is-selected')).toBe(i === a);
        expect(row.querySelector('[data-participant="b"]')!.classList.contains('is-selected')).toBe(i === b);
      });
      expect(detail.querySelectorAll('.answer-choice-mark.is-selected')).toHaveLength(2);
      expect(detail.querySelector('.answer-choice-mark[data-participant="a"].is-selected')!.getAttribute('aria-label')).toContain('Аня');
      expect(detail.querySelector('.answer-choice-mark[data-participant="b"].is-selected')!.getAttribute('aria-label')).toContain('Борис');
      expect(detail.querySelectorAll('.answer-comparison button,input')).toHaveLength(0);
    }
  });
  it('puts both markers on one row when both chose the same answer', () => {
    const detail = open(question, person('Аня', 2), person('Борис', 2));
    expect(detail.querySelectorAll('.answer-choice[data-selected-by="a b"]')).toHaveLength(1);
    expect(detail.querySelector('.answer-choice[data-selected-by="a b"] .answer-choice-label')!.textContent).toBe('Третий');
  });
  it('does not invent a selection when an answer is missing, skipped or invalid', () => {
    for (const response of [undefined, 'skipped', answerFor(Number.NaN)] as const) {
      const a: Profile = { ...person('Аня', null), responses: response === undefined ? {} : { visual: response } };
      const detail = open(question, a);
      expect(detail.querySelectorAll('.answer-choice-mark[data-participant="a"].is-selected')).toHaveLength(0);
      expect(detail.querySelectorAll('.answer-choice-mark[data-participant="b"].is-selected')).toHaveLength(1);
    }
  });
  it('shows literal unknown/category choices without inventing compatibility colours', () => {
    const categorical = { ...question, scored: false, answerKind: 'categorical' as const };
    const detail = open(categorical, person('Аня', 0), person('Борис', 4));
    expect(detail.querySelector('summary')!.textContent).toContain('Без оценки');
    expect(detail.classList.contains('neutral')).toBe(true);
    expect(detail.querySelectorAll('.answer-choice')).toHaveLength(5);
    const uncertain = open({ ...question, uncertainOptions: [3] }, person('Аня', 2), person('Борис', 2));
    expect(uncertain.querySelector('summary')!.textContent).toContain('Недостаточно данных');
    expect(uncertain.querySelectorAll('.answer-choice[data-selected-by="a b"]')).toHaveLength(1);
  });
  it('renders names and option text safely as text', () => {
    const text = '<img src=x onerror=alert(1)>';
    const detail = open({ ...question, options: [text, ...question.options!.slice(1)] }, person(text, 0));
    expect(detail.textContent).toContain(text);
    expect(detail.querySelector('img,script')).toBeNull();
  });
  it('labels literal answer agreement in the collapsed All answers list, including nominal categories', () => {
    for (const q of [question, { ...question, scored: false, answerKind: 'categorical' as const }]) {
      for (const [aChoice, bChoice, status, label] of [[1, 1, 'same', 'Ответы совпали'], [1, 2, 'different', 'Ответы различаются']] as const) {
        const a = person('Аня', aChoice), b = person('Борис', bChoice);
        const root = resultScreen(a, b, compare([q], a, b), 'https://example.test/', [q]);
        const all = [...root.querySelectorAll<HTMLDetailsElement>('.answers > details')].find(d => d.querySelector('summary')!.textContent!.startsWith('Все ответы'))!;
        const item = all.querySelector<HTMLElement>('.answer')!;
        expect(item.dataset.answerAgreement).toBe(status);
        expect(item.querySelector('.answer-details > summary .answer-agreement')!.textContent).toBe(label);
      }
    }
  });
  it('keeps uncertainty neutral even when both picked the same uncertain option', () => {
    const q = { ...question, uncertainOptions: [3] };
    const a = person('Аня', 2), b = person('Борис', 2);
    const root = resultScreen(a, b, compare([q], a, b), 'https://example.test/', [q]);
    expect(root.querySelector<HTMLElement>('.answers .answer')!.dataset.answerAgreement).toBe('unknown');
    expect(root.querySelector('.answer-agreement')!.textContent).toBe('Пока не определились');
  });
  it('uses the same complete choice view when a question is expanded in All answers', () => {
    const a = person('Аня', 1), b = person('Борис', 4);
    const root = resultScreen(a, b, compare([question], a, b), 'https://example.test/', [question]);
    const all = [...root.querySelectorAll<HTMLDetailsElement>('.answers > details')].find(d => d.querySelector('summary')!.textContent!.startsWith('Все ответы'))!;
    all.open = true;
    const detail = all.querySelector<HTMLDetailsElement>('.answer-details');
    expect(detail).not.toBeNull();
    detail!.open = true;
    expect(detail!.querySelectorAll('.answer-choice')).toHaveLength(5);
    expect(detail!.querySelectorAll('.answer-choice-mark.is-selected')).toHaveLength(2);
  });
});
