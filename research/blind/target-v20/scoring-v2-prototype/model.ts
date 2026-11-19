import type { Profile, Question } from '../../../../src/types';
import { optionIndex } from '../../../../src/answer';
import { compare } from '../../../../src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '../../../../src/questions/spheres';

export type DomainName = 'preferences' | 'orientation' | 'actions' | 'reactions';
export interface DomainScore {
  percent: number | null;
  questionIds: string[];
  comparableCount: number;
  /** Assigned items without a calculable result: missing answers/sources or an explicit unknown option. */
  uncertainIds: string[];
}
/** Accepted one-based actual answer options of the OTHER person, never an inferred tolerance. */
export interface Requirement { questionId: string; acceptedOptions: number[] }
export interface ConditionsInput { a?: Requirement[]; b?: Requirement[] }
export interface ConditionAssessment {
  owner: 'a' | 'b';
  id: string;
  topic: string;
  acceptedOptions: number[];
  actualOption: number | null;
  status: 'met' | 'violated' | 'unknown';
}
export interface ConditionsResult {
  collectionStatus: 'not_collected' | 'partial' | 'collected';
  assessmentStatus: 'unknown' | 'has_violations' | 'all_declared_met';
  assessments: ConditionAssessment[];
}
export interface SeparatedScore {
  referencePercent: number | null;
  domains: Record<DomainName, DomainScore>;
  conditions: ConditionsResult;
}

function domainOf(q: Question): DomainName | null {
  if (q.scored === false || q.relationshipRule?.kind === 'input_only') return null;
  // Typed constructs take precedence over their historical source block or scoring representation.
  if (q.relationshipRule?.kind === 'closeness_cross') return 'reactions';
  if (q.relationshipRule?.kind === 'goal_direction') return 'orientation';
  if (q.block === 'maturity') return null;
  return q.behaviorLevels ? 'actions' : 'preferences';
}

function declaredConditions(questions: Question[], a: Profile, b: Profile, input: ConditionsInput): ConditionsResult {
  const byId = new Map(questions.map(q => [q.id, q]));
  const assessments: ConditionAssessment[] = [];
  for (const owner of ['a', 'b'] as const) {
    const seen = new Set<string>();
    for (const requirement of input[owner] ?? []) {
      const q = byId.get(requirement.questionId);
      if (!q) throw new Error(`Unknown condition question: ${requirement.questionId}`);
      if (seen.has(q.id)) throw new Error(`Duplicate condition for ${owner}: ${q.id}`);
      seen.add(q.id);
      const accepted = requirement.acceptedOptions;
      if (!Array.isArray(accepted) || accepted.length === 0 || new Set(accepted).size !== accepted.length ||
          accepted.some(n => !Number.isInteger(n) || n < 1 || n > (q.options?.length ?? 5))) {
        throw new Error(`Invalid accepted options for condition: ${q.id}`);
      }
      const answer = (owner === 'a' ? b : a).responses[q.id];
      const actualOption = answer && answer !== 'skipped' ? optionIndex(answer.value) + 1 : null;
      assessments.push({ owner, id: q.id, topic: q.topic, acceptedOptions: [...accepted], actualOption,
        status: actualOption === null ? 'unknown' : accepted.includes(actualOption) ? 'met' : 'violated' });
    }
  }
  const collected = Number(input.a !== undefined) + Number(input.b !== undefined);
  const collectionStatus = collected === 2 ? 'collected' : collected === 1 ? 'partial' : 'not_collected';
  const assessmentStatus = assessments.some(x => x.status === 'violated') ? 'has_violations'
    : collectionStatus === 'collected' && assessments.every(x => x.status === 'met') ? 'all_declared_met' : 'unknown';
  return { collectionStatus, assessmentStatus, assessments };
}

/** Research wrapper only. No aggregate across domains or numerical condition penalties. */
export function separatedScore(questions: Question[], a: Profile, b: Profile, conditions: ConditionsInput = {}): SeparatedScore {
  const names: DomainName[] = ['preferences', 'orientation', 'actions', 'reactions'];
  const domains = {} as Record<DomainName, DomainScore>;
  for (const name of names) {
    const bank = questions.filter(q => domainOf(q) === name);
    // Profiles remain whole: input-only and maturity responses are still cross-question sources.
    // Production compare owns the private v28 view, directional means, caps, weights and priorities.
    const result = compare(bank, a, b, relationshipWeight, friendshipWeight).relationship;
    const comparable = new Set(result.spheres.flatMap(s => s.items.map(item => item.id)));
    const questionIds = bank.map(q => q.id);
    domains[name] = { percent: result.percent, questionIds, comparableCount: comparable.size,
      uncertainIds: questionIds.filter(id => !comparable.has(id)) };
  }
  return {
    referencePercent: compare(questions, a, b, relationshipWeight, friendshipWeight).relationship.percent,
    domains,
    conditions: declaredConditions(questions, a, b, conditions),
  };
}
