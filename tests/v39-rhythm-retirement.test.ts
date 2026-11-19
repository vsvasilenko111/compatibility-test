import { describe, expect, it } from 'vitest';
import baseline from '../research/blind/target-v20/v39-rhythm-retirement/baseline-bank-v38.json';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v39';
import { encode, decode } from '../src/codec/codec';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { unansweredIds } from '../src/ui/flow';
import { validateBank } from '../src/questions/validate';
import type { Profile } from '../src/types';

describe('retirement of the confusing weekly-plans question', () => {
  it('removes only rhythm-10 and preserves every other question and its order', () => {
    expect(QUESTIONS.some(q => q.id === 'rhythm-10')).toBe(false);
    expect(QUESTIONS).toEqual(baseline.questions.filter(q => q.id !== 'rhythm-10'));
    expect(CURRENT_IDS).toEqual(MANIFEST[38].filter(id => id !== 'rhythm-10'));
    expect(QUESTIONS).toHaveLength(117);
    expect(validateBank(QUESTIONS, CURRENT_IDS)).toEqual([]);
  });
  it('keeps the old answer readable without asking any new question', () => {
    const old: Profile = { name: 'Аня', bankVersion: 38,
      responses: Object.fromEntries(MANIFEST[38].map((id, i) => [id, answerFor(OPTION_VALUES[i % 5])])) };
    const restored = decode(encode(old, MANIFEST[38], FIRM[38]), MANIFEST, FIRM);
    expect(restored).toEqual(old);
    expect(restored.responses['rhythm-10']).toEqual(old.responses['rhythm-10']);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([]);
    const updated = decode(encode({ ...restored, bankVersion: BANK_VERSION }, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(updated.responses).not.toHaveProperty('rhythm-10');
    for (const id of CURRENT_IDS) expect(updated.responses[id]).toEqual(old.responses[id]);
    expect(Object.keys(updated.responses)).toHaveLength(117);
  });
});
