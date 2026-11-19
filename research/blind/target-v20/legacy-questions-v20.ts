/** Frozen v20 release for compatibility tests; not the current question bank. */
import type { Question } from '../../../src/types';
import type { Manifest } from '../../../src/codec/codec';
import bank from './legacy-bank-v20.json';
import manifest from '../../../src/questions/manifest.json';
import firm from '../../../src/questions/firm.json';
export const BANK_VERSION: number = bank.version;
export const COMPATIBLE_SINCE = 18;
export const QUESTIONS = bank.questions as Question[];
export const MANIFEST: Manifest = Object.fromEntries(Object.entries(manifest).filter(([v]) => Number(v) <= 20));
export const FIRM: Manifest = Object.fromEntries(Object.entries(firm).filter(([v]) => Number(v) <= 20));
export const CURRENT_IDS = MANIFEST[20];
export const CURRENT_FIRM = FIRM[20] ?? [];
