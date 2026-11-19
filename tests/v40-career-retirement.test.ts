import { describe, expect, it } from 'vitest';
import * as old from '../research/blind/target-v20/legacy-questions-v39';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../src/questions';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { unansweredIds } from '../src/ui/flow';
import { semanticRelationship } from '../src/scoring/semantic-relationship';
import { compare } from '../src/scoring/compare';
import { personalIndices } from '../src/scoring/personal-indices';
import { relationshipWeight, friendshipWeight } from '../src/questions/spheres';
import type { Profile } from '../src/types';

const removed = ['career-07', 'career-06'];
const profile = (offset: number): Profile => ({ name: 'Пример', bankVersion: 39,
  responses: Object.fromEntries(old.CURRENT_IDS.map((id, i) => [id, answerFor(OPTION_VALUES[(i + offset) % 5])])),
  priorities: { career: 'top', budget: 'top', kids: 'top', conflicts: 'top', loyalty: 'top' },
});
describe('v40 retirement of two display-only career questions', () => {
  it('removes exactly the requested records and preserves all remaining wording and order', () => {
    expect(BANK_VERSION).toBe(40);
    expect(QUESTIONS).toHaveLength(115);
    expect(QUESTIONS).toEqual(old.QUESTIONS.filter(q => !removed.includes(q.id)));
    expect(CURRENT_IDS).toEqual(old.CURRENT_IDS.filter(id => !removed.includes(id)));
    expect(QUESTIONS.filter(q => q.sphere === 'career')).toHaveLength(2);
  });
  it('keeps old responses readable and needs no new answers', () => {
    const p = profile(0);
    const restored = decode(encode(p, old.CURRENT_IDS, old.CURRENT_FIRM), MANIFEST, FIRM);
    expect(restored).toEqual(p);
    expect(MANIFEST[39]).toEqual(old.CURRENT_IDS);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual([]);
    const current = decode(encode({ ...restored, bankVersion: BANK_VERSION }, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(Object.keys(current.responses)).toHaveLength(115);
    for (const id of removed) expect(current.responses).not.toHaveProperty(id);
    for (const id of CURRENT_IDS) expect(current.responses[id]).toEqual(p.responses[id]);
  });
  it('preserves both compatibility percentages and the three personal indices', () => {
    for (let i = 0; i < 5; i++) {
      const a = profile(i), b = profile((i + 2) % 5);
      expect(semanticRelationship(QUESTIONS, a, b)).toEqual(semanticRelationship(old.QUESTIONS, a, b));
      expect(compare(QUESTIONS, a, b, relationshipWeight, friendshipWeight))
        .toEqual(compare(old.QUESTIONS, a, b, relationshipWeight, friendshipWeight));
      expect(personalIndices(QUESTIONS, a)).toEqual(personalIndices(old.QUESTIONS, a));
    }
  });
});
