// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { answerFor } from '../src/answer';
import { BANK_VERSION, QUESTIONS } from '../src/questions';
import { personalIndices } from '../src/scoring/personal-indices';
import type { Profile } from '../src/types';
import { personalResultScreen } from '../src/ui/screens/personal-result';

it('keeps the named personal cover, three computed indices and their source disclosures', () => {
  const name = '<img src=x onerror=alert(1)>';
  const profile: Profile = { name, bankVersion: BANK_VERSION,
    responses: Object.fromEntries(QUESTIONS.map((q, i) => [q.id, answerFor((i % 5) * 2.5)])) };
  const root = personalResultScreen(profile, QUESTIONS, '#i.own', () => {});
  expect(root.querySelector('.personal-cover h1')?.textContent).toBe(`Личный результат: ${name}`);
  expect(root.querySelector('img, script, .score, .score-visual')).toBeNull();
  const indices = personalIndices(QUESTIONS, profile);
  const expected = [...indices.resources, ...indices.preferences];
  expect(expected).toHaveLength(3);
  expect(root.querySelectorAll('.personal-index-card')).toHaveLength(3);
  for (const index of expected) {
    const card = root.querySelector(`[data-index="${index.key}"]`)!;
    expect(card.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe(String(index.score));
    expect(card.querySelector('.personal-index-count')?.textContent).toBe(`Ситуаций: ${index.answered} из ${index.total}`);
    const evidence = card.querySelector<HTMLDetailsElement>('.personal-index-evidence')!;
    expect(evidence.open).toBe(false);
    expect(evidence.querySelectorAll('[data-question-id]')).toHaveLength(index.evidence.length);
    expect(card.querySelector('.personal-index-poles')?.textContent).toContain(index.lowLabel);
    expect(card.querySelector('.personal-index-poles')?.textContent).toContain(index.highLabel);
  }
  expect(root.querySelector<HTMLDetailsElement>('.personal-index-method')?.open).toBe(false);
  expect(root.querySelector('.personal-index-method')?.textContent).toContain('общего балла из этих шкал нет');
  expect(root.querySelector<HTMLDetailsElement>('.personal-topic-answers')?.open).toBe(false);
});
