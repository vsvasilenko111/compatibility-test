// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as v33 from '../research/blind/target-v20/legacy-questions-v33';
import * as v34 from '../research/blind/target-v20/legacy-questions-v34';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v35';
import { validateBank } from '../src/questions/validate';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { semanticRelationship } from '../src/scoring/semantic-relationship';
import { sphereTiles, supportTopics } from '../src/ui/result-view';
import { unansweredIds } from '../src/ui/flow';
import { questionScreen } from '../src/ui/screens/question';
import { bothAnswered } from '../src/ui/answers-view';
import type { Profile, Question } from '../src/types';

const id = 'budget-funding-model-r35';
const options = ['Я полностью обеспечиваю пару', 'Партнёр полностью обеспечивает пару', 'Зарабатываем оба', 'Не закрепляем роли: они могут меняться'];
const funding = () => QUESTIONS.find(q => q.id === id)!;
const profile = (value: number): Profile => ({ name: 'Аня', bankVersion: BANK_VERSION, responses: { [id]: answerFor(value) } });

describe('v35 unordered funding model', () => {
  it('does not display categorical choices as numerical distance or opposite poles in the answer list', () => {
    const row = bothAnswered([funding()], profile(0), profile(7))[0];
    expect(row.labelA).toBe(options[0]);
    expect(row.labelB).toBe(options[3]);
    expect(row.diff).toBe(0);
    expect(row.opposite).toBe(false);
  });
  it('replaces only the withdrawn funding item and preserves ownership and the full 120-question order', () => {
    expect(BANK_VERSION).toBe(35);
    expect(QUESTIONS).toHaveLength(120);
    expect(CURRENT_IDS).toEqual(v34.CURRENT_IDS.map(old => old === 'budget-08-funding-r34' ? id : old));
    expect(QUESTIONS.filter(q => q.id !== id)).toEqual(v34.QUESTIONS.filter(q => q.id !== 'budget-08-funding-r34'));
    expect(QUESTIONS.find(q => q.id === 'budget-01-r34')).toEqual(v34.QUESTIONS.find(q => q.id === 'budget-01-r34'));
    expect(funding()).toMatchObject({ options, scored: false, answerKind: 'categorical' });
    expect(funding().text + options.join(' ')).not.toMatch(/мужчин|женщин/i);
  });

  it.each([33, 34] as const)('preserves decoded v%s answers and asks only the new contexts', version => {
    const oldBank = version === 33 ? v33 : v34;
    const old: Profile = { name: 'Аня', bankVersion: version,
      responses: Object.fromEntries(oldBank.CURRENT_IDS.map((key, i) => [key, answerFor(OPTION_VALUES[i % 5])])) };
    const restored = decode(encode(old, oldBank.CURRENT_IDS, oldBank.CURRENT_FIRM), MANIFEST, FIRM);
    expect(restored).toEqual(old);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(version === 33 ? ['budget-01-r34', id] : [id]);
    const filled: Profile = { ...restored, bankVersion: BANK_VERSION,
      responses: { ...restored.responses, 'budget-01-r34': answerFor(0), [id]: answerFor(7) } };
    const current = decode(encode(filled, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, current.responses)).toEqual([]);
    expect(Object.keys(current.responses)).toHaveLength(120);
    expect(current.responses[id]).toEqual(answerFor(7));
    expect(current.responses).not.toHaveProperty('budget-08-funding-r34');
    expect(current.responses).not.toHaveProperty('budget-08-r22');
  });

  it.each([0, 1, 2, 3])('renders precisely four choices and roundtrips choice %s at its existing codec value', index => {
    expect(funding()).toBeDefined();
    vi.useFakeTimers();
    try {
      const submitted = vi.fn();
      const root = questionScreen({ question: funding(), index: 0, total: 120, response: undefined, onBack: null, onSubmit: submitted });
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('.option')];
      expect(buttons.map(b => b.textContent)).toEqual(options);
      expect(root.querySelector('.scale')).toBeNull();
      buttons[index].click(); vi.runAllTimers();
      expect(submitted).toHaveBeenCalledWith(answerFor(OPTION_VALUES[index]));
      const p = profile(OPTION_VALUES[index]);
      expect(decode(encode(p, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM).responses[id]).toEqual(answerFor(OPTION_VALUES[index]));
    } finally { vi.useRealTimers(); }
  });

  it('excludes categorical answers from scores, maps and support/talk even for identical self-provider choices', () => {
    expect(funding()).toBeDefined();
    for (const other of [0, 3, 5, 7]) {
      const result = compare([funding()], profile(0), profile(other));
      expect(result.relationship.percent).toBeNull();
      expect(result.friendship.percent).toBeNull();
      expect(result.relationship.spheres).toEqual([]);
      expect(result.relationship.talkZones).toEqual([]);
      expect(result.relationship.redFlags).toEqual([]);
      expect(sphereTiles(result.relationship.spheres)).toEqual([]);
      expect(supportTopics(result.relationship)).toEqual([]);
    }
  });

  it('does not change any semantic result component when only either funding category changes', () => {
    expect(funding()).toBeDefined();
    const full: Profile = { ...profile(0), responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(0)])) };
    const expected = semanticRelationship(QUESTIONS, full, full);
    for (const value of [0, 3, 5, 7]) {
      const changed = { ...full, responses: { ...full.responses, [id]: answerFor(value) } };
      expect(semanticRelationship(QUESTIONS, full, changed)).toEqual(expected);
      expect(semanticRelationship(QUESTIONS, changed, full)).toEqual(expected);
    }
  });

  it('validates categorical metadata strictly while preserving five choices for ordered questions', () => {
    expect(funding()).toBeDefined();
    expect(validateBank([funding()], [id])).toEqual([]);
    const altered = (patch: object) => ({ ...funding(), ...patch }) as Question;
    expect(validateBank([altered({ scored: true })], [id]).length).toBeGreaterThan(0);
    expect(validateBank([altered({ answerKind: 'unknown' })], [id]).length).toBeGreaterThan(0);
    expect(validateBank([altered({ options: [...options, 'Пятый', 'Шестой'], right: 'Шестой' })], [id]).length).toBeGreaterThan(0);
    expect(validateBank([altered({ answerKind: undefined })], [id]).length).toBeGreaterThan(0);
  });
});
