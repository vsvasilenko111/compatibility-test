import { describe, it, expect } from 'vitest';
import reference from '../research/blind/target-v20/semantic-reference.json';
import { BANK_VERSION, QUESTIONS } from '../src/questions';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { compare } from '../src/scoring/compare';
import type { Profile } from '../src/types';
import { historicalPercent } from '../research/blind/target-v20/historical-fit';

function score(id: string, method: 'app' | 'linear' | 'same-side'): number {
  if (BANK_VERSION < reference.bank_version) throw new Error('Review semantic references for the new bank');
  const c = reference.cases.find(c => c.id === id)!;
  const q = QUESTIONS.find(q => q.id === c.question_id)!;
  const profiles: Profile[] = c.answers.map(label => {
    const index = q.options!.indexOf(label);
    if (index < 0) throw new Error('Reference answer missing from bank');
    return { name: '', bankVersion: BANK_VERSION, responses: { [q.id]: answerFor(OPTION_VALUES[index]) } };
  });
  return method === 'app' ? compare([q], profiles[0], profiles[1]).relationship.percent!
    : historicalPercent([q], profiles[0], profiles[1], method, 'current')!;
}

describe.each(['app', 'linear', 'same-side'] as const)('user semantic requirements: %s', method => {
  for (const constraint of reference.constraints) {
    it(`${constraint.higher_fit} is less severe than ${constraint.lower_fit}`, () => {
      expect(score(constraint.higher_fit, method)).toBeGreaterThan(score(constraint.lower_fit, method));
    });
  }
});
