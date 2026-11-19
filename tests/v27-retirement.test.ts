import { describe, expect, it } from 'vitest';
import * as v26 from '../research/blind/target-v20/legacy-questions-v26';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v27';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';
const removed = ['space-02', 'space-03'];
describe('v27 requested question retirement', () => {
  it('keeps training and restores all other meanings exactly while retiring only the requested two', () => {
    expect(BANK_VERSION).toBe(27);
    expect(QUESTIONS).toHaveLength(123);
    expect(QUESTIONS).toEqual(v26.QUESTIONS.filter(q => !removed.includes(q.id)));
    expect(QUESTIONS.find(q => q.id === 'life-01')).toEqual(v26.QUESTIONS.find(q => q.id === 'life-01'));
    expect(MANIFEST[26]).toEqual(v26.CURRENT_IDS);
  });
  it('preserves all old answers and ignores retired responses when upgrading a complete v26 link', () => {
    for (let offset = 0; offset < 5; offset++) {
      const old: Profile = { name: 'Аня', bankVersion: 26, responses: Object.fromEntries(v26.CURRENT_IDS.map((id, i) => [id, answerFor(OPTION_VALUES[(i + offset) % 5])])) };
      const restored = decode(encode(old, MANIFEST[26], FIRM[26] ?? []), MANIFEST, FIRM);
      expect(restored).toEqual(old);
      expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([]);
      const upgraded = { ...restored, bankVersion: BANK_VERSION };
      const clean = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
      expect(Object.keys(clean.responses)).toHaveLength(123);
      expect(removed.every(id => clean.responses[id] === undefined)).toBe(true);
      expect(compare(QUESTIONS, upgraded, upgraded)).toEqual(compare(QUESTIONS, clean, clean));
    }
  });
});
