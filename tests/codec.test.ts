import { describe, it, expect } from 'vitest';
import { CodecError, decode, encode, PRIORITY_SPHERES_V4, seal, truncateName } from '../src/codec/codec';
import { BitWriter } from '../src/codec/bits';
import { PRIORITY_SPHERES } from '../src/questions/spheres';
import type { Profile } from '../src/types';
import { answerFor } from '../src/answer';
import { MANIFEST as REAL_MANIFEST } from '../src/questions';

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
    responses[id] = r() < 0.05 ? 'skipped' : answerFor(Math.floor(r() * 11));
  }
  return { name, bankVersion: 1, responses };
}

/** Код старого формата (v1: ответ, диапазон и важность на каждый вопрос) — реальная ссылка до перехода на короткий формат. */
const LEGACY_V1 = 'GDw6s8-nAALoN87-cY-t9aGcGyUa6Yx_i-dIO9Yth_7u09JNOnHsu92FYeTvEKTrD1KrFvvuUdL9JSI-PoKN1dvdoIh1zhvcYdNBnjcpnCo0xVlZ_myUrYPt0GrMkC-xEpu0WcXj2UIkdgpi3K_6_SU7xXivZQ-pfJCYte9RHxyDeLXYwbkLxtazjSbJ5Tvj2kdy9p0FmUCqJzBjETDMdPgnDtdfrc5vsx4qFkuaSZlruhCCQFHTB_NFo9iZ0uxeVpt6pY1iMxiCpHgfZDlKDrqiMLyv_yzjQXM9';

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

  it('116 вопросов и длинное кириллическое имя → не длиннее 140 символов', () => {
    const code = encode(randomProfile(7, 'Александра-Анастасия'), IDS);
    expect(code.length).toBeLessThanOrEqual(140);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('имя из эмодзи обрезается до 40 байт по границе символа', () => {
    expect(truncateName('🌸'.repeat(15))).toBe('🌸'.repeat(10));
    const p = randomProfile(3, '🌸'.repeat(15));
    expect(decode(encode(p, IDS), MANIFEST).name).toBe('🌸'.repeat(10));
  });

  it('неотвеченные вопросы декодируются как skipped', () => {
    const p: Profile = { name: '', bankVersion: 1, responses: { q0: answerFor(3) } };
    const d = decode(encode(p, IDS), MANIFEST);
    expect(d.responses.q0).toEqual(answerFor(3));
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
    expect(kindOf(() => decode(code.slice(0, code.length - 10), MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('', MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('hello', MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('ab+c', MANIFEST))).toBe('corrupt');
  });

  it('неизвестная версия формата → unsupported-format', () => {
    expect(kindOf(() => decode(seal(Uint8Array.from([5, 1, 0, 0])), MANIFEST))).toBe('unsupported-format');
  });

  it('неизвестная версия банка → unknown-bank', () => {
    const p = { ...randomProfile(2), bankVersion: 9 };
    expect(kindOf(() => decode(encode(p, IDS), MANIFEST))).toBe('unknown-bank');
  });

  it('код старой версии банка декодируется по её списку id', () => {
    const oldIds = IDS.slice(0, 10);
    const p: Profile = { name: 'Миша', bankVersion: 1, responses: { q3: answerFor(8) } };
    const d = decode(encode(p, oldIds), { 1: oldIds, 2: ['new-1', ...IDS] });
    expect(d.bankVersion).toBe(1);
    expect(d.responses.q3).toEqual(answerFor(8));
    expect(Object.keys(d.responses)).toHaveLength(10);
  });

  it('старые длинные ссылки (формат v1) по-прежнему открываются', () => {
    const d = decode(LEGACY_V1, REAL_MANIFEST);
    expect(d.name).toBe('Аня');
    expect(d.bankVersion).toBe(2);
    expect(d.responses['humor-01']).toEqual({ value: 2, lo: 0, hi: 4, importance: 2 });
    expect(Object.keys(d.responses)).toHaveLength(118);
  });

  it('отметка «не обсуждается» сохраняется по списку версии; пропуск отметку не несёт', () => {
    const firm = ['q1', 'q4', 'q7'];
    const p: Profile = { name: 'x', bankVersion: 1, responses: { q1: { ...answerFor(9), firm: true }, q4: answerFor(2), q7: 'skipped' } };
    const d = decode(encode(p, IDS, firm), MANIFEST, { 1: firm });
    expect(d.responses.q1).toEqual({ ...answerFor(9), firm: true });
    expect(d.responses.q4).toEqual(answerFor(2));
    expect(d.responses.q7).toBe('skipped');
  });

  it('ссылка формата v2 (без отметок) по-прежнему открывается', () => {
    const v2 = Uint8Array.from([2, 1, 0, 0, ...Array(58).fill(0x55)]);
    const d = decode(seal(v2), MANIFEST, { 1: ['q0'] });
    expect(d.responses.q0).toEqual(answerFor(5));
    expect(Object.keys(d.responses)).toHaveLength(116);
  });

  it('важность сфер сохраняется; без выбора её в профиле нет', () => {
    const p: Profile = { ...randomProfile(3), priorities: { kids: 'top', budget: 'top', humor: 'low', lifestyle: 'low' } };
    expect(decode(encode(p, IDS), MANIFEST)).toEqual(p);
    expect(decode(encode(randomProfile(3), IDS), MANIFEST).priorities).toBeUndefined();
  });

  it('важность читается и при отметках «не обсуждается» — без сдвига', () => {
    const firm = ['q1', 'q2'];
    const p: Profile = { name: 'x', bankVersion: 1, responses: { q1: { ...answerFor(9), firm: true } }, priorities: { kids: 'top', money: 'low' } };
    const d = decode(encode(p, IDS, firm), MANIFEST, { 1: firm });
    expect(d.priorities).toEqual(p.priorities);
    expect(d.responses.q1).toEqual({ ...answerFor(9), firm: true });
  });

  it('ссылка формата v3 (отметки, без важности сфер) по-прежнему открывается', () => {
    const w = new BitWriter();
    [3, 1, 0, 0].forEach((b) => w.write(b, 8));
    IDS.forEach(() => w.write(7, 4));
    w.write(1, 1); // q0 — «не обсуждается»
    const d = decode(seal(w.finish()), MANIFEST, { 1: ['q0'] });
    expect(d.responses.q0).toEqual({ ...answerFor(7), firm: true });
    expect(d.priorities).toBeUndefined();
  });

  it('порядок сфер в формате 4 совпадает со сферами выбора', () => {
    expect([...PRIORITY_SPHERES_V4]).toEqual(PRIORITY_SPHERES.map((s) => s.id));
  });

  it('важность и диапазон восстанавливаются из ответа', () => {
    const p: Profile = { name: 'x', bankVersion: 1, responses: { q0: answerFor(0), q1: answerFor(5), q2: answerFor(8) } };
    const d = decode(encode(p, IDS), MANIFEST);
    expect([d.responses.q0, d.responses.q1, d.responses.q2]).toEqual([answerFor(0), answerFor(5), answerFor(8)]);
  });
});
