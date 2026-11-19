// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as v33 from '../research/blind/target-v20/legacy-questions-v33';
import * as v34 from '../research/blind/target-v20/legacy-questions-v34';
import * as v35 from '../research/blind/target-v20/legacy-questions-v35';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v36';
import { validateBank } from '../src/questions/validate';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { semanticRelationship } from '../src/scoring/semantic-relationship';
import { unansweredIds } from '../src/ui/flow';
import { questionScreen } from '../src/ui/screens/question';
import { bothAnswered } from '../src/ui/answers-view';
import { sphereExplorer } from '../src/ui/sphere-explorer';
import type { Profile, Question } from '../src/types';

const id = 'budget-arrangement-r36';
const options = [
  'Оба зарабатывают и объединяют все доходы в общий бюджет; из него оплачиваются все расходы.',
  'Оба вносят часть своих доходов в общий бюджет, остальные деньги оставляют себе.',
  'Деньги раздельные: оба оплачивают общие расходы пропорционально своим доходам.',
  'Деньги раздельные: общие расходы делят поровну, независимо от разницы в доходах.',
  'Один партнёр полностью обеспечивает пару; доход второго, если он есть, остаётся у него.',
];
const question = () => QUESTIONS.find(q => q.id === id)!;
const profile = (value: number): Profile => ({ name: 'Аня', bankVersion: BANK_VERSION, responses: { [id]: answerFor(value) } });

describe('v36 unordered budget arrangement', () => {
  it('replaces both obsolete budget contexts with one question at the ownership position, preserving all other content', () => {
    expect(BANK_VERSION).toBe(36);
    expect(QUESTIONS).toHaveLength(119);
    const expected = v35.CURRENT_IDS.filter(old => old !== 'budget-funding-model-r35').map(old => old === 'budget-01-r34' ? id : old);
    expect(CURRENT_IDS).toEqual(expected);
    expect(QUESTIONS.filter(q => q.id !== id)).toEqual(v35.QUESTIONS.filter(q => !['budget-01-r34', 'budget-funding-model-r35'].includes(q.id)));
    expect(question()).toMatchObject({ text: 'Какой способ распределять деньги в паре вам ближе?', options, scored: false, answerKind: 'categorical' });
    expect(question().text + options.join(' ')).not.toMatch(/мужчин|женщин|родител|родствен|больше меня|меньше меня|больше партн|меньше партн/i);
    expect(options[4]).toContain('доход второго, если он есть, остаётся у него');
  });
  it.each([33, 34, 35] as const)('keeps raw v%s responses and asks exactly the one new question without aliases', version => {
    const bank = version === 33 ? v33 : version === 34 ? v34 : v35;
    const old: Profile = { name: 'Аня', bankVersion: version, responses: Object.fromEntries(bank.CURRENT_IDS.map((key, i) => [key, answerFor(OPTION_VALUES[i % 5])])) };
    const restored = decode(encode(old, bank.CURRENT_IDS, bank.CURRENT_FIRM), MANIFEST, FIRM);
    expect(restored).toEqual(old);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([id]);
    expect(restored.responses).not.toHaveProperty(id);
    for (const key of bank.CURRENT_IDS) expect(restored.responses[key]).toEqual(old.responses[key]);
    const filled = { ...restored, bankVersion: BANK_VERSION, responses: { ...restored.responses, [id]: answerFor(10) } };
    const current = decode(encode(filled, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, current.responses)).toEqual([]);
    expect(Object.keys(current.responses)).toHaveLength(119);
    expect(current.responses[id]).toEqual(answerFor(10));
    expect(current.responses).not.toHaveProperty('budget-01-r34');
    expect(current.responses).not.toHaveProperty('budget-funding-model-r35');
  });
  it.each([0, 1, 2, 3, 4])('renders all five exact unordered choices and roundtrips choice %s', index => {
    expect(question()).toBeDefined();
    vi.useFakeTimers();
    try {
      const submit = vi.fn();
      const root = questionScreen({ question: question(), index: 0, total: 119, response: undefined, onBack: null, onSubmit: submit });
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('.option')];
      expect(buttons.map(button => button.textContent)).toEqual(options);
      expect(root.querySelector('.scale')).toBeNull();
      buttons[index].click(); vi.runAllTimers();
      expect(submit).toHaveBeenCalledWith(answerFor(OPTION_VALUES[index]));
      expect(decode(encode(profile(OPTION_VALUES[index]), CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM).responses[id]).toEqual(answerFor(OPTION_VALUES[index]));
    } finally { vi.useRealTimers(); }
  });
  it('shows both category answers without ordinal distance, opposite poles or scoring effects, including first versus fifth', () => {
    expect(question()).toBeDefined();
    const row = bothAnswered([question()], profile(0), profile(10))[0];
    expect(row).toMatchObject({ labelA: options[0], labelB: options[4], diff: 0, opposite: false });
    const explorer = sphereExplorer([{ id: question().sphere, label: 'Бюджет', percent: 75, items: [] }], [question()], profile(0), profile(10));
    explorer.querySelector<HTMLButtonElement>('.tile')!.click();
    const disclosure = explorer.querySelector<HTMLElement>(`[data-question-id="${id}"]`)!;
    expect(disclosure.querySelector('.lvl')!.textContent).toBe('Без оценки');
    expect(disclosure.className).not.toMatch(/lvl-(same|close|apart|opposite)/);
    expect(disclosure.textContent).toContain(options[0]); expect(disclosure.textContent).toContain(options[4]);
    for (const value of OPTION_VALUES) {
      const result = compare([question()], profile(0), profile(value));
      expect(result.relationship.percent).toBeNull(); expect(result.friendship.percent).toBeNull();
      expect(result.relationship.spheres).toEqual([]); expect(result.relationship.redFlags).toEqual([]);
      expect(result.relationship.talkZones).toEqual([]); expect(result.relationship.superMatches).toEqual([]);
    }
  });
  it('does not affect existing main or friendship percentages or semantic components', () => {
    expect(question()).toBeDefined();
    const full: Profile = { ...profile(0), responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(0)])) };
    const expected = compare(QUESTIONS, full, full), semantic = semanticRelationship(QUESTIONS, full, full);
    for (const value of OPTION_VALUES) {
      const changed = { ...full, responses: { ...full.responses, [id]: answerFor(value) } };
      expect(compare(QUESTIONS, full, changed)).toEqual(expected);
      expect(semanticRelationship(QUESTIONS, full, changed)).toEqual(semantic);
      expect(semanticRelationship(QUESTIONS, changed, full)).toEqual(semantic);
    }
  });
  it('accepts four or five unscored categories while retaining strict ordered five-choice metadata', () => {
    expect(question()).toBeDefined();
    expect(validateBank([question()], [id])).toEqual([]);
    const patch = (changes: object) => ({ ...question(), ...changes }) as Question;
    expect(validateBank([patch({ options: options.slice(0, 4), right: options[3] })], [id])).toEqual([]);
    expect(validateBank([patch({ options: [...options, 'Шестая'], right: 'Шестая' })], [id]).length).toBeGreaterThan(0);
    expect(validateBank([patch({ scored: true })], [id]).length).toBeGreaterThan(0);
    expect(validateBank([patch({ answerKind: undefined, options: options.slice(0, 4), right: options[3] })], [id]).length).toBeGreaterThan(0);
  });
});
