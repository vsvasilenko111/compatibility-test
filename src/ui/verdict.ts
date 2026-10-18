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

/**
 * Уровень по откалиброванному проценту. Границы — по синтетике (research/review/bands.txt): у задуманных крепких пар медиана 79–84%
 * и почти все выше 70%; ниже 70% исход в симуляции трёх лет почти одинаково слабый, у пар с расходящимися планами — меньше 25%.
 */
export function level(percent: number | null): string | null {
  if (percent === null) return null;
  if (percent >= 80) return 'очень высокая';
  if (percent >= 70) return 'высокая';
  if (percent >= 55) return 'средняя';
  if (percent >= 40) return 'ниже средней';
  return 'низкая';
}
