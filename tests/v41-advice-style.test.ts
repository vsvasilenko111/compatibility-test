import { describe, expect, it } from 'vitest';
import { QUESTIONS, BANK_VERSION, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../src/questions';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { compare } from '../src/scoring/compare';
import { semanticRelationship } from '../src/scoring/semantic-relationship';
import { divergences, bothAnswered } from '../src/ui/answers-view';
import { encode, decode } from '../src/codec/codec';
import { unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';
const id = 'honesty-02';
const profile = (choice: number): Profile => ({ name: 'Пример', bankVersion: BANK_VERSION,
  responses: Object.fromEntries(CURRENT_IDS.map(q => [q, answerFor(OPTION_VALUES[q === id ? choice : 0])])) });
describe('advice without a request describes style, not compatibility', () => {
  it('preserves all literal answers without a compatibility penalty for any pair of choices', () => {
    const baseline = profile(0);
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
      const pa = profile(a), pb = profile(b);
      expect(semanticRelationship(QUESTIONS, pa, pb)).toEqual(semanticRelationship(QUESTIONS, baseline, baseline));
      expect(compare(QUESTIONS, pa, pb)).toEqual(compare(QUESTIONS, baseline, baseline));
      expect(divergences(QUESTIONS, pa, pb).flatMap(g => g.rows).some(r => r.id === id)).toBe(false);
      const row = bothAnswered(QUESTIONS, pa, pb).find(r => r.id === id)!;
      const question = QUESTIONS.find(q => q.id === id)!;
      expect(row.labelA).toBe(question.options![a]);
      expect(row.labelB).toBe(question.options![b]);
    }
  });
  it('keeps complete v40 invitations readable with no new answers required', () => {
    const old = { ...profile(1), bankVersion: 40 };
    const decoded = decode(encode(old, MANIFEST[40], FIRM[40] ?? []), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, decoded.responses)).toEqual([]);
    const updated = decode(encode({ ...decoded, bankVersion: BANK_VERSION }, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(updated.responses).toEqual(old.responses);
  });
});
