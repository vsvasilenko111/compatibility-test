import { describe, it, expect } from 'vitest';
import { createStore, type Progress } from '../src/storage';

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
    }
  });
});
