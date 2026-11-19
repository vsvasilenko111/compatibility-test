import { optionIndex } from '../answer';
import { QUESTIONS } from '../questions';
import { SPHERES } from '../questions/spheres';
import { compare } from '../scoring/compare';
import { relationshipQuestions } from '../scoring/relationship-view';
import type { Profile, Question } from '../types';

export interface AnswerRow { id: string; text: string; left: string; right: string; sphere: string; a: number; b: number; diff: number; opposite: boolean;
  /** Отметка «Для меня это не обсуждается» у первого и второго. */
  firmA: boolean; firmB: boolean;
  /** Выбранные варианты словами; у вопросов без вариантов — число. */
  labelA: string; labelB: string }
export interface AnswerGroup { title: string; rows: AnswerRow[] }

/** Расхождение — от 4 делений (через вариант и дальше: 3 и 7, 0 и 5), как у «стоит обсудить». */
export const DIVERGENCE = 4;

const label = (q: Question, v: number) => (q.options ? q.options[optionIndex(v)] : String(v));

/** Вопросы, на которые ответили оба, — все блоки, включая эмоции и прошлый опыт. Пропущенные не показываются. */
export function bothAnswered(questions: Question[], pa: Profile, pb: Profile): AnswerRow[] {
  const labels = new Map(SPHERES.map((s) => [s.id, s.label]));
  return questions.flatMap((q) => {
    const x = pa.responses[q.id], y = pb.responses[q.id];
    if (!x || !y || x === 'skipped' || y === 'skipped') return [];
    return [{ id: q.id, text: q.text, left: q.left, right: q.right, sphere: labels.get(q.sphere) ?? q.sphere,
      a: x.value, b: y.value, labelA: label(q, x.value), labelB: label(q, y.value), firmA: x.firm === true, firmB: y.firm === true,
      // Category positions have no distance or opposite poles, including in the visual answer list.
      diff: q.answerKind === 'categorical' ? 0 : Math.abs(x.value - y.value),
      opposite: q.answerKind !== 'categorical' && (x.value - 5) * (y.value - 5) < 0 }];
  });
}

/**
 * Расхождения по группам: противоположные мнения, разные стороны от середины, одна сторона с разной силой. Внутри — от большей разницы.
 * Вопросы, где разница не минус (scored: false), сюда не попадают — они видны только во всех ответах. Вопросы с cross тоже:
 * их ответы сравниваются с привычкой другого, и у двух некурящих «Нормально» и «Против» — не расхождение.
 */
export function divergences(questions: Question[], pa: Profile, pb: Profile): AnswerGroup[] {
  const mainView = new Map(relationshipQuestions(questions).map(q => [q.id, q]));
  const candidates = questions.flatMap(q => {
    const effective = q.relationshipRule ? mainView.get(q.id) : q;
    return effective && effective.scored !== false && (!effective.cross || effective.relationshipRule?.kind === 'closeness_cross')
      ? [effective] : [];
  });
  const byId = new Map(candidates.map(q => [q.id, q]));
  const answered = bothAnswered(candidates, pa, pb).filter(row => !byId.get(row.id)!.uncertainOptions?.some(n =>
    n === optionIndex(row.a) + 1 || n === optionIndex(row.b) + 1));
  const needsDiscussion = new Set(compare(questions, pa, pb).relationship.talkZones.map(q => q.id));
  const semanticRows = (kind: 'behaviorLevels' | 'formats') => answered
    .filter(row => !byId.get(row.id)!.relationshipRule && byId.get(row.id)![kind] && needsDiscussion.has(row.id)).map(row => ({ ...row, opposite: false }));
  const ruleRows = (kind: 'goal_direction' | 'closeness_cross') => answered
    .filter(row => byId.get(row.id)!.relationshipRule?.kind === kind && needsDiscussion.has(row.id)
      && (kind !== 'goal_direction' || optionIndex(row.a) !== optionIndex(row.b)))
    .map(row => ({ ...row, opposite: false }));
  // Показываем обе составляющие сочетания: тревогу и ответ другого на трудный момент.
  const originals = new Map([...QUESTIONS, ...questions].map(q => [q.id, q]));
  const interactionIds = new Set<string>();
  for (const row of ruleRows('closeness_cross')) {
    interactionIds.add(row.id);
    const rule = byId.get(row.id)!.relationshipRule;
    if (rule?.kind === 'closeness_cross') interactionIds.add(rule.sourceId);
  }
  const interactionQuestions = [...interactionIds].flatMap(id => {
    const original = originals.get(id);
    return original ? [original] : [];
  });
  const interactionRows = bothAnswered(interactionQuestions, pa, pb).map(row => ({ ...row, opposite: false }));
  const rows = answered.filter(row => !interactionIds.has(row.id) && !byId.get(row.id)!.relationshipRule && !byId.get(row.id)!.behaviorLevels && !byId.get(row.id)!.formats && row.diff >= DIVERGENCE)
    .sort((x, y) => y.diff - x.diff);
  return [
    { title: 'Планы на длительные отношения', rows: ruleRows('goal_direction') },
    { title: 'Сочетания реакций', rows: interactionRows },
    { title: 'Действия в отношениях', rows: semanticRows('behaviorLevels') },
    { title: 'Формат отношений', rows: semanticRows('formats') },
    { title: 'Противоположные мнения', rows: rows.filter((r) => r.opposite && r.diff >= 6) },
    { title: 'По разные стороны от середины', rows: rows.filter((r) => r.opposite && r.diff < 6) },
    { title: 'Мнение одно, сила разная', rows: rows.filter((r) => !r.opposite) },
  ].filter((g) => g.rows.length > 0);
}
