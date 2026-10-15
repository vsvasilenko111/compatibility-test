import type { Block } from '../types';

/** grouped — вопросы сферы идут подряд отдельным подблоком. */
export interface SphereInfo { id: string; block: Block; label: string; grouped?: boolean }

export const SPHERES: SphereInfo[] = [
  { id: 'humor', block: 'friendship', label: 'Юмор и вайб' },
  { id: 'leisure', block: 'friendship', label: 'Досуг' },
  { id: 'rhythm', block: 'friendship', label: 'Ритм общения' },
  { id: 'loyalty', block: 'friendship', label: 'Лояльность и поддержка' },
  { id: 'honesty', block: 'friendship', label: 'Честность и границы' },
  { id: 'money', block: 'friendship', label: 'Деньги между людьми' },
  { id: 'values', block: 'friendship', label: 'Ценности и мировоззрение' },
  { id: 'conflicts', block: 'friendship', label: 'Конфликты' },
  { id: 'kids', block: 'relationship', label: 'Дети и семья' },
  { id: 'home', block: 'relationship', label: 'Быт и дом' },
  { id: 'living', block: 'relationship', label: 'Где и как жить' },
  { id: 'career', block: 'relationship', label: 'Карьера и амбиции' },
  { id: 'budget', block: 'relationship', label: 'Семейный бюджет' },
  { id: 'intimacy', block: 'relationship', label: 'Близость' },
  { id: 'space', block: 'relationship', label: 'Ревность и личное пространство' },
  { id: 'relatives', block: 'relationship', label: 'Родственники и окружение' },
  { id: 'roles', block: 'relationship', label: 'Роли и языки любви' },
  { id: 'attachment', block: 'maturity', label: 'Близость и опора' },
  { id: 'regulation', block: 'maturity', label: 'Эмоции в споре' },
  { id: 'reflection', block: 'maturity', label: 'Понимание себя и партнёра' },
  { id: 'past', block: 'maturity', label: 'Прошлый опыт', grouped: true },
];

/**
 * Вес сферы в «совместимости в отношениях» (на «дружбу» не влияет). Подобран по синтетическому прогону:
 * насколько совпадение в сфере связано с экспертной оценкой пары; проверен на отложенной половине данных
 * (согласие с экспертом 76% → 82%). Близость поднята до среднего уровня вручную — у синтетических персонажей
 * она описана слишком деликатно, чтобы данные её оценили.
 */
export const RELATIONSHIP_WEIGHTS: Record<string, number> = {
  kids: 1, living: 1, budget: 1, relatives: 1, space: 1, values: 1, home: 1, career: 1,
  roles: 0.4, money: 0.4, intimacy: 0.4,
  leisure: 0.15, rhythm: 0.15, loyalty: 0.15, humor: 0.15,
  conflicts: 0.05, honesty: 0.05,
};

export const relationshipWeight = (sphere: string): number => RELATIONSHIP_WEIGHTS[sphere] ?? 1;
