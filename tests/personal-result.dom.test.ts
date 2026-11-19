// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { answerFor } from '../src/answer';
import { QUESTIONS, BANK_VERSION } from '../src/questions';
import { compare } from '../src/scoring/compare';
import type { Profile } from '../src/types';
import { introScreen } from '../src/ui/screens/intro';
import { personalResultScreen } from '../src/ui/screens/personal-result';
import { resultScreen } from '../src/ui/screens/result';

const profile = (name = 'Аня', value = 0): Profile => ({
  name, bankVersion: BANK_VERSION,
  responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(value)])),
  priorities: { humor: 'top', contact: 'top', leisure: 'top', loyalty: 'top', honesty: 'top', kids: 'low' },
});
const inviteUrl = 'https://example.test/#i.own';

describe('personal result', () => {
  it('shows one answer-owned portrait and evidence without a pair score', () => {
    const root = personalResultScreen(profile(), QUESTIONS, inviteUrl, () => {});
    expect(root.classList.contains('personal-result')).toBe(true);
    expect(root.querySelector('h1')?.textContent).toBe('Личный результат: Аня');
    expect(root.children[1].classList.contains('personal-indices')).toBe(true);
    expect(root.querySelectorAll('.personal-indices [role="meter"]')).toHaveLength(3);
    expect(root.querySelector('.personal-indices [data-index="close_circle"]')?.textContent).toContain('Участие в жизни близких');
    expect(root.querySelectorAll('.person-summary-card')).toHaveLength(1);
    expect(root.querySelector('h4')?.textContent).toBe('По ответам: Аня');
    expect(root.querySelectorAll('.person-summary-trait')).toHaveLength(6);
    expect(root.querySelector('[data-question-id="loyalty-05"] .person-summary-answer')?.textContent).toBe('1. Совет, что делать');
    expect(root.querySelector('.score, .poster-names, .person-summary-grid')).toBeNull();
    expect(root.textContent).not.toContain('Второй');
    expect(root.textContent).not.toContain('%');
    const other = personalResultScreen(profile('Миша', 10), QUESTIONS, inviteUrl, () => {});
    expect(other.querySelector('[data-question-id="loyalty-05"] .person-summary-answer')?.textContent).toBe('5. Чтобы просто выслушали');
    expect(other.textContent).not.toContain('Аня');
  });

  it('shows only selected priority names, an invitation and a partner-here action', () => {
    let partnerStarted = false;
    const root = personalResultScreen(profile(), QUESTIONS, inviteUrl, () => { partnerStarted = true; });
    expect([...root.querySelectorAll('.personal-priorities li')].map(li => li.textContent)).toEqual([
      'Юмор', 'Общение и внимание', 'Досуг и увлечения', 'Надёжность и поддержка', 'Честность и границы',
    ]);
    expect(root.querySelector<HTMLInputElement>('.share input')?.value).toBe(inviteUrl);
    expect(root.querySelector('a[href="#"]')?.textContent).toMatch(/главную/i);
    [...root.querySelectorAll('button')].find(button => button.textContent === 'Пройти тест партнёру здесь')!.click();
    expect(partnerStarted).toBe(true);
  });

  it('renders names, evidence and share URLs as text without interpreting markup', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const qs = QUESTIONS.map(q => q.id === 'loyalty-05' ? { ...q, text: unsafe, options: [unsafe, 'b', 'c', 'd', 'e'] } : q);
    const root = personalResultScreen(profile(unsafe), qs, inviteUrl, () => {});
    expect(root.querySelector('h4')?.textContent).toContain(unsafe);
    expect(root.querySelector('[data-question-id="loyalty-05"]')?.textContent).toContain(unsafe);
    expect(root.querySelector('img, script')).toBeNull();
    expect(personalResultScreen(profile(''), QUESTIONS, inviteUrl, () => {}).querySelector('h4')?.textContent).toBe('По ответам: Вы');
  });

  it('links paired portraits to the matching personal result only when supplied', () => {
    const a = profile(), b = profile('Миша', 10), result = compare(QUESTIONS, a, b);
    const root = resultScreen(a, b, result, '#r.a.b', QUESTIONS, [], ['#p.a', '#p.b']);
    const cards = [...root.querySelectorAll('.person-summary-card')];
    expect(cards.map(card => card.querySelector('a')?.getAttribute('href'))).toEqual(['#p.a', '#p.b']);
    expect(cards.map(card => card.querySelector('a')?.textContent)).toEqual(['Личный результат', 'Личный результат']);
    expect(resultScreen(a, b, result, '#r.a.b', QUESTIONS).querySelectorAll('.person-summary-card a')).toHaveLength(0);
  });

  it('lets a returning participant reopen their own result from the homepage', () => {
    const props = { inviterName: null, total: 120, resumeAt: null, storageAvailable: true, ownUrl: inviteUrl,
      history: [], onStart: () => {}, onResume: () => {} };
    const root = introScreen({ ...props, ownResultUrl: '#p.own' });
    expect([...root.querySelectorAll('a')].find(a => a.textContent === 'Мой результат')?.getAttribute('href')).toBe('#p.own');
    expect(root.querySelector<HTMLInputElement>('.share input')?.value).toBe(inviteUrl);
    expect(introScreen(props).querySelector('a')).toBeNull();
    expect(introScreen({ ...props, inviterName: 'Миша', ownResultUrl: '#p.own' }).querySelector('a')).toBeNull();
  });
});
