import { describe, it, expect } from 'vitest';
import { BANK_VERSION, COMPATIBLE_SINCE, QUESTIONS, MANIFEST, FIRM, CURRENT_IDS, CURRENT_FIRM } from '../research/blind/target-v20/legacy-questions-v20';
import legacyBank from '../research/blind/target-v20/legacy-bank-v19.json';
import { answerFor } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { unansweredIds, resumeFor } from '../src/ui/flow';
import type { Profile } from '../src/types';

const goalId = 'relationship-goal-01';

describe('new relationship goal question and old links', () => {
  it('adds one required five-option question in a new bank version', () => {
    expect(BANK_VERSION).toBe(20);
    expect(QUESTIONS).toHaveLength(137);
    const q = QUESTIONS.find(q => q.id === goalId)!;
    expect(q.text).toBe('Каких отношений вы сейчас хотите?');
    expect(q.options).toHaveLength(5);
    expect(q.block).toBe('relationship');
    expect(q.sphere).toBe('loyalty');
    expect(q.optional).toBe(false);
    expect(q.firm).toBeUndefined();
  });

  it('keeps every published v19 question intact', () => {
    for (const q of legacyBank.questions) expect(QUESTIONS.find(current => current.id === q.id)).toEqual(q);
    expect(MANIFEST[19]).toEqual(legacyBank.questions.map(q => q.id));
    expect(COMPATIBLE_SINCE).toBeLessThanOrEqual(19);
  });

  it('decodes an old link and requires only the new answer', () => {
    const old: Profile = { name: 'Аня', bankVersion: 19,
      responses: Object.fromEntries(MANIFEST[19].map(id => [id, answerFor(3)])) };
    const restored = decode(encode(old, MANIFEST[19], FIRM[19] ?? []), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([goalId]);
    const progress = resumeFor({ name: old.name, responses: restored.responses, index: 136, inviterCode: null }, null, CURRENT_IDS)!;
    expect(CURRENT_IDS[progress.index]).toBe(goalId);
    const upgraded: Profile = { ...restored, bankVersion: BANK_VERSION,
      responses: { ...restored.responses, [goalId]: answerFor(7) } };
    const roundTrip = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(roundTrip.responses).toEqual(upgraded.responses);
    expect(unansweredIds(CURRENT_IDS, roundTrip.responses)).toEqual([]);
  });
});
