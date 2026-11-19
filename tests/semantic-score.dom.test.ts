// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { semanticRelationship, type SemanticRelationshipResult } from '../src/scoring/semantic-relationship';
import { resultScreen } from '../src/ui/screens/result';
import { compare } from '../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../src/questions/spheres';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { QUESTIONS } from '../src/questions';
import type { Profile, Question } from '../src/types';

vi.mock('../src/scoring/semantic-relationship', () => ({ semanticRelationship: vi.fn() }));
const qs: Question[] = [{ id: 'kids', block: 'relationship', sphere: 'kids', text: 'Планы о детях?',
  topic: 'Желание детей', left: 'нет', right: 'да', optional: false, split: 2,
  options: ['Не хочу детей', 'Скорее не хочу', 'Один ребёнок', 'Двое', 'Трое'] }];
const a: Profile = { name: 'Аня', bankVersion: 28, responses: { kids: answerFor(0) } };
const b: Profile = { name: 'Борис', bankVersion: 28, responses: { kids: answerFor(10) } };
const fixture = (patch: Partial<SemanticRelationshipResult> = {}): SemanticRelationshipResult => ({
  version: 'semantic-v1', percent: 80, rawPercent: 94.782,
  components: { plans: 98.124, actions: 75.3, orientation: 100, reactions: 100 },
  factors: { orientation: 1, reactions: 1 }, caps: [], unknownIds: [], provisional: false, ...patch,
});
function render(patch: Partial<SemanticRelationshipResult> = {}, metadata = true) {
  vi.mocked(semanticRelationship).mockReturnValue(fixture(patch));
  const raw = compare(qs, a, b);
  raw.relationship.percent = 94.782;
  raw.friendship.percent = 72.4;
  return resultScreen(a, b, raw, '#result', metadata ? qs : undefined);
}
beforeEach(() => vi.clearAllMocks());

describe('semantic main score presentation', () => {
  it.each([
    [49.4, '49%', 'Слабая база для длительных отношений'],
    [49.6, '50%', 'Не особо друг другу подходите по ответам'],
    [50, '50%', 'Не особо друг другу подходите по ответам'],
    [69.4, '69%', 'Не особо друг другу подходите по ответам'],
    [69.9, '70%', 'Хорошая база'],
    [70, '70%', 'Хорошая база'],
    [79.9, '80%', 'Отлично подходите по ответам'],
    [80, '80%', 'Отлично подходите по ответам'],
    [99.6, '99%', 'Отлично подходите по ответам'],
    [100, '100%', 'Ваша судьба'],
  ])('renders %s with a label consistent with the displayed number', (percent, shown, label) => {
    const root = render({ percent });
    expect(root.querySelector('.score.main .num')!.textContent).toBe(shown);
    expect(root.querySelector('.score.main .lvl')!.textContent).toBe(label);
    expect(root.querySelector('.poster-verdict')!.textContent).toBe(label);
    expect(root.querySelector('.score.second .num')!.textContent).toBe('72%');
    expect(root.querySelector('.score.second .lvl')!.textContent).toBe('заметное совпадение');
  });
  it('reserves fate and 100 for exact complete results', () => {
    const provisional = render({ percent: 100, provisional: true, unknownIds: ['kids'] });
    expect(provisional.querySelector('.score.main .num')!.textContent).toBe('99%');
    expect(provisional.querySelector('.poster-verdict')!.textContent).toBe('Отлично подходите по ответам');
    expect(provisional.querySelector('.semantic-provisional')!.textContent).toContain('предварительный');
    expect(provisional.querySelector('.semantic-provisional')!.textContent).toContain('не считаются плохими ответами');
    expect(render({ percent: null }).querySelector('.score.main .num')!.textContent).toBe('—');
    expect(render({ percent: null }).querySelector('.poster-verdict')!.textContent).toContain('Недостаточно данных');
  });
  it('explains components and untouched raw v28 in /100 units with scope and neutral wording', () => {
    const root = render({ provisional: true,
      components: { plans: 98.124, actions: 75.3, orientation: 100, reactions: null } });
    const text = root.querySelector('.explain')!.textContent!;
    expect(root.querySelector('.semantic-details')!.getAttribute('data-scoring-version')).toBe('semantic-v1');
    expect(text).toContain('Баллы показывают соответствие ваших ответов для длительных отношений.');
    expect(text).not.toContain('semantic-v1');
    expect(text).toContain('98,12 / 100');
    expect(text).toContain('75,3 / 100');
    expect(text).toContain('— / 100');
    expect(text).toContain('Исходный индекс v28: 94,78 / 100');
    expect(text).toContain('максимальное соответствие ответов');
    expect(text).toContain('не гарантия');
    expect(text).toContain('не оценка человека');
    expect(text).toContain('Сама тревожность не считается недостатком');
    expect(text).toContain('Карта сфер и «партнёр как друг» сохраняют исходный расчёт v28');
  });
  it('shows current categorical cap evidence separately from retired v25 warning', () => {
    const root = render({ percent: 50, caps: [{ id: 'kids', topic: 'Желание детей', reason: 'split', optionA: 1, optionB: 5, limit: 50 }] });
    const caps = root.querySelector('.plan-conflict-caps')!;
    expect(caps.textContent).toContain('Желание детей');
    expect(caps.textContent).toContain('Не хочу детей');
    expect(caps.textContent).toContain('Трое');
    expect(caps.textContent).toContain('50');
    expect(caps.textContent).toContain('не означает, что вы не сможете договориться');
    expect(root.querySelector('.goal-conflicts')).toBeNull();
  });
  it('keeps no-metadata rendering explicitly raw with old numeric rounding and verdict', () => {
    const root = render({}, false);
    expect(semanticRelationship).not.toHaveBeenCalled();
    expect(root.querySelector('.score.main .num')!.textContent).toBe('95%');
    expect(root.querySelector('.score.main .cap')!.textContent).toContain('совпадение ответов');
    expect(root.querySelector('.score.main .lvl')!.textContent).toBe('много совпадений');
    expect(root.querySelector('.semantic-details')).toBeNull();
    expect(root.querySelector('.poster-verdict')!.textContent).not.toContain('Отлично подходите');
  });
  it('integrates current-bank favorable, adverse and missing-answer calculations without altering raw maps', async () => {
    const actual = await vi.importActual<typeof import('../src/scoring/semantic-relationship')>('../src/scoring/semantic-relationship');
    vi.mocked(semanticRelationship).mockImplementation(actual.semanticRelationship);
    const favorable: Profile = { name: 'Аня', bankVersion: 28,
      responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(q.id === 'space-07' ? 7 : 0)])) };
    const raw = compare(QUESTIONS, favorable, favorable);
    const before = JSON.stringify(raw);
    const root = resultScreen(favorable, favorable, raw, '#result', QUESTIONS);
    expect(root.querySelector('.score.main .num')!.textContent).toBe('100%');
    expect(root.querySelector('.poster-verdict')!.textContent).toBe('Ваша судьба');
    expect(root.querySelector('.score.second .num')!.textContent).toBe(`${Math.round(raw.friendship.percent!)}%`);
    expect(root.querySelectorAll('.tile')).toHaveLength(raw.relationship.spheres.length);
    expect(JSON.stringify(raw)).toBe(before);
    const adverse = structuredClone(favorable);
    for (const id of ['space-07', 'conflict-response-01', 'conflict-repair-01', 'intimacy-03', 'conflicts-10', 'relatives-08']) {
      adverse.responses[id] = answerFor(id === 'space-07' ? 0 : OPTION_VALUES[4]);
    }
    const adverseRaw = compare(QUESTIONS, adverse, adverse);
    const low = resultScreen(adverse, adverse, adverseRaw, '#result', QUESTIONS);
    expect(low.querySelector('.score.main .num')!.textContent).toBe('43%');
    expect(low.querySelector('.poster-verdict')!.textContent).toBe('Слабая база для длительных отношений');
    expect(low.querySelector('.semantic-details')!.textContent).toContain(`Исходный индекс v28: ${compare(QUESTIONS, adverse, adverse, relationshipWeight, friendshipWeight).relationship.percent!.toLocaleString('ru-RU', {maximumFractionDigits:2})} / 100`);
    const incomplete = structuredClone(favorable);
    delete incomplete.responses['kids-02'];
    const partial = resultScreen(incomplete, favorable, compare(QUESTIONS, incomplete, favorable), '#result', QUESTIONS);
    expect(partial.querySelector('.score.main .num')!.textContent).toBe('99%');
    expect(partial.querySelector('.semantic-provisional')).not.toBeNull();
  });
});
