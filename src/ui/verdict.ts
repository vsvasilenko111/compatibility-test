import type { CompareResult } from '../scoring/compare';

export function verdict(r: CompareResult): string {
  const rel = r.relationship.percent ?? 100;
  const fr = r.friendship.percent ?? 100;
  if (r.relationship.redFlags.length > 0) return 'Есть принципиальные расхождения — начните разговор с красных флагов.';
  if (rel >= 75 && fr >= 75) return 'Вы совпадаете и как пара, и как друзья.';
  if (fr - rel >= 15) return 'Вам легко вместе, но во взглядах на отношения есть что обсудить.';
  if (rel >= 60) return 'Хорошая основа — несколько тем стоит обсудить.';
  return 'Вы во многом разные — результат подскажет, с чего начать разговор.';
}
