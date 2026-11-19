/** maturity — эмоции и прошлый опыт; только явное relationshipRule может включить сочетание реакций в основной индекс. */
export type Block = 'friendship' | 'relationship' | 'maturity';

/** Interpretations applied only when calculating the main relationship result. */
export type RelationshipRule =
  | { kind: 'input_only' }
  | { kind: 'goal_direction'; levels: number[] }
  | { kind: 'closeness_cross'; sourceId: string; sourceLevels: number[]; sphere: string };

export interface Question {
  relationshipRule?: RelationshipRule;
  id: string;
  block: Block;
  sphere: string;
  text: string;
  left: string;
  right: string;
  topic: string;
  optional: boolean;
  /** Обычно5 вариантов по оси; categorical задаёт4 или5 неупорядоченных категорий без числового сравнения. */
  options?: string[];
  /** Неупорядоченный ответ: scored:false обязателен, положение варианта не означает степень признака. */
  answerKind?: 'categorical';
  /** Варианты неопределённости (номера 1–5): ответ сохранён, но совпадение пока неизвестно. */
  uncertainOptions?: number[];
  /** Качество действия по пяти вариантам, 0..1; оценивается поведение каждого, а не сходство. */
  behaviorLevels?: number[];
  /** Приемлемые форматы и предпочтение для каждого из пяти вариантов. */
  formats?: { accepted: string[]; preferred: string | null }[];
  /** Стабильный ключ темы блока чувств при замене формулировки и ID вопроса. */
  maturityKey?: 'trauma-05' | 'trauma-06';
  /** false — ответ показывается, но в проценты и темы не идёт: разница здесь не минус (например, амбиции у мужчины и женщины). */
  scored?: boolean;
  /** Метаданные старых банков до v19; в текущем прохождении отметок нет. */
  firm?: boolean;
  /**
   * Отношение к привычке партнёра (курение, алкоголь, спорт): ответ сравнивается не с тем же вопросом у другого,
   * а с его ответом о себе (id). level — сила привычки по вариантам вопроса о себе, 0 — привычки нет.
   */
  cross?: { id: string; level: number[] };
  /** Флаг только через середину: один в вариантах 1–2, другой в 4–5 («обязательно» против «хорошо бы» — не флаг). */
  firmSides?: boolean;
  /** С этого варианта (1–5) одинаковые ответы — не согласие, а общий риск: оба кричат в споре. */
  sharedRisk?: number;
  /**
   * Граница по смыслу между вариантами split и split+1 («скорее не хочу детей» | «один»): ответы по разные стороны —
   * расхождение, даже если варианты соседние.
   */
  split?: number;
  /** Флаг не ставится, если он уже стоит у вопроса с этим id: одно и то же разногласие не считается дважды. */
  flagCoveredBy?: string;
}

export type ImportanceLevel = 0 | 1 | 2 | 3;
export const IMPORTANCE_WEIGHTS = [0, 1, 10, 50] as const;

export interface Answer {
  value: number; // 0..10
  lo: number; // 0..10, lo <= hi
  hi: number;
  importance: ImportanceLevel;
  /** Отметка старых ссылок до v19; новые ответы её не передают. */
  firm?: boolean;
}

export type Response = Answer | 'skipped';

/** Личная важность сферы: top — среди 5 самых важных, low — среди 3 наименее важных; остальные — обычные. */
export type Priority = 'top' | 'low';

export interface Profile {
  name: string;
  bankVersion: number;
  responses: Record<string, Response>;
  /** Нет в ссылках до формата 4 — тогда все сферы обычные. */
  priorities?: Record<string, Priority>;
}
