import { describe, expect, it } from 'vitest';
import frozenBank from '../research/blind/target-v20/score-resolution/candidate-bank-v27.json';
import { BANK_VERSION, COMPATIBLE_SINCE, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v28';
import { PRIORITY_SPHERES, relationshipWeight, friendshipWeight } from '../src/questions/spheres';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { unansweredIds, resumeFor } from '../src/ui/flow';
import { relationshipScore } from '../research/blind/target-v20/iterations/I010-sport-source-input/candidate';
import type { Profile, Question } from '../src/types';

const legacy = frozenBank.questions as Question[];
const legacyIds = legacy.map(q => q.id);
const historicalManifest: Record<number, string> = {1:'4996678f1cf3f524',2:'13c7cd087a376a7d',3:'cb12a5b7e7e69c8e',4:'a7af67a657c0f442',5:'7b772a9d07a8dfd2',6:'213e34fd47246871',7:'6bff0e5b56b3580',8:'5bf441bd8158cf50',9:'a2de69103bbb7ea1',10:'1e3a8f8e6c18e31a',11:'fbb94c19129827ad',12:'ed5c3fa1c1da4572',13:'14164b4dc51c4514',14:'9b079f811b0b0c48',15:'a2985f7cf5c8b428',16:'2ce1997d15d9ca70',17:'5c6b5a92272df3a0',18:'be52e11c69a1aee1',19:'be52e11c69a1aee1',20:'5af4ea6aeb601c35',21:'682c2a002baa28cb',22:'72026163fdd1ecb3',23:'aff71827768da857',24:'d9958cfb8f1a4407',25:'b5d4cd4f6986125',26:'d9958cfb8f1a4407',27:'57a3b9235607daae'};
const historicalFirm: Record<number, string> = {9:'3974f5cad495103f',10:'3974f5cad495103f',11:'3974f5cad495103f',12:'8583d3c8b5bcb346',13:'8583d3c8b5bcb346',14:'88d6cabe4b19d2f',15:'88d6cabe4b19d2f',16:'dfe25c045f8f4bc9',17:'af585185e40a89d7',18:'af585185e40a89d7',19:'9612b07b5ecb5a5',20:'9612b07b5ecb5a5',21:'9612b07b5ecb5a5',22:'9612b07b5ecb5a5',23:'9612b07b5ecb5a5',24:'9612b07b5ecb5a5',25:'9612b07b5ecb5a5',26:'9612b07b5ecb5a5',27:'9612b07b5ecb5a5'};
const fingerprint = (ids: string[]) => {
  let h = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(JSON.stringify(ids))) h = BigInt.asUintN(64, (h ^ BigInt(byte)) * 1099511628211n);
  return h.toString(16);
};
const complete = (ids: string[], version: number, offset = 0): Profile => ({
  name: 'Аня', bankVersion: version,
  responses: Object.fromEntries(ids.map((id, i) => [id, answerFor(OPTION_VALUES[(i + offset) % 5])])),
  priorities: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [PRIORITY_SPHERES[(i + offset * 3) % PRIORITY_SPHERES.length].id, 'top' as const])),
});
const fixture = (answers: Record<string, number>): Profile => ({ name: 'Пример', bankVersion: 27,
  responses: Object.fromEntries(Object.entries(answers).map(([id, n]) => [id, answerFor(OPTION_VALUES[n - 1])])),
});
const liveCompare = (a: Profile, b: Profile) => compare(QUESTIONS, a, b, relationshipWeight, friendshipWeight);

describe('v28 local I010 prototype release', () => {
  it('preserves all 123 question meanings, options, IDs and order with exactly three relationship-only rules', () => {
    expect(BANK_VERSION).toBe(28);
    expect(COMPATIBLE_SINCE).toBe(18);
    expect(QUESTIONS).toHaveLength(123);
    expect(CURRENT_IDS).toEqual(legacyIds);
    expect(new Set(CURRENT_IDS).size).toBe(123);
    expect(QUESTIONS.map(({ relationshipRule: _rule, ...q }) => q)).toEqual(legacy);
    expect(QUESTIONS.filter(q => q.relationshipRule).map(q => [q.id, q.relationshipRule])).toEqual([
      ['life-01', { kind: 'input_only' }],
      ['relationship-goal-01', { kind: 'goal_direction', levels: [1, .75, .5, .25, 0] }],
      ['attach-01', { kind: 'closeness_cross', sourceId: 'attach-03', sourceLevels: [0, 0, 0, 0, 1], sphere: 'conflicts' }],
    ]);
    for (const q of QUESTIONS) {
      expect(q.options, q.id).toHaveLength(5);
      expect(q.optional, q.id).toBe(false);
      if (q.cross) expect(CURRENT_IDS, q.id).toContain(q.cross.id);
      if (q.relationshipRule?.kind === 'closeness_cross') expect(CURRENT_IDS).toContain(q.relationshipRule.sourceId);
    }
  });

  it('keeps every historical manifest and firm table unchanged and decodes versions 1 through 27', () => {
    for (let version = 1; version <= 27; version++) {
      expect(fingerprint(MANIFEST[version]), `manifest ${version}`).toBe(historicalManifest[version]);
      expect(fingerprint(FIRM[version] ?? []), `firm ${version}`).toBe(historicalFirm[version] ?? fingerprint([]));
      const old = complete(MANIFEST[version], version);
      expect(decode(encode(old, MANIFEST[version], FIRM[version] ?? []), MANIFEST, FIRM)).toEqual(old);
    }
  });

  it('retains every v27 answer and five priorities at all five option positions without requesting new answers', () => {
    for (let offset = 0; offset < 5; offset++) {
      const old = complete(legacyIds, 27, offset);
      const restored = decode(encode(old, legacyIds, FIRM[27] ?? []), MANIFEST, FIRM);
      expect(restored).toEqual(old);
      expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([]);
      expect(resumeFor({ name: old.name, responses: restored.responses, index: 123, inviterCode: null }, null, CURRENT_IDS)?.index).toBe(123);
      const upgraded = { ...restored, bankVersion: BANK_VERSION };
      const roundTrip = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
      expect(roundTrip).toEqual(upgraded);
      expect(Object.keys(roundTrip.responses)).toHaveLength(123);
      expect(Object.values(roundTrip.priorities ?? {})).toEqual(Array(5).fill('top'));
      expect(liveCompare(old, old)).toEqual(liveCompare(roundTrip, roundTrip));
    }
  });

  it('matches the frozen I010 numeric algorithm across five complete answer patterns and different priorities', () => {
    const before = JSON.stringify([QUESTIONS, legacy]);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const a = complete(legacyIds, 27, i), b = complete(legacyIds, 27, j);
      const profilesBefore = JSON.stringify([a, b]);
      const actual = liveCompare(a, b), baseline = compare(legacy, a, b, relationshipWeight, friendshipWeight);
      expect(actual.relationship.percent).toBeCloseTo(relationshipScore(legacy, a, b)!, 12);
      expect(actual.friendship).toEqual(baseline.friendship);
      expect(actual.maturity).toEqual(baseline.maturity);
      expect(actual.resources).toEqual(baseline.resources);
      expect(actual.relationship.percent).toBe(liveCompare(b, a).relationship.percent);
      expect(JSON.stringify([a, b])).toBe(profilesBefore);
    }
    expect(JSON.stringify([QUESTIONS, legacy])).toBe(before);
  });

  it('pins sparse goal, source-only sport and closeness fixtures against the independent research view', () => {
    const cases: [Record<string, number>, Record<string, number>][] = [
      [{ 'relationship-goal-01': 5 }, { 'relationship-goal-01': 5 }],
      [{ 'relationship-goal-01': 3 }, { 'relationship-goal-01': 1 }],
      [{ 'life-01': 1 }, { 'life-01': 5 }],
      [{ 'life-01': 1, 'life-02': 1 }, { 'life-01': 5, 'life-02': 1 }],
      [{ 'life-02': 5 }, { 'life-01': 5, 'life-02': 1 }],
      [{ 'attach-01': 5, 'attach-03': 4 }, { 'attach-01': 5, 'attach-03': 4 }],
      [{ 'attach-01': 5, 'attach-03': 5 }, { 'attach-01': 5, 'attach-03': 5 }],
      [{ 'attach-01': 5 }, { 'attach-01': 5, 'attach-03': 5 }],
    ];
    const expected = [0, null, null, 100, null, 100, 0, null];
    cases.forEach(([aa, bb], i) => {
      const a = fixture(aa), b = fixture(bb);
      expect(relationshipScore(legacy, a, b)).toBe(expected[i]);
      expect(liveCompare(a, b).relationship.percent).toBe(expected[i]);
      expect(liveCompare(b, a).relationship.percent).toBe(expected[i]);
    });
  });
});
