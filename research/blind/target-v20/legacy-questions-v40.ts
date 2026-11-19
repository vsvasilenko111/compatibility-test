/** Frozen v40 for historical retirement/link regressions. */
import type { Question } from '../../../src/types';
import type { Manifest } from '../../../src/codec/codec';
import bank from './v41-advice-style/baseline-bank-v40.json';
import manifest from '../../../src/questions/manifest.json';
import firm from '../../../src/questions/firm.json';
export const BANK_VERSION: number = bank.version;
export const COMPATIBLE_SINCE = 18;
export const QUESTIONS = bank.questions as Question[];
export const MANIFEST: Manifest = Object.fromEntries(Object.entries(manifest).filter(([v]) => Number(v) <= BANK_VERSION));
export const FIRM: Manifest = Object.fromEntries(Object.entries(firm).filter(([v]) => Number(v) <= BANK_VERSION));
export const CURRENT_IDS = MANIFEST[BANK_VERSION];
export const CURRENT_FIRM = FIRM[BANK_VERSION] ?? [];
