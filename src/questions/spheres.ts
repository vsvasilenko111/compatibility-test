import type { Block } from '../types';

/** grouped — вопросы сферы идут подряд отдельным подблоком. */
export interface SphereInfo { id: string; block: Block; label: string; grouped?: boolean }

export const SPHERES: SphereInfo[] = [
  { id: 'humor', block: 'friendship', label: 'Юмор' },
  { id: 'contact', block: 'friendship', label: 'Общение и внимание' },
  { id: 'leisure', block: 'friendship', label: 'Досуг и увлечения' },
  { id: 'loyalty', block: 'friendship', label: 'Надёжность и поддержка' },
  { id: 'honesty', block: 'friendship', label: 'Честность и границы' },
  { id: 'values', block: 'friendship', label: 'Ценности' },
  { id: 'conflicts', block: 'friendship', label: 'Конфликты' },
  { id: 'kids', block: 'relationship', label: 'Дети и семья' },
  { id: 'home', block: 'relationship', label: 'Быт и дом' },
  { id: 'living', block: 'relationship', label: 'Где и как жить' },
  { id: 'career', block: 'relationship', label: 'Работа и амбиции' },
  { id: 'budget', block: 'relationship', label: 'Деньги' },
  { id: 'intimacy', block: 'relationship', label: 'Близость' },
  { id: 'space', block: 'relationship', label: 'Верность и личное пространство' },
  { id: 'relatives', block: 'relationship', label: 'Родственники' },
  { id: 'roles', block: 'relationship', label: 'Роли мужчины и женщины' },
  { id: 'love', block: 'relationship', label: 'Проявления любви' },
  { id: 'habits', block: 'relationship', label: 'Привычки и здоровье' },
  { id: 'attachment', block: 'maturity', label: 'Близость и опора' },
  { id: 'regulation', block: 'maturity', label: 'Эмоции в споре' },
  { id: 'reflection', block: 'maturity', label: 'Понимание себя и партнёра' },
  { id: 'past', block: 'maturity', label: 'Прошлый опыт', grouped: true },
];

/** Сферы, из которых человек выбирает самые и наименее важные: все, кроме блока зрелости (он на проценты не влияет). */
export const PRIORITY_SPHERES: SphereInfo[] = SPHERES.filter((s) => s.block !== 'maturity');
export const PRIORITY_TOP = 5;

/**
 * Вес сферы в «совместимости в отношениях» (на «дружбу» не влияет). Аудитория — пары 20–30 лет из больших городов России,
 * обычно с высшим образованием и хорошим доходом. Веса — экспертная оценка с опорой на исследования
 * (research/review/weights-literature.md) и проверкой на синтетике (research/review/weights-evidence.txt):
 * Банк v14 переложил вопросы по сферам: «ритм общения» стал «общением и вниманием», «деньги между людьми» влились в «деньги»,
 * из «ролей» выделены «проявления любви» (вес прежних ролей), «образ жизни» стал «привычками и здоровьем» (алкоголь, курение,
 * спорт, питание, ритм дня), увлечения ушли в «досуг». Веса перенесены по смыслу.
 * 1 — дети (классический «стоп-фактор»), конфликты (сильнейший предиктор: Gottman, Joel 2020), деньги (единственная сфера
 *     с прямыми данными о вреде несовпадения: Rick 2011, Dew 2012; финансы — причина развода №1 по ВЦИОМ 2024),
 *     надёжность и поддержка (воспринимаемая преданность — один из главных предикторов, Joel 2020);
 * 0,7 — близость (важен общий уровень, а не совпадение желания: Kim 2020), где жить, ценности (сходство ценностей в сложившихся
 *     парах почти не предсказывает удовлетворённость: Luo & Klohnen 2005), роли и проявления любви (языки любви почти
 *     не подтверждены), быт, верность и пространство; стоп-факторы этих сфер (моногамия, эмиграция, вера) ловит отметка «не обсуждается»;
 * 0,5 — родственники (расхождение в близости с семьёй предсказывало развод, 355 пар, 16 лет), карьерные решения (данные косвенные),
 *     привычки и здоровье: спорт, питание, алкоголь, курение (партнёры со временем сближаются в привычках здоровья, а расхождение
 *     в них, особенно в алкоголе и активности, связано с конфликтами; связь с разводом слабее, чем у детей и денег);
 * 0,4 — честность, общение и внимание, досуг и увлечения, юмор: данных о вреде несовпадения почти нет.
 * Сходство партнёров в целом объясняет меньше 1% удовлетворённости (Dyrenforth 2010), поэтому точность весов вторична.
 * На синтетике набор не хуже прежних: свежие пары — эксперты 72,0, терапевт 76,8, симуляция трёх лет 73,3.
 */
export const RELATIONSHIP_WEIGHTS: Record<string, number> = {
  kids: 1, conflicts: 1, budget: 1, loyalty: 1,
  intimacy: 0.7, living: 0.7, values: 0.7, roles: 0.7, love: 0.7, home: 0.7, space: 0.7,
  relatives: 0.5, career: 0.5, habits: 0.5,
  honesty: 0.4, contact: 0.4, leisure: 0.4, humor: 0.4,
};

export const relationshipWeight = (sphere: string): number => RELATIONSHIP_WEIGHTS[sphere] ?? 1;

/**
 * Вес сферы в «партнёр как друг»: все сферы блока дружбы, ценности ×3 и повседневные сферы пары — роли, проявления любви,
 * верность и пространство, быт, родные, привычки и здоровье. Жизненные планы (дети, жильё, работа, деньги) и близость не входят.
 * Подбор на половине синтетических пар, проверка на другой (research/scripts/pf-cv.ts): 70,0% → 74,2%, лучше в 200 из 200 разбиений.
 */
export const FRIENDSHIP_WEIGHTS: Record<string, number> = {
  humor: 1, contact: 1, leisure: 1, loyalty: 1, honesty: 1, conflicts: 1, values: 3,
  roles: 1, love: 1, space: 1, home: 1, relatives: 1, habits: 1,
};
export const friendshipWeight = (sphere: string): number => FRIENDSHIP_WEIGHTS[sphere] ?? 0;
