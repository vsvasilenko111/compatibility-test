import type { CompareResult } from '../scoring/compare';

/** Ожидает откалиброванные проценты: 50 — типичная случайная пара. */
export function verdict(r: Pick<CompareResult, 'relationship' | 'friendship'>): string {
  if (r.relationship.percent === null && r.friendship.percent === null) return 'Для вас обоих эти темы не принципиальны.';
  const rel = r.relationship.percent ?? 100;
  const fr = r.friendship.percent ?? 100;
  if (r.relationship.redFlags.length > 0) return 'Есть принципиальные расхождения — начните разговор с красных флагов.';
  if (rel >= 70 && fr >= 70) return 'Вы совпадаете и как пара, и как друзья.';
  if (fr - rel >= 25) return 'Вам легко вместе, но во взглядах на отношения есть что обсудить.';
  if (rel >= 55) return 'Хорошая основа — несколько тем стоит обсудить.';
  return 'Вы во многом разные — результат подскажет, с чего начать разговор.';
}
