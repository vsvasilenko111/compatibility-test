import type { Manifest } from '../codec/codec';
import type { Question } from '../types';
import bank from './bank.json';
import manifestJson from './manifest.json';

export const BANK_VERSION: number = bank.version;
export const QUESTIONS = bank.questions as Question[];
export const MANIFEST: Manifest = Object.fromEntries(
  Object.entries(manifestJson as Record<string, string[]>).map(([v, ids]) => [Number(v), ids]),
);
export const CURRENT_IDS: string[] = MANIFEST[BANK_VERSION];
