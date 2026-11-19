// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import v24 from '../research/blind/target-v20/v24-followup/candidate-bank-v24.json';
import v25 from '../research/blind/target-v20/v25-update/candidate-bank-v25.json';
import { BANK_VERSION, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v26';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { semanticRelationship } from '../src/scoring/semantic-relationship';
import { relationshipWeight, friendshipWeight } from '../src/questions/spheres';
import { resultScreen } from '../src/ui/screens/result';
import { unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

describe('v26 rollback of the v25 package', () => {
  it('restores the complete v24 question meanings and order', () => {
    expect(BANK_VERSION).toBe(26);
    expect(QUESTIONS).toEqual(v24.questions);
    expect(QUESTIONS).toHaveLength(125);
    expect(MANIFEST[24]).toEqual(v24.questions.map(q => q.id));
    expect(MANIFEST[25]).toEqual(v25.questions.map(q => q.id));
  });

  it('keeps all v24 answers and asks v25 links for only the three original meanings', () => {
    for (const version of [24, 25]) {
      const old: Profile = { name: 'Аня', bankVersion: version, responses: Object.fromEntries(MANIFEST[version].map((id, i) => [id, answerFor(OPTION_VALUES[i % 5])])) };
      const decoded = decode(encode(old, MANIFEST[version], FIRM[version] ?? []), MANIFEST, FIRM);
      expect(decoded).toEqual(old);
      expect(unansweredIds(CURRENT_IDS, decoded.responses)).toEqual(version === 24 ? [] : ['life-01', 'life-02', 'intimacy-02']);
      const supplied = { ...decoded, bankVersion: BANK_VERSION, responses: { ...decoded.responses,
        'life-01': answerFor(3), 'life-02': answerFor(7), 'intimacy-02': answerFor(5),
      } };
      const restored = decode(encode(supplied, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
      expect(Object.keys(restored.responses)).toHaveLength(125);
      expect(compare(QUESTIONS, supplied, supplied)).toEqual(compare(QUESTIONS, restored, restored));
    }
  });

  it('keeps restored question meanings and raw control while applying the current semantic display', () => {
    const best = Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(OPTION_VALUES[q.behaviorLevels ? q.behaviorLevels.indexOf(Math.max(...q.behaviorLevels)) : 0]) ]));
    const a: Profile = { name: 'Первый', bankVersion: BANK_VERSION, responses: { ...best, 'kids-01': answerFor(10), 'kids-02': answerFor(0), 'kids-timing-01-r22': answerFor(0) } };
    const b: Profile = { ...a, name: 'Второй', responses: { ...best, 'kids-02': answerFor(10), 'kids-timing-01-r22': answerFor(3) } };
    const result = compare(QUESTIONS, a, b, relationshipWeight, friendshipWeight);
    expect(result).not.toHaveProperty('goalConflicts');
    const screen = resultScreen(a, b, result, 'https://example.test/#r.a.b', QUESTIONS);
    expect(screen.querySelector('.goal-conflicts')).toBeNull();
    expect(screen.querySelector('.score.main .cap')!.textContent).not.toBe('общее совпадение ответов');
    const semantic = semanticRelationship(QUESTIONS, a, b);
    expect(semantic.percent).toBe(50);
    expect(screen.querySelector('.score.main .num')!.textContent).toBe('50%');
    expect(screen.querySelector('.semantic-details')!.textContent).toContain(`Исходный индекс v28: ${semantic.rawPercent!.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} / 100`);
    expect(semantic.rawPercent).toBe(result.relationship.percent);
    expect(screen.querySelector('.plan-conflict-caps')!.textContent).toContain('сколько общих детей');
  });
});
