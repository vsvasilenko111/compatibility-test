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
  /** false — ответ показывается, но в проценты и темы не идёт: разница здесь не минус (например, амбиции у мужчины и женщины). */
  scored?: boolean;
}

export type ImportanceLevel = 0 | 1 | 2 | 3;
export const IMPORTANCE_WEIGHTS = [0, 1, 10, 50] as const;

export interface Answer {
  value: number; // 0..10
  lo: number; // 0..10, lo <= hi
  hi: number;
  importance: ImportanceLevel;
}

export type Response = Answer | 'skipped';

export interface Profile {
  name: string;
  bankVersion: number;
  responses: Record<string, Response>;
}
