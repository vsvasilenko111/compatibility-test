import { describe, it, expect } from 'vitest';
import { CodecError, decode, encode, seal, truncateName } from '../src/codec/codec';
import type { ImportanceLevel, Profile } from '../src/types';

const IDS = Array.from({ length: 116 }, (_, i) => `q${i}`);
const MANIFEST = { 1: IDS };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function randomProfile(seed: number, name = 'Аня'): Profile {
  const r = rng(seed);
  const responses: Profile['responses'] = {};
  for (const id of IDS) {
    if (r() < 0.05) { responses[id] = 'skipped'; continue; }
    const value = Math.floor(r() * 11);
    const lo = Math.floor(r() * (value + 1));
    const hi = value + Math.floor(r() * (11 - value));
    responses[id] = { value, lo, hi, importance: Math.floor(r() * 4) as ImportanceLevel };
  }
  return { name, bankVersion: 1, responses };
}

const kindOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof CodecError ? e.kind : 'other'; }
  return 'no-error';
};

describe('codec', () => {
  it('прямой и обратный проход на 20 случайных профилях', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = randomProfile(seed);
      expect(decode(encode(p, IDS), MANIFEST)).toEqual(p);
    }
  });

  it('116 вопросов и длинное кириллическое имя → не длиннее 340 символов', () => {
    const code = encode(randomProfile(7, 'Александра-Анастасия'), IDS);
    expect(code.length).toBeLessThanOrEqual(340);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('имя из эмодзи обрезается до 40 байт по границе символа', () => {
    expect(truncateName('🌸'.repeat(15))).toBe('🌸'.repeat(10));
    const p = randomProfile(3, '🌸'.repeat(15));
    expect(decode(encode(p, IDS), MANIFEST).name).toBe('🌸'.repeat(10));
  });

  it('неотвеченные вопросы декодируются как skipped', () => {
    const p: Profile = { name: '', bankVersion: 1, responses: { q0: { value: 3, lo: 1, hi: 5, importance: 2 } } };
    const d = decode(encode(p, IDS), MANIFEST);
    expect(d.responses.q0).toEqual({ value: 3, lo: 1, hi: 5, importance: 2 });
    expect(d.responses.q1).toBe('skipped');
  });

  it('замена любого символа (кроме последнего) ловится как corrupt', () => {
    const code = encode(randomProfile(11), IDS);
    for (let i = 0; i < code.length - 1; i++) {
      const swapped = code[i] === 'A' ? 'B' : 'A';
      const broken = code.slice(0, i) + swapped + code.slice(i + 1);
      expect(kindOf(() => decode(broken, MANIFEST))).toBe('corrupt');
    }
  });

  it('обрезанная ссылка, пустая строка и мусор → corrupt', () => {
    const code = encode(randomProfile(5), IDS);
    expect(kindOf(() => decode(code.slice(0, 100), MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('', MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('hello', MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('ab+c', MANIFEST))).toBe('corrupt');
  });

  it('неизвестная версия формата → unsupported-format', () => {
    expect(kindOf(() => decode(seal(Uint8Array.from([2, 1, 0, 0])), MANIFEST))).toBe('unsupported-format');
  });

  it('неизвестная версия банка → unknown-bank', () => {
    const p = { ...randomProfile(2), bankVersion: 9 };
    expect(kindOf(() => decode(encode(p, IDS), MANIFEST))).toBe('unknown-bank');
  });

  it('код старой версии банка декодируется по её списку id', () => {
    const oldIds = IDS.slice(0, 10);
    const p: Profile = { name: 'Миша', bankVersion: 1, responses: { q3: { value: 8, lo: 6, hi: 10, importance: 3 } } };
    const d = decode(encode(p, oldIds), { 1: oldIds, 2: ['new-1', ...IDS] });
    expect(d.bankVersion).toBe(1);
    expect(d.responses.q3).toEqual({ value: 8, lo: 6, hi: 10, importance: 3 });
    expect(Object.keys(d.responses)).toHaveLength(10);
  });
});
