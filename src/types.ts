/** maturity — вопросы об эмоциях и прошлом опыте: на проценты не влияют, дают только опоры и темы для разговора. */
export type Block = 'friendship' | 'relationship' | 'maturity';

export interface Question {
  id: string;
  block: Block;
  sphere: string;
  text: string;
  left: string;
  right: string;
  topic: string;
  optional: boolean;
  /** 5 вариантов по одной оси, от left к right (с банка v14). Без них — прежняя шкала 0–10. */
  options?: string[];
  /** false — ответ показывается, но в проценты и темы не идёт: разница здесь не минус (например, амбиции у мужчины и женщины). */
  scored?: boolean;
  /** Под шкалой — отметка «Для меня это не обсуждается»: красный флаг ставится только по ней. */
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
  /** Отметка «Для меня это не обсуждается» — только у вопросов с firm. */
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
