import { describe, it, expect } from 'vitest';
import { createStore, HISTORY_LIMIT, type Progress } from '../src/storage';

class MemoryStorage implements Storage {
  [key: string]: any; // индексная сигнатура из интерфейса Storage — иначе tsc не соберёт тесты
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

class ThrowingStorage extends MemoryStorage {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
}

const progress: Progress = {
  name: 'Аня', index: 3, inviterCode: null,
  responses: { 'kids-01': { value: 9, lo: 7, hi: 10, importance: 3 }, 'intimacy-01': 'skipped' },
};

describe('storage', () => {
  it('сохраняет и восстанавливает прогресс', () => {
    const store = createStore(new MemoryStorage());
    expect(store.available).toBe(true);
    expect(store.loadProgress()).toBeNull();
    store.saveProgress(progress);
    expect(store.loadProgress()).toEqual(progress);
    store.clearProgress();
    expect(store.loadProgress()).toBeNull();
  });

  it('сохраняет собственный код', () => {
    const store = createStore(new MemoryStorage());
    store.saveOwnCode('abc');
    expect(store.loadOwnCode()).toBe('abc');
  });

  it('хранит результаты по коду пригласившего', () => {
    const s = new MemoryStorage();
    const store = createStore(s);
    expect(store.loadResultFor('A')).toBeNull();
    store.saveResultFor('A', 'b1');
    store.saveResultFor('C', 'b2');
    store.saveResultFor('A', 'b3');
    expect(store.loadResultFor('A')).toBe('b3');
    expect(store.loadResultFor('C')).toBe('b2');
    s.setItem('compat:v1:results', '[1]');
    expect(createStore(s).loadResultFor('A')).toBeNull();
    s.setItem('compat:v1:results', '{oops');
    expect(createStore(s).loadResultFor('A')).toBeNull();
    s.setItem('compat:v1:results', '{"A":5}');
    expect(createStore(s).loadResultFor('A')).toBeNull();
  });

  it('повреждённый JSON → null, без исключения', () => {
    const s = new MemoryStorage();
    s.setItem('compat:v1:progress', '{oops');
    expect(createStore(s).loadProgress()).toBeNull();
    s.setItem('compat:v1:progress', '{"name":1}');
    expect(createStore(s).loadProgress()).toBeNull();
  });

  it('недоступное хранилище: available=false, методы не бросают', () => {
    for (const store of [createStore(null), createStore(new ThrowingStorage())]) {
      expect(store.available).toBe(false);
      expect(() => store.saveProgress(progress)).not.toThrow();
      expect(store.loadProgress()).toBeNull();
      expect(store.loadOwnCode()).toBeNull();
      expect(() => store.saveResultFor('A', 'b')).not.toThrow();
      expect(store.loadResultFor('A')).toBeNull();
    }
  });
});

describe('история результатов', () => {
  it('новый первым, та же пара в любом порядке не дублируется, не больше HISTORY_LIMIT', () => {
    const store = createStore(new MemoryStorage());
    expect(store.loadHistory()).toEqual([]);
    store.rememberResult({ a: 'A', b: 'B', names: 'Аня × Миша', at: 1 });
    store.rememberResult({ a: 'C', b: 'D', names: 'Оля × Петя', at: 2 });
    store.rememberResult({ a: 'B', b: 'A', names: 'Миша × Аня', at: 3 });
    expect(store.loadHistory().map((r) => r.names)).toEqual(['Миша × Аня', 'Оля × Петя']);
    store.forgetResult('A', 'B');
    expect(store.loadHistory().map((r) => r.names)).toEqual(['Оля × Петя']);
    store.forgetResult('C', 'D');
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.rememberResult({ a: `x${i}`, b: 'y', names: `${i}`, at: i });
    expect(store.loadHistory()).toHaveLength(HISTORY_LIMIT);
  });
  it('испорченная запись и недоступное хранилище — пустая история без ошибок', () => {
    const s = new MemoryStorage();
    s.setItem('compat:v1:history', '{"a":1}');
    expect(createStore(s).loadHistory()).toEqual([]);
    const t = createStore(new ThrowingStorage());
    t.rememberResult({ a: 'A', b: 'B', names: 'n', at: 1 });
    expect(t.loadHistory()).toEqual([]);
  });
});
