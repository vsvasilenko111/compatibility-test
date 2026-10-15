export type Block = 'friendship' | 'relationship';

export interface Question {
  id: string;
  block: Block;
  sphere: string;
  text: string;
  left: string;
  right: string;
  topic: string;
  optional: boolean;
}

export type ImportanceLevel = 0 | 1 | 2 | 3;
export const IMPORTANCE_WEIGHTS = [0, 1, 10, 50] as const;
export const IMPORTANCE_LABELS = ['Не важно', 'Немного', 'Очень', 'Критично'] as const;
export const MAX_CRITICAL = 12;

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
