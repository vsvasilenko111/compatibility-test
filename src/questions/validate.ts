import type { Question } from '../types';
import { SPHERES } from './spheres';

export function validateBank(questions: Question[], ids: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const sphereBlock = new Map(SPHERES.map((s) => [s.id, s.block]));
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
    else if (block !== q.block) errors.push(`${label}: сфера ${q.sphere} относится к блоку ${block}`);
    if (i > 0 && questions[i - 1].sphere === q.sphere && !grouped.has(q.sphere)) errors.push(`${label}: два вопроса сферы ${q.sphere} подряд`);
  });

  if (ids.join('\n') !== questions.map((q) => q.id).join('\n')) {
    errors.push('манифест текущей версии не совпадает с порядком банка');
  }
  return errors;
}
