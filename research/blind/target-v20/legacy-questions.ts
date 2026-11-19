/** Frozen 136-question bank for historical comparisons; production uses src/questions. */
import type { Question } from '../../../src/types';
import type { Manifest } from '../../../src/codec/codec';
import bank from './legacy-bank-v19.json';
import manifest from '../../../src/questions/manifest.json';
import firm from '../../../src/questions/firm.json';
export const BANK_VERSION: number = bank.version;
export const QUESTIONS = bank.questions as Question[];
export const COMPATIBLE_SINCE = 18;
export const MANIFEST: Manifest = Object.fromEntries(Object.entries(manifest).filter(([v]) => Number(v) <= BANK_VERSION));
export const FIRM: Manifest = Object.fromEntries(Object.entries(firm).filter(([v]) => Number(v) <= BANK_VERSION));
export const CURRENT_IDS = MANIFEST[BANK_VERSION];
export const CURRENT_FIRM = FIRM[BANK_VERSION] ?? [];
