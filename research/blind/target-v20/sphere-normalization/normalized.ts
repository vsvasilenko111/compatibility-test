import { compare, type CompareResult, type SphereWeight } from '../../../../src/scoring/compare';
import type { Profile, Question } from '../../../../src/types';

export function normalizedCompare(questions: Question[], a: Profile, b: Profile, relationshipWeight: SphereWeight, friendshipWeight: SphereWeight): CompareResult {
  // Derive coverage from the scorer so uncertain answers, skipped responses and
  // unavailable cross habits follow precisely the same eligibility rules.
  const baseline = compare(questions, a, b, relationshipWeight, friendshipWeight);
  const relationshipCounts = new Map(baseline.relationship.spheres.map(s => [s.sphere, s.items.length]));
  const friendshipCounts = new Map(baseline.friendship.spheres.map(s => [s.sphere, s.items.length]));
  return compare(questions, a, b,
    sphere => relationshipWeight(sphere) / (relationshipCounts.get(sphere) || 1),
    sphere => friendshipWeight(sphere) / (friendshipCounts.get(sphere) || 1));
}
