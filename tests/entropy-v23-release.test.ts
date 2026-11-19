import { describe, expect, it } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { decode, encode } from '../src/codec/codec';
import { BANK_VERSION, COMPATIBLE_SINCE, CURRENT_FIRM, CURRENT_IDS, FIRM, MANIFEST, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v23';
import * as v22 from '../research/blind/target-v20/legacy-questions-v22';
import { compare } from '../src/scoring/compare';
import { resumeFor, unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

const retired = ['life-07', 'humor-08'];
const retained = v22.QUESTIONS.filter(q => !retired.includes(q.id));
const profile = (responses: Profile['responses'], bankVersion = BANK_VERSION): Profile => ({ name: 'Аня', bankVersion, responses });
const complete = (ids: string[], offset = 0, version = BANK_VERSION): Profile => profile(
  Object.fromEntries(ids.map((id, i) => [id, answerFor(OPTION_VALUES[(i + offset) % 5])])), version,
);

describe('v23 retirement release', () => {
  it('retires exactly two questions and preserves every retained meaning and scoring field', () => {
    expect(BANK_VERSION).toBe(23);
    expect(COMPATIBLE_SINCE).toBe(v22.COMPATIBLE_SINCE);
    expect(QUESTIONS).toHaveLength(134);
    expect(QUESTIONS).toEqual(retained);
    expect(CURRENT_IDS).toEqual(retained.map(q => q.id));
    expect(v22.CURRENT_IDS.filter(id => !CURRENT_IDS.includes(id))).toEqual(retired);
    expect(MANIFEST[22]).toEqual(v22.QUESTIONS.map(q => q.id));
    expect(MANIFEST[22]).toHaveLength(136);
    expect(CURRENT_FIRM).toEqual([]);
    for (const q of QUESTIONS) {
      expect(q.options, q.id).toHaveLength(5);
      expect(q.optional, q.id).toBe(false);
      if (q.cross) expect(CURRENT_IDS, q.id).toContain(q.cross.id);
    }
    // None of the emotional-maturity or habit-source questions is retired.
    expect(QUESTIONS.filter(q => q.block === 'maturity')).toEqual(v22.QUESTIONS.filter(q => q.block === 'maturity'));
    expect(QUESTIONS.filter(q => q.cross)).toEqual(v22.QUESTIONS.filter(q => q.cross));
  });

  it.each(Array.from({ length: 22 }, (_, i) => i + 1))('preserves historical v%i links across all five answer positions', version => {
    const ids = MANIFEST[version], firm = FIRM[version] ?? [];
    expect(ids).toEqual(v22.MANIFEST[version]);
    expect(firm).toEqual(v22.FIRM[version] ?? []);
    for (let offset = 0; offset < 5; offset++) {
      const old = complete(ids, offset, version);
      for (const id of firm) old.responses[id] = { ...answerFor(OPTION_VALUES[offset]), firm: true };
      expect(decode(encode(old, ids, firm), MANIFEST, FIRM)).toEqual(old);
    }
  });

  it('resumes a complete v22 link with no missing answers and omits retired answers on v23 encoding', () => {
    const old = complete(MANIFEST[22], 0, 22);
    const restored = decode(encode(old, MANIFEST[22], FIRM[22] ?? []), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([]);
    const resumed = resumeFor({ name: old.name, responses: restored.responses, index: 136, inviterCode: null }, null, CURRENT_IDS)!;
    expect(resumed.index).toBe(134);
    const upgraded = profile(restored.responses);
    const decoded = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(decoded.bankVersion).toBe(23);
    expect(unansweredIds(CURRENT_IDS, decoded.responses)).toEqual([]);
    expect(Object.keys(decoded.responses)).toHaveLength(134);
    for (const id of retired) expect(decoded.responses[id]).toBeUndefined();
    for (const id of CURRENT_IDS) expect(decoded.responses[id]).toEqual(old.responses[id]);
    expect(compare(QUESTIONS, upgraded, upgraded)).toEqual(compare(QUESTIONS, decoded, decoded));
  });

  it('ignores retired orphan answers in compatibility, maturity and resources', () => {
    for (let offset = 0; offset < 5; offset++) {
      const a = complete(CURRENT_IDS, offset);
      const b = complete(CURRENT_IDS, 4 - offset);
      const dirtyA = profile({ ...a.responses, ...Object.fromEntries(retired.map(id => [id, answerFor(10)])) });
      const dirtyB = profile({ ...b.responses, ...Object.fromEntries(retired.map(id => [id, answerFor(0)])) });
      expect(compare(QUESTIONS, dirtyA, dirtyB)).toEqual(compare(QUESTIONS, a, b));
      expect(compare(QUESTIONS, a, b)).toEqual(compare(retained, a, b));
    }
  });
});
