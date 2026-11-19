import { describe, expect, it } from 'vitest';
import archive from '../research/blind/target-v20/v24-followup/deferred-questions.json';
import * as v23 from '../research/blind/target-v20/legacy-questions-v23';
import { BANK_VERSION, CURRENT_IDS, CURRENT_FIRM, FIRM, MANIFEST, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v24';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { resumeFor, unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

const retired = archive.questions.map(entry => entry.question.id);
const complete = (ids: string[], version: number, offset = 0): Profile => ({
  name: 'Аня', bankVersion: version,
  responses: Object.fromEntries(ids.map((id, i) => [id, answerFor(OPTION_VALUES[(i + offset) % 5])])),
});

describe('v24 reversible retirement', () => {
  it('archives exactly nine complete meanings and retains the other 125 unchanged', () => {
    expect(BANK_VERSION).toBe(24);
    expect(QUESTIONS).toHaveLength(125);
    expect(retired).toHaveLength(9);
    for (const entry of archive.questions) {
      expect(entry.question).toEqual(v23.QUESTIONS[entry.original_index]);
      expect(entry.question.options).toHaveLength(5);
      expect(CURRENT_IDS).not.toContain(entry.question.id);
    }
    expect([...CURRENT_IDS].sort()).toEqual(v23.CURRENT_IDS.filter(id => !retired.includes(id)).sort());
    for (const q of QUESTIONS) {
      expect(q).toEqual(v23.QUESTIONS.find(old => old.id === q.id));
      if (q.cross) expect(CURRENT_IDS).toContain(q.cross.id);
    }
    expect(QUESTIONS.filter(q => q.block === 'maturity')).toEqual(v23.QUESTIONS.filter(q => q.block === 'maturity'));
  });

  it('preserves every historical manifest through v23 and all five v23 answer positions', () => {
    for (let version = 1; version <= 23; version++) {
      expect(MANIFEST[version]).toEqual(v23.MANIFEST[version]);
      expect(FIRM[version] ?? []).toEqual(v23.FIRM[version] ?? []);
    }
    for (let offset = 0; offset < 5; offset++) {
      const old = complete(MANIFEST[23], 23, offset);
      const restored = decode(encode(old, MANIFEST[23], FIRM[23] ?? []), MANIFEST, FIRM);
      expect(restored).toEqual(old);
      expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([]);
      const progress = resumeFor({ name: old.name, responses: restored.responses, index: 134, inviterCode: null }, null, CURRENT_IDS)!;
      expect(progress.index).toBe(125);
      const upgraded = { ...restored, bankVersion: BANK_VERSION };
      const decoded = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
      expect(Object.keys(decoded.responses)).toHaveLength(125);
      for (const id of retired) expect(decoded.responses[id]).toBeUndefined();
      expect(compare(QUESTIONS, upgraded, upgraded)).toEqual(compare(QUESTIONS, decoded, decoded));
    }
  });

  it('ignores archived answers in compatibility and discussion outputs', () => {
    const a = complete(CURRENT_IDS, BANK_VERSION);
    const b = complete(CURRENT_IDS, BANK_VERSION, 2);
    const dirty = { ...a, responses: { ...a.responses, ...Object.fromEntries(retired.map(id => [id, answerFor(10)])) } };
    expect(compare(QUESTIONS, dirty, b)).toEqual(compare(QUESTIONS, a, b));
  });
});
