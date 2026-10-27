import type { Priority, Response } from './types';

export interface Progress {
  name: string;
  index: number;
  responses: Record<string, Response>;
  inviterCode: string | null;
  /** Дозаполнение: спрашиваются только эти вопросы (новые после обновления теста), остальные ответы уже есть. */
  only?: string[];
  /** При дозаполнении — прежний код этого человека (чтобы обновить «вашу ссылку», если она была его). */
  ownCode?: string;
  /** При дозаполнении — стоял ли человек в результате первым (порядок имён сохраняется). */
  selfFirst?: boolean;
  /** Уже выбранные важные сферы — при дозаполнении переносятся из прежней ссылки. */
  priorities?: Record<string, Priority>;
}

/** Открытый на этом устройстве результат: коды обоих и имена — чтобы потом вернуться к нему с главной. */
export interface SavedResult { a: string; b: string; names: string; at: number }

export interface Store {
  readonly available: boolean;
  loadProgress(): Progress | null;
  saveProgress(p: Progress): void;
  clearProgress(): void;
  loadOwnCode(): string | null;
  saveOwnCode(code: string): void;
  loadResultFor(inviterCode: string): string | null;
  saveResultFor(inviterCode: string, code: string): void;
  loadHistory(): SavedResult[];
  rememberResult(r: SavedResult): void;
  forgetResult(a: string, b: string): void;
}

/** Сколько последних результатов помнить. */
export const HISTORY_LIMIT = 20;

const PROGRESS_KEY = 'compat:v1:progress';
const OWN_CODE_KEY = 'compat:v1:own-code';
const RESULTS_KEY = 'compat:v1:results';
const HISTORY_KEY = 'compat:v1:history';
const PROBE_KEY = 'compat:probe';

function isProgress(p: unknown): p is Progress {
  if (typeof p !== 'object' || p === null) return false;
  const x = p as Record<string, unknown>;
  return typeof x.name === 'string'
    && typeof x.index === 'number'
    && typeof x.responses === 'object' && x.responses !== null
    && (x.inviterCode === null || typeof x.inviterCode === 'string')
    && (x.only === undefined || (Array.isArray(x.only) && x.only.every((id) => typeof id === 'string')));
}

function isResults(r: unknown): r is Record<string, string> {
  return typeof r === 'object' && r !== null && !Array.isArray(r)
    && Object.values(r).every((v) => typeof v === 'string');
}

function isHistory(h: unknown): h is SavedResult[] {
  return Array.isArray(h) && h.every((x) => typeof x === 'object' && x !== null
    && typeof x.a === 'string' && typeof x.b === 'string' && typeof x.names === 'string' && typeof x.at === 'number');
}

function probe(s: Storage): boolean {
  try {
    s.setItem(PROBE_KEY, '1');
    s.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createStore(storage: Storage | null): Store {
  const get = (k: string): string | null => {
    try { return storage?.getItem(k) ?? null; } catch { return null; }
  };
  const set = (k: string, v: string): void => {
    try { storage?.setItem(k, v); } catch { /* хранилище недоступно — работаем без сохранения */ }
  };
  const remove = (k: string): void => {
    try { storage?.removeItem(k); } catch { /* то же */ }
  };

  const loadResults = (): Record<string, string> => {
    const raw = get(RESULTS_KEY);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return isResults(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const loadHistory = (): SavedResult[] => {
    const raw = get(HISTORY_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return isHistory(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const samePair = (x: SavedResult, r: SavedResult) => (x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a);

  return {
    available: storage !== null && probe(storage),
    loadProgress() {
      const raw = get(PROGRESS_KEY);
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isProgress(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    saveProgress: (p) => set(PROGRESS_KEY, JSON.stringify(p)),
    clearProgress: () => remove(PROGRESS_KEY),
    loadOwnCode: () => get(OWN_CODE_KEY),
    saveOwnCode: (code) => set(OWN_CODE_KEY, code),
    loadResultFor: (inviterCode) => Object.hasOwn(loadResults(), inviterCode) ? loadResults()[inviterCode] : null,
    saveResultFor: (inviterCode, code) => set(RESULTS_KEY, JSON.stringify({ ...loadResults(), [inviterCode]: code })),
    loadHistory,
    // Новый — первым; та же пара (в любом порядке) не дублируется.
    forgetResult: (a, b) => set(HISTORY_KEY, JSON.stringify(loadHistory().filter((x) => !samePair(x, { a, b, names: '', at: 0 })))),
    rememberResult: (r) => set(HISTORY_KEY, JSON.stringify([r, ...loadHistory().filter((x) => !samePair(x, r))].slice(0, HISTORY_LIMIT))),
  };
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
