// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { answerFor } from '../src/answer';
import { QUESTIONS, BANK_VERSION } from '../src/questions';
import { compare } from '../src/scoring/compare';
import { resultScreen } from '../src/ui/screens/result';
import type { Profile, Question } from '../src/types';

const portraitIds = ['relationship-goal-01', 'kids-02', 'kids-timing-01-r22', 'budget-arrangement-r36', 'budget-09-r31', 'conflict-response-01', 'conflict-repair-01', 'loyalty-05', 'space-07', 'life-08-r22'];
const questions = QUESTIONS.filter(q => portraitIds.includes(q.id));
const profile = (name: string, value: number): Profile => ({
  name, bankVersion: BANK_VERSION,
  responses: Object.fromEntries(questions.map(q => [q.id, answerFor(value)])),
});
const screen = (a: Profile, b: Profile, qs: Question[] | undefined = questions) =>
  resultScreen(a, b, compare(qs ?? questions, a, b), 'https://example.test/#result', qs);

describe('individual descriptions in pair results', () => {
  it('shows two named cards with six themes and evidence owned by each person', () => {
    const root = screen(profile('Аня', 0), profile('Миша', 10));
    const cards = [...root.querySelectorAll('.person-summary-card')];
    expect(cards).toHaveLength(2);
    expect(cards.map(c => c.querySelector('h4')?.textContent)).toEqual(['По ответам: Аня', 'По ответам: Миша']);
    for (const card of cards) expect(card.querySelectorAll('.person-summary-trait')).toHaveLength(6);
    const evidenceA = cards[0].querySelector('details')!;
    const evidenceB = cards[1].querySelector('details')!;
    expect(evidenceA.hasAttribute('open')).toBe(false);
    expect(evidenceA.textContent).toContain('Вы рассказываете партнёру о ссоре с начальником. Что вам нужно в первую очередь?');
    expect(evidenceA.querySelector('[data-question-id="loyalty-05"] .person-summary-answer')?.textContent).toBe('1. Совет, что делать');
    expect(evidenceB.querySelector('[data-question-id="loyalty-05"] .person-summary-answer')?.textContent).toBe('5. Чтобы просто выслушали');
    expect(root.querySelector('.poster')!.compareDocumentPosition(root.querySelector('.person-summaries')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders supplied names, questions and selected answers as text', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const qs = questions.map(q => q.id === 'loyalty-05' ? { ...q, text: unsafe, options: [unsafe, 'b', 'c', 'd', 'e'] } : q);
    const root = screen(profile(unsafe, 0), profile('<script>bad()</script>', 10), qs);
    const section = root.querySelector('.person-summaries')!;
    expect(section.textContent).toContain(`По ответам: ${unsafe}`);
    expect(section.querySelector('[data-question-id="loyalty-05"]')?.textContent).toContain(unsafe);
    expect(section.querySelector('img, script')).toBeNull();
  });

  it('shows insufficient facts for empty profiles without invented trait headings or evidence', () => {
    const a = { ...profile('Аня', 0), responses: {} };
    const root = screen(a, profile('Миша', 10));
    const empty = root.querySelector('.person-summary-card')!;
    expect(empty.textContent).toMatch(/недостаточно.*ответов/i);
    expect(empty.querySelector('.person-summary-trait, details')).toBeNull();
    expect(root.querySelectorAll('.person-summary-card')[1].querySelectorAll('.person-summary-trait')).toHaveLength(6);
  });

  it('keeps raw result fallback free of invented descriptions when question metadata is absent', () => {
    const a = profile('Аня', 0), b = profile('Миша', 10);
    const root = resultScreen(a, b, compare(questions, a, b), 'https://example.test/#result');
    expect(root.querySelector('.person-summaries')).toBeNull();
    expect(root.querySelector('.poster')).not.toBeNull();
  });
});
