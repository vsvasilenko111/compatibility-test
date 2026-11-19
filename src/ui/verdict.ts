import type { CompareResult } from '../scoring/compare';

/** Описывает совпадение ответов на исходной шкале 0–100. */
export function verdict(r: Pick<CompareResult, 'relationship' | 'friendship'>): string {
  if (r.relationship.redFlags.length > 0) return 'Есть принципиальные расхождения — начните разговор с красных флагов.';
  if (r.relationship.uncertain?.length || r.friendship.uncertain?.length) return 'Часть планов пока не определена — обсудите их вместе.';
  if (r.relationship.percent === null && r.friendship.percent === null) return 'Для вас обоих эти темы не принципиальны.';
  const rel = r.relationship.percent ?? 100;
  const fr = r.friendship.percent ?? 100;
  if (rel >= 70 && fr >= 70) return 'В ваших ответах много совпадений — и об отношениях, и о дружбе.';
  if (fr - rel >= 25) return 'В повседневных вопросах больше совпадений, чем во взглядах на совместную жизнь.';
  if (rel >= 55) return 'В ответах есть совпадения — несколько тем стоит обсудить.';
  return 'Вы во многом разные — результат подскажет, с чего начать разговор.';
}

/**
 * Описательные уровни совпадения ответов. Пороги не являются прогнозом исходов отношений.
 */
export function level(percent: number | null): string | null {
  if (percent === null) return null;
  if (percent >= 80) return 'много совпадений';
  if (percent >= 70) return 'заметное совпадение';
  if (percent >= 55) return 'частичное совпадение';
  if (percent >= 40) return 'много различий';
  return 'сильные различия';
}
