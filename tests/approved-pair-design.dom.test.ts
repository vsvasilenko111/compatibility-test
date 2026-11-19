// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerFor } from '../src/answer';
import { compare } from '../src/scoring/compare';
import { semanticRelationship, type SemanticRelationshipResult } from '../src/scoring/semantic-relationship';
import { resultScreen } from '../src/ui/screens/result';
import type { Profile, Question } from '../src/types';

vi.mock('../src/scoring/semantic-relationship', () => ({ semanticRelationship: vi.fn() }));
const qs: Question[] = [{ id: 'kids-02', block: 'relationship', sphere: 'kids', text: 'Дети?', topic: 'Дети', left: 'Нет', right: 'Да', optional: false }];
const a: Profile = { name: '<Аня>', bankVersion: 28, responses: { 'kids-02': answerFor(0) } };
const b: Profile = { name: 'Миша', bankVersion: 28, responses: { 'kids-02': answerFor(10) } };
function render(percent: number | null, provisional = false) {
  vi.mocked(semanticRelationship).mockReturnValue({
    version: 'semantic-v1', percent, rawPercent: 92,
    components: { plans: 100, actions: 100, orientation: 100, reactions: 100 },
    factors: { orientation: 1, reactions: 1 }, caps: [], unknownIds: [], provisional,
  } satisfies SemanticRelationshipResult);
  return resultScreen(a, b, compare(qs, a, b), '#result', qs, [], ['#personal-a', '#personal-b']);
}
beforeEach(() => vi.clearAllMocks());

describe('approved paired report presentation', () => {
  it.each([[100, false, '100%'], [100, true, '99%'], [99.8, false, '99%'], [50, false, '50%']] as const)(
    'keeps the dynamic ring consistent with the semantic display (%s, provisional %s)', (percent, provisional, shown) => {
      const root = render(percent, provisional);
      expect(root.querySelector('.score.main .score-visual .num')?.textContent).toBe(shown);
      expect(root.querySelector<HTMLElement>('.score.main')?.style.getPropertyValue('--score')).toBe(shown);
      expect(root.querySelector('.poster-story .poster-verdict')?.textContent).toBe(root.querySelector('.score.main .lvl')?.textContent);
      expect(root.querySelector('.semantic-provisional') !== null).toBe(provisional);
    });
  it('renders missing scores as an empty ring with a dash, without a fabricated numeric value', () => {
    const root = render(null);
    const score = root.querySelector<HTMLElement>('.score.main')!;
    expect(score.classList.contains('no-score')).toBe(true);
    expect(score.style.getPropertyValue('--score')).toBe('');
    expect(score.querySelector('.num')?.textContent).toBe('—');
    expect(score.querySelector('.unit')).toBeNull();
  });
  it('preserves named reports, personal routes and answers behind closed disclosures', () => {
    const root = render(50);
    expect(root.querySelector('h1')?.textContent).toBe('Ваше «мы» — в деталях.');
    expect(root.querySelector('.poster-names')?.textContent).toBe('<Аня>+Миша');
    expect(root.querySelector('.poster-names img')).toBeNull();
    expect([...root.querySelectorAll('.person-summary-card a')].map(a => a.getAttribute('href'))).toEqual(['#personal-a', '#personal-b']);
    const group = root.querySelector('details.answer-group')!;
    expect(group.hasAttribute('open')).toBe(false);
    expect(group.textContent).toContain('<Аня>');
    expect(group.textContent).toContain('Миша');
    expect(root.querySelector('.answers .explain:last-child')?.textContent).toContain('Все ответы — 1');
    expect(root.querySelector('.result-share input')?.getAttribute('value')).toBe('#result');
  });
});
