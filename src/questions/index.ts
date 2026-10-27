import type { Manifest } from '../codec/codec';
import type { Question } from '../types';
import bank from './bank.json';
import firmJson from './firm.json';
import manifestJson from './manifest.json';

export const BANK_VERSION: number = bank.version;
/**
 * Самая старая версия банка, ответы которой сравниваются с текущей. Поднимать, когда меняется смысл вопросов
 * при прежних id (или шкала): тогда старые ответы честно не сравнить, и человек проходит тест заново.
 * v14 — первые варианты словами (до 14 — шкала 0–10); в v15 переписаны 8 вопросов и шутка о вас при друзьях.
 */
export const COMPATIBLE_SINCE = 15;
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
