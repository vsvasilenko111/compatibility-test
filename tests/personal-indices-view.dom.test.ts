// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { answerFor } from '../src/answer';
import { BANK_VERSION, QUESTIONS } from '../src/questions';
import type { PersonalIndex, PersonalIndices } from '../src/scoring/personal-indices';
import type { Profile } from '../src/types';
import { personalIndicesSection, personalIndicesView } from '../src/ui/personal-indices-view';

const index = (overrides: Partial<PersonalIndex> = {}): PersonalIndex => ({
  key: 'communication', title: 'Общение в паре', kind: 'resource', score: 75,
  lowLabel: 'Оставлять тему', highLabel: 'Обсуждать', explanation: 'Семь ситуаций общения.',
  answered: 7, total: 7, missingIds: [], mixed: false,
  evidence: Array.from({ length: 7 }, (_, n) => ({
    questionId: `communication-${n}`, topic: 'Общение', question: `Ситуация ${n + 1}`,
    option: 1, answer: `Выбранный ответ ${n + 1}`, points: 75,
  })), ...overrides,
});
const indices = (resources: PersonalIndex[] = [], preferences: PersonalIndex[] = []): PersonalIndices => ({
  version: 'personal-indices-v3', resources, preferences, strengths: [], attention: [],
});

describe('personal index graphs', () => {
  it('renders two broad spheres from fourteen actual sources and hides both after one omission in each', () => {
    const dialogue = ['reflect-03', 'attach-03', 'intimacy-03', 'conflict-response-01', 'reflect-01', 'conflict-repair-01', 'regul-08'];
    const sharedLife = ['life-08-r22', 'space-10', 'space-04', 'space-06', 'roles-06', 'living-06', 'leisure-06'];
    const profile: Profile = { name: 'Аня', bankVersion: BANK_VERSION,
      responses: Object.fromEntries([...dialogue, ...sharedLife].map(id => [id, answerFor(0)])),
    };
    const root = personalIndicesSection(QUESTIONS, profile)!;
    expect(root.querySelectorAll('[role="meter"]')).toHaveLength(2);
    expect([...root.querySelectorAll('[data-index]')].map(card => card.getAttribute('data-index'))).toEqual(['dialogue', 'shared_life']);
    expect(root.querySelector('[data-index-group="resources"] > h2')?.textContent).toBe('Диалог и контакт');
    expect(root.querySelector('[data-index-group="preferences"] > h2')?.textContent).toBe('Предпочтения в отношениях');
    for (const [key, sourceIds] of [['dialogue', dialogue], ['shared_life', sharedLife]] as const) {
      const card = root.querySelector(`[data-index="${key}"]`)!;
      expect(card.querySelector('.personal-index-count')?.textContent).toBe('Ситуаций: 7 из 7');
      expect([...card.querySelectorAll('[data-question-id]')].map(item => item.getAttribute('data-question-id'))).toEqual(sourceIds);
    }
    delete profile.responses[dialogue[0]];
    delete profile.responses[sharedLife[0]];
    expect(personalIndicesSection(QUESTIONS, profile)).toBeNull();
  });

  it('shows all three broad composites for a fully answered profile, with seven source answers each', () => {
    const profile: Profile = { name: 'Аня', bankVersion: BANK_VERSION,
      responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(0)])),
    };
    const root = personalIndicesSection(QUESTIONS, profile)!;
    expect(root.querySelectorAll('[role="meter"]')).toHaveLength(3);
    expect([...root.querySelectorAll('[data-index]')].map(card => card.getAttribute('data-index'))).toEqual(['dialogue', 'shared_life', 'close_circle']);
    const card = root.querySelector('[data-index="close_circle"]')!;
    expect(card.textContent).toContain('Участие в жизни близких');
    expect(card.closest('[data-index-group="preferences"]')).not.toBeNull();
    expect(card.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect([...card.querySelectorAll('[data-question-id]')].map(item => item.getAttribute('data-question-id'))).toEqual([
      'relatives-01-r22', 'relatives-06', 'relatives-07', 'relatives-08', 'budget-05', 'leisure-06', 'loyalty-04-r22',
    ]);
    expect(card.querySelector('.personal-index-count')?.textContent).toBe('Ситуаций: 7 из 7');
    expect(root.querySelector('.personal-index-highlights')?.textContent).not.toContain('Участие в жизни близких');
    delete profile.responses['budget-05'];
    const partial = personalIndicesSection(QUESTIONS, profile)!;
    expect(partial.querySelectorAll('[role="meter"]')).toHaveLength(2);
    expect(partial.querySelector('[data-index="close_circle"]')).toBeNull();
  });

  it('omits all numerical presentation when no sphere has seven distinct answered sources', () => {
    for (const small of [
      index({ total: 6 }), index({ answered: 6 }), index({ score: null }),
      index({ evidence: Array.from({ length: 7 }, () => index().evidence[0]) }),
    ]) {
      expect(personalIndicesView(indices([small]))).toBeNull();
    }
    const profile: Profile = { name: 'Аня', bankVersion: BANK_VERSION, responses: { 'reflect-03': answerFor(0) } };
    expect(personalIndicesSection(QUESTIONS, profile)).toBeNull();
  });

  it('binds a qualified sphere to its score, endpoints and selected answers without tiny contribution scores', () => {
    const root = personalIndicesView(indices([index()]))!;
    const card = root.querySelector('[data-index="communication"]')!;
    const meter = card.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('75');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-label')).toBe('Общение в паре');
    expect(card.querySelector<HTMLElement>('.personal-index-fill')?.style.width).toBe('75%');
    expect(card.querySelector('.personal-index-count')?.textContent).toContain('7 из 7');
    const evidence = card.querySelector('details')!;
    expect(evidence.open).toBe(false);
    expect(evidence.querySelectorAll('li')).toHaveLength(7);
    expect(evidence.textContent).toContain('Выбранный ответ 1');
    expect(evidence.querySelector('.personal-index-points')).toBeNull();
    expect(evidence.textContent).not.toContain('из 100');
    expect(root.querySelector('[data-index-group="preferences"]')).toBeNull();
    expect(root.textContent).not.toContain('Недостаточно ответов');
    expect(root.querySelector('.personal-index-method')?.textContent).toContain('семи');
  });

  it('omits small cards and filters stale highlights to displayed fully covered resources', () => {
    const eligible = index();
    const small = index({ key: 'requests', title: 'Старая малая шкала', total: 3, answered: 3 });
    const partial = index({ key: 'partial', title: 'Неполная сфера', total: 8, missingIds: ['missing'] });
    const preference = index({ key: 'preference', title: 'Предпочтение', kind: 'preference' });
    const data = indices([eligible, small, partial], [preference]);
    data.strengths = ['communication', 'requests', 'partial', 'preference', 'unknown'];
    data.attention = ['requests', 'partial', 'preference', 'unknown'];
    const root = personalIndicesView(data)!;
    expect(root.querySelectorAll('[data-index]')).toHaveLength(3);
    expect(root.querySelector('[data-index="requests"]')).toBeNull();
    const highlights = root.querySelector('.personal-index-highlights')!;
    expect(highlights.querySelectorAll('li')).toHaveLength(1);
    expect(highlights.textContent).toContain('Общение в паре');
    expect(highlights.querySelector('[data-highlight="attention"]')).toBeNull();
    expect(root.querySelector('.personal-index-attention')).toBeNull();
    expect(root.querySelector('[data-index-group="preferences"]')?.textContent).toContain('подписи у 0 и 100');
  });

  it('omits the empty resources group and its stale highlights', () => {
    const data = indices([], [index({ kind: 'preference' })]);
    data.strengths = ['unknown'];
    const root = personalIndicesView(data)!;
    expect(root.querySelector('[data-index-group="resources"]')).toBeNull();
    expect(root.querySelector('.personal-index-highlights')).toBeNull();
    expect(root.querySelector('[data-index-group="preferences"]')).not.toBeNull();
  });

  it('shows differing scenarios and renders unsafe evidence as text', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const mixed = index({ mixed: true });
    mixed.evidence[0] = { ...mixed.evidence[0], question: unsafe, answer: unsafe };
    const root = personalIndicesView(indices([mixed]))!;
    expect(root.querySelector('.personal-index-mixed')?.textContent).toBe('Зависит от ситуации');
    expect(root.querySelector('.personal-index-mixed-explanation')?.closest('details')).toBe(root.querySelector('.personal-index-evidence'));
    expect(root.textContent).toContain(unsafe);
    expect(root.querySelector('img,script')).toBeNull();
    expect(root.querySelector('.personal-index-method')?.hasAttribute('open')).toBe(false);
  });
});
