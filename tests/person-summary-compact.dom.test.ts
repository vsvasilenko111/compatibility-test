// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { QUESTIONS, BANK_VERSION } from '../src/questions';
import type { Profile } from '../src/types';
import { personSummaryCard, personSummarySection } from '../src/ui/person-summary-view';

const profile = (choices: Record<string, number>, name = 'Аня'): Profile => ({
  name, bankVersion: BANK_VERSION,
  responses: Object.fromEntries(Object.entries(choices).map(([id, option]) => [id, answerFor(OPTION_VALUES[option - 1])])),
});
const row = (card: HTMLElement, key: string) => card.querySelector(`[data-trait="${key}"] dd`)?.textContent ?? '';

describe('compact answer-grounded person cards', () => {
  it('keeps all six themes short while preserving exact evidence in a closed disclosure', () => {
    const choices = { 'relationship-goal-01': 2, 'kids-02': 4, 'kids-timing-01-r22': 3,
      'budget-arrangement-r36': 5, 'budget-09-r31': 2,
      'conflict-response-01': 2, 'conflict-repair-01': 4, 'loyalty-05': 5, 'space-07': 4, 'life-08-r22': 2 };
    const card = personSummaryCard(QUESTIONS, profile(choices));
    expect(card.querySelectorAll('dt')).toHaveLength(6);
    for (const dd of card.querySelectorAll('dd')) expect(dd.textContent!.length).toBeLessThan(235);
    expect(row(card, 'plans')).toContain('Скорее хочу долгосрочных отношений');
    expect(row(card, 'plans')).toContain('Двое');
    expect(row(card, 'plans')).toContain('3–5 лет');
    expect(row(card, 'money')).toContain('доход второго, если он есть, остаётся у него');
    expect(row(card, 'money')).toContain('Бюджет:');
    expect(row(card, 'support')).toContain('Нужна поддержка после ссоры с начальником:');
    expect(row(card, 'boundaries')).toContain('Телефон партнёра:');
    expect(row(card, 'leisure')).toContain('Несколько раз в неделю');
    const evidence = card.querySelector('.person-summary-evidence')!;
    expect(evidence.hasAttribute('open')).toBe(false);
    for (const [id, option] of Object.entries(choices)) {
      const question = QUESTIONS.find(q => q.id === id)!;
      const source = evidence.querySelector(`[data-question-id="${id}"]`)!;
      expect(source.querySelector('.person-summary-question')?.textContent).toBe(question.text);
      expect(source.querySelector('.person-summary-answer')?.textContent).toBe(`${option}. ${question.options![option - 1]}`);
    }
  });

  it('keeps five arrangement choices neutral and grounded in exact selected source', () => {
    const question = QUESTIONS.find(q => q.id === 'budget-arrangement-r36')!;
    expect(question).toBeDefined();
    question.options!.forEach((answer, index) => {
      const card = personSummaryCard(QUESTIONS, profile({ [question.id]: index + 1 }));
      expect(row(card, 'money')).toBe(`Бюджет: ${answer}.`);
      expect(row(card, 'money')).not.toMatch(/лучше|хуже|мужчина|женщина|не зарабатывает/);
    });
  });

  it('preserves opposing children answers and uncertainty without normalizing them', () => {
    const card = personSummaryCard(QUESTIONS, profile({ 'relationship-goal-01': 3, 'kids-02': 1, 'kids-timing-01-r22': 2 }));
    expect(row(card, 'plans')).toContain('Пока не знаю, хочу ли отношений надолго');
    expect(row(card, 'plans')).toContain('Дети: Не хочу детей');
    expect(row(card, 'plans')).toContain('Срок: В ближайшие 1–2 года');
    expect(card.querySelector('[data-trait="plans"]')?.getAttribute('data-status')).toBe('mixed');
  });

  it('folds the pair group and preserves individual links and escaped names', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const section = personSummarySection(QUESTIONS, profile({ 'loyalty-05': 1 }, unsafe), profile({ 'loyalty-05': 5 }, 'Миша'), ['#anna', '#misha'])!;
    expect(section.tagName).toBe('DETAILS');
    expect(section.hasAttribute('open')).toBe(false);
    expect(section.querySelector(':scope > summary')?.textContent).toBe('Личные результаты');
    expect([...section.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['#anna', '#misha']);
    expect(section.textContent).toContain(unsafe);
    expect(section.querySelector('img')).toBeNull();
  });

  it('uses exact legacy answers instead of applying current funding meanings', () => {
    const legacy = { ...QUESTIONS.find(q => q.id === 'budget-arrangement-r36')!, id: 'budget-08-funding-r34', options: ['Особый прежний ответ', 'b', 'c', 'd', 'e'] };
    const card = personSummaryCard([legacy], profile({ [legacy.id]: 1 }));
    expect(row(card, 'money')).toContain('«Особый прежний ответ»');
    expect(row(card, 'money')).not.toContain('Я полностью');
    expect(card.querySelector('[data-question-id="budget-funding-model-r35"]')).toBeNull();
  });
});
