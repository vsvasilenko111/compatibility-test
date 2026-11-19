import type { Answer, Profile, Question } from '../types';
import { optionIndex } from '../answer';
import { relationshipWeight, friendshipWeight } from '../questions/spheres';
import { compare } from './compare';

type Component = 'plans' | 'actions' | 'orientation' | 'reactions';
export interface SemanticPlanCap {
  id: string;
  topic: string;
  reason: 'split' | 'formats';
  /** One-based known choices, never inferred personal non-negotiability. */
  optionA: number;
  optionB: number;
  limit: 50;
}
export interface SemanticRelationshipResult {
  version: 'semantic-v1';
  percent: number | null;
  /** Unchanged whole-bank v28 relationship score, before any display calibration. */
  rawPercent: number | null;
  components: Record<Component, number | null>;
  factors: { orientation: number; reactions: number };
  caps: SemanticPlanCap[];
  unknownIds: string[];
  provisional: boolean;
}

/** Typed rules take precedence over source blocks and action metadata. */
function component(q: Question): Component | null {
  if (q.scored === false || q.relationshipRule?.kind === 'input_only') return null;
  if (q.relationshipRule?.kind === 'goal_direction') return 'orientation';
  if (q.relationshipRule?.kind === 'closeness_cross') return 'reactions';
  if (q.block === 'maturity') return null;
  return q.behaviorLevels ? 'actions' : 'plans';
}

function knownAnswer(p: Profile, q: Question): Answer | null {
  const r = p.responses[q.id];
  if (!r || r === 'skipped' || q.uncertainOptions?.includes(optionIndex(r.value) + 1)) return null;
  return r;
}

/**
 * Versioned engineering interpretation of current answers, not a probability of success.
 * Every component delegates to the original production scorer with complete profiles,
 * so cross sources and each person's own priorities retain their original direction.
 */
export function semanticRelationship(questions: Question[], a: Profile, b: Profile): SemanticRelationshipResult {
  const groups: Record<Component, Question[]> = { plans: [], actions: [], orientation: [], reactions: [] };
  const byId = new Map(questions.map(q => [q.id, q]));
  const unknownIds: string[] = [];
  const caps: SemanticPlanCap[] = [];
  for (const q of questions) {
    const domain = component(q);
    if (domain === null) continue;
    const qa = knownAnswer(a, q), qb = knownAnswer(b, q);
    const sourceId = q.relationshipRule?.kind === 'closeness_cross' ? q.relationshipRule.sourceId : q.cross?.id;
    const source = sourceId ? byId.get(sourceId) : undefined;
    const knownSource = !sourceId || [a, b].every(p => source
      ? knownAnswer(p, source) !== null
      : Boolean(p.responses[sourceId] && p.responses[sourceId] !== 'skipped'));
    if (!qa || !qb || !knownSource) {
      unknownIds.push(q.id);
      continue;
    }
    groups[domain].push(q);
    if (domain !== 'plans') continue;
    const ia = optionIndex(qa.value), ib = optionIndex(qb.value);
    const evidence = { id: q.id, topic: q.topic, optionA: ia + 1, optionB: ib + 1, limit: 50 as const };
    if (q.split !== undefined && (ia < q.split) !== (ib < q.split)) {
      caps.push({ ...evidence, reason: 'split' });
    } else if (q.formats && !q.formats[ia].accepted.some(format => q.formats![ib].accepted.includes(format))) {
      caps.push({ ...evidence, reason: 'formats' });
    }
  }
  const score = (qs: Question[]) => compare(qs, a, b, relationshipWeight, friendshipWeight).relationship.percent;
  const components = {
    plans: score(groups.plans), actions: score(groups.actions),
    orientation: score(groups.orientation), reactions: score(groups.reactions),
  };
  const factors = {
    orientation: components.orientation === null ? 1 : .5 + .5 * components.orientation / 100,
    reactions: components.reactions === null ? 1 : .8 + .2 * components.reactions / 100,
  };
  const uncapped = components.plans === null || components.actions === null ? null
    : Math.sqrt(components.plans * components.actions) * factors.orientation * factors.reactions;
  return {
    version: 'semantic-v1',
    percent: uncapped === null ? null : caps.length ? Math.min(50, uncapped) : uncapped,
    rawPercent: score(questions), components, factors, caps, unknownIds,
    provisional: unknownIds.length > 0 || Object.values(components).some(value => value === null),
  };
}
