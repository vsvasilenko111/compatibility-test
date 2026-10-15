import type { Response } from './types';

export interface Progress {
  name: string;
  index: number;
  responses: Record<string, Response>;
  inviterCode: string | null;
}

export interface Store {
  readonly available: boolean;
  loadProgress(): Progress | null;
  saveProgress(p: Progress): void;
  clearProgress(): void;
  loadOwnCode(): string | null;
  saveOwnCode(code: string): void;
  loadResultFor(inviterCode: string): string | null;
  saveResultFor(inviterCode: string, code: string): void;
}

const PROGRESS_KEY = 'compat:v1:progress';
const OWN_CODE_KEY = 'compat:v1:own-code';
const RESULTS_KEY = 'compat:v1:results';
const PROBE_KEY = 'compat:probe';

function isProgress(p: unknown): p is Progress {
  if (typeof p !== 'object' || p === null) return false;
  const x = p as Record<string, unknown>;
  return typeof x.name === 'string'
    && typeof x.index === 'number'
    && typeof x.responses === 'object' && x.responses !== null
    && (x.inviterCode === null || typeof x.inviterCode === 'string');
}

function isResults(r: unknown): r is Record<string, string> {
  return typeof r === 'object' && r !== null && !Array.isArray(r)
    && Object.values(r).every((v) => typeof v === 'string');
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
  };
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
