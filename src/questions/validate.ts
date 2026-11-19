import type { Question } from '../types';
import { SPHERES } from './spheres';

export function validateBank(questions: Question[], ids: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const sphereBlock = new Map(SPHERES.map((s) => [s.id, s.block]));
  const allowedBlocks = new Map(SPHERES.map((s) => [s.id, s.allowedBlocks ?? [s.block]]));
  const grouped = new Set(SPHERES.filter((s) => s.grouped).map((s) => s.id));

  questions.forEach((q, i) => {
    const label = q.id || `#${i}`;
    if (seen.has(q.id)) errors.push(`дубликат id: ${q.id}`);
    seen.add(q.id);
    for (const field of ['id', 'text', 'left', 'right', 'topic'] as const) {
      if (!q[field]?.trim()) errors.push(`${label}: пустое поле ${field}`);
    }
    const block = sphereBlock.get(q.sphere);
    if (!block) errors.push(`${label}: неизвестная сфера ${q.sphere}`);
    else if (!allowedBlocks.get(q.sphere)!.includes(q.block)) errors.push(`${label}: сфера ${q.sphere} относится к блоку ${block}`);
    const count = q.options?.length ?? 0;
    if (q.answerKind !== undefined && q.answerKind !== 'categorical') errors.push(`${label}: неизвестный вид вариантов`);
    if (q.answerKind === 'categorical') {
      if (count !== 4 && count !== 5) errors.push(`${label}: категориальный вопрос должен иметь четыре или пять вариантов`);
      if (q.scored !== false) errors.push(`${label}: категориальный вопрос должен быть исключён из числового подсчёта`);
      if (q.relationshipRule || q.cross || q.behaviorLevels || q.formats || q.split !== undefined || q.sharedRisk !== undefined)
        errors.push(`${label}: неупорядоченные категории несовместимы с числовыми правилами`);
    } else if (q.options && count !== 5) errors.push(`${label}: для обычной шкалы нужны пять вариантов`);
    if (q.relationshipRule !== undefined) {
      const rule = q.relationshipRule;
      const fail = (detail: string) => errors.push(`${label}: relationshipRule — ${detail}`);
      const levelsValid = (value: unknown): value is number[] => Array.isArray(value) && value.length === 5 &&
        value.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1);
      if (!rule || typeof rule !== 'object') fail('неверное правило');
      else {
        const keys = rule.kind === 'input_only' ? ['kind'] : rule.kind === 'goal_direction' ? ['kind', 'levels']
          : rule.kind === 'closeness_cross' ? ['kind', 'sourceId', 'sourceLevels', 'sphere'] : [];
        if (!keys.length || Object.keys(rule).some(key => !keys.includes(key))) fail('неизвестный вид или лишние поля');
        if (count !== 5) fail('нужны пять вариантов');
        if (q.cross || q.behaviorLevels || q.formats) fail('несовместимо с другим правилом подсчёта');
        if (rule.kind === 'goal_direction' && !levelsValid(rule.levels)) fail('уровни должны быть пятью числами в 0..1');
        if (rule.kind === 'closeness_cross') {
          if (!levelsValid(rule.sourceLevels)) fail('уровни источника должны быть пятью числами в 0..1');
          const source = questions.find(source => source.id === rule.sourceId);
          if (!source || source.options?.length !== 5) fail('источник должен существовать и иметь пять вариантов');
          if (!sphereBlock.has(rule.sphere)) fail('неизвестная сфера');
        }
      }
    }
    if (q.uncertainOptions && (new Set(q.uncertainOptions).size !== q.uncertainOptions.length ||
      q.uncertainOptions.some(n => !Number.isInteger(n) || n < 1 || n > count))) errors.push(`${label}: неверные номера неопределённых вариантов`);
    if ([q.cross, q.behaviorLevels, q.formats].filter(Boolean).length > 1) errors.push(`${label}: несколько несовместимых правил подсчёта`);
    if (q.behaviorLevels && (q.behaviorLevels.length !== count || q.behaviorLevels.some(x => !Number.isFinite(x) || x < 0 || x > 1)))
      errors.push(`${label}: уровни действий должны соответствовать вариантам и лежать в 0..1`);
    if (q.formats && (q.formats.length !== count || q.formats.some(f => !f.accepted.length ||
      new Set(f.accepted).size !== f.accepted.length || f.accepted.some(x => typeof x !== 'string' || !x.trim()) ||
      (f.preferred !== null && !f.accepted.includes(f.preferred))))) errors.push(`${label}: неверные приемлемые форматы`);
    if (i > 0 && questions[i - 1].sphere === q.sphere && !grouped.has(q.sphere)) errors.push(`${label}: два вопроса сферы ${q.sphere} подряд`);
  });

  if (ids.join('\n') !== questions.map((q) => q.id).join('\n')) {
    errors.push('манифест текущей версии не совпадает с порядком банка');
  }
  return errors;
}
