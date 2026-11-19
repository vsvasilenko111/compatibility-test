import { describe, expect, it } from 'vitest';
import baseline from '../research/blind/target-v20/full-review-v22/baseline-bank-v21.json';
import decisions from '../research/blind/target-v20/full-review-v22/applied-changes.json';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { decode, encode } from '../src/codec/codec';
import { BANK_VERSION, CURRENT_FIRM, CURRENT_IDS, FIRM, MANIFEST, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v22';
import { compare } from '../src/scoring/compare';
import { resumeFor, unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

const replacements = Object.entries(decisions.id_replacements);
const oldIds = replacements.map(([old]) => old);
const newIds = replacements.map(([, current]) => current);
const profile = (responses: Profile['responses'], version = BANK_VERSION): Profile => ({ name: 'Аня', bankVersion: version, responses });
const complete = (): Profile => profile(Object.fromEntries(CURRENT_IDS.map(id => [id, answerFor(0)])));

describe('frozen v22 release and compatibility', () => {
  it('ships 136 mandatory five-answer questions with valid habit references', () => {
    expect(BANK_VERSION).toBe(22);
    expect(QUESTIONS).toHaveLength(136);
    expect(new Set(CURRENT_IDS).size).toBe(136);
    expect(CURRENT_IDS).toEqual(QUESTIONS.map(q => q.id));
    expect(replacements).toHaveLength(20);
    for (const q of QUESTIONS) {
      expect(q.options, q.id).toHaveLength(5);
      expect(q.optional, q.id).toBe(false);
      if (q.cross) {
        expect(CURRENT_IDS, q.id).toContain(q.cross.id);
        expect(q.cross.level, q.id).toHaveLength(5);
      }
    }
    for (const [old, current] of replacements) {
      expect(CURRENT_IDS).not.toContain(old);
      expect(CURRENT_IDS).toContain(current);
    }
    expect(QUESTIONS.find(q => q.id === 'home-08')?.cross?.id).toBe('life-12-r22');
    expect(QUESTIONS.find(q => q.id === 'home-09')?.cross?.id).toBe('life-13-r22');
  });

  it.each(Array.from({ length: 21 }, (_, i) => i + 1))('roundtrips every historical answer and firm bit in v%i', version => {
    const ids = MANIFEST[version], firm = FIRM[version] ?? [];
    expect(ids).toBeDefined();
    const old = profile(Object.fromEntries(ids.map((id, i) => [id, {
      ...answerFor(OPTION_VALUES[i % 5]), ...(firm.includes(id) ? { firm: true } : {}),
    }])), version);
    expect(decode(encode(old, ids, firm), MANIFEST, FIRM)).toEqual(old);
  });

  it('preserves the frozen v21 manifest and asks exactly the 20 changed meanings', () => {
    expect(MANIFEST[21]).toEqual(baseline.questions.map(q => q.id));
    const old = profile(Object.fromEntries(MANIFEST[21].map((id, i) => [id, answerFor(OPTION_VALUES[i % 5])])), 21);
    const restored = decode(encode(old, MANIFEST[21], FIRM[21] ?? []), MANIFEST, FIRM);
    const missing = CURRENT_IDS.filter(id => newIds.includes(id));
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(missing);
    expect(missing).toHaveLength(20);
    const resumed = resumeFor({ name: old.name, responses: restored.responses, index: 136, inviterCode: null }, null, CURRENT_IDS)!;
    expect(CURRENT_IDS[resumed.index]).toBe(missing[0]);
    const upgraded = profile({ ...restored.responses, ...Object.fromEntries(missing.map(id => [id, answerFor(3)])) });
    const decoded = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, decoded.responses)).toEqual([]);
    for (const id of oldIds) expect(decoded.responses[id]).toBeUndefined();
    for (const id of CURRENT_IDS.filter(id => !newIds.includes(id))) {
      expect(decoded.responses[id]).toEqual(old.responses[id]);
    }
    expect(compare(QUESTIONS, upgraded, upgraded)).toEqual(compare(QUESTIONS, decoded, decoded));
  });

  it('ignores every retired answer when live scores and resources are calculated', () => {
    const clean = complete();
    const dirty = profile({ ...clean.responses, ...Object.fromEntries(oldIds.map(id => [id, answerFor(10)])) });
    expect(compare(QUESTIONS, dirty, dirty)).toEqual(compare(QUESTIONS, clean, clean));
    const withoutNewAnswers = profile(Object.fromEntries(CURRENT_IDS.filter(id => !newIds.includes(id)).map(id => [id, answerFor(0)])));
    const orphanOnly = profile({ ...withoutNewAnswers.responses, ...Object.fromEntries(oldIds.map(id => [id, answerFor(10)])) });
    expect(compare(QUESTIONS, orphanOnly, orphanOnly)).toEqual(compare(QUESTIONS, withoutNewAnswers, withoutNewAnswers));
  });

  it('uses new nicotine answers rather than orphan habit answers for partner tolerance', () => {
    for (const [habit, tolerance] of [['life-12-r22', 'home-08'], ['life-13-r22', 'home-09']]) {
      const qs = QUESTIONS.filter(q => q.id === habit || q.id === tolerance);
      const oldHabit = habit.replace('-r22', '');
      const nonSmoker = profile({ [habit]: answerFor(0), [oldHabit]: answerFor(10), [tolerance]: answerFor(10) });
      const smoker = profile({ [habit]: answerFor(10), [oldHabit]: answerFor(0), [tolerance]: answerFor(10) });
      expect(compare(qs, nonSmoker, nonSmoker).relationship.percent).toBe(100);
      expect(compare(qs, smoker, smoker).relationship.percent).toBe(0);
    }
  });

  it('retains the silence discussion through the renamed past-question key', () => {
    const a = profile({ 'attach-01': answerFor(0), 'trauma-06-r22': answerFor(10), 'space-06': answerFor(0) });
    const b = profile({ 'attach-01': answerFor(0), 'space-06': answerFor(10) });
    const result = compare(QUESTIONS, a, b);
    expect(result.maturity?.talks.map(t => t.key)).toContain('silence');
    expect(compare(QUESTIONS, profile({ 'trauma-06-r22': answerFor(10) }), profile({ 'trauma-06-r22': answerFor(10) })).maturity).toBeNull();
  });
});
