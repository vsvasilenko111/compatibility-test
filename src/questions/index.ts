import type { Manifest } from '../codec/codec';
import type { Question } from '../types';
import bank from './bank.json';
import firmJson from './firm.json';
import manifestJson from './manifest.json';

export const BANK_VERSION: number = bank.version;
/** С этой версии банка ответы — 5 вариантов словами; ответы прежней шкалы 0–10 с ними не сравниваются. */
export const OPTIONS_SINCE = 14;
export const QUESTIONS = bank.questions as Question[];
export const MANIFEST: Manifest = Object.fromEntries(
  Object.entries(manifestJson as Record<string, string[]>).map(([v, ids]) => [Number(v), ids]),
);
export const CURRENT_IDS: string[] = MANIFEST[BANK_VERSION];
/** Вопросы с отметкой «не обсуждается» по версиям банка — в порядке манифеста; у версии без отметок списка нет. */
export const FIRM: Manifest = Object.fromEntries(
  Object.entries(firmJson as Record<string, string[]>).map(([v, ids]) => [Number(v), ids]),
);
export const CURRENT_FIRM: string[] = FIRM[BANK_VERSION] ?? [];
