import type { Question } from '../types';

/** Private scoring view; the original questions remain the source for every auxiliary result. */
export function relationshipQuestions(questions: Question[]): Question[] {
  return questions.flatMap(q => {
    const rule = q.relationshipRule;
    if (rule?.kind === 'input_only' || q.scored === false) return [];
    if (rule?.kind === 'closeness_cross') return [{
      ...q, block: 'friendship' as const, sphere: rule.sphere, scored: true,
      cross: { id: rule.sourceId, level: [...rule.sourceLevels] },
    }];
    if (q.block === 'maturity') return [];
    if (rule?.kind === 'goal_direction') return [{ ...q, behaviorLevels: [...rule.levels] }];
    return [q];
  });
}
