import { describe, it, expect } from 'vitest';
import { BANK_VERSION, CURRENT_IDS, MANIFEST, QUESTIONS } from '../src/questions';
import { SPHERES } from '../src/questions/spheres';
import { validateBank } from '../src/questions/validate';
import { encode } from '../src/codec/codec';
import type { Question } from '../src/types';

const q = (id: string, sphere: string, block: Question['block'] = 'friendship'): Question => ({
  id, block, sphere, text: 't', left: 'l', right: 'r', topic: 'topic', optional: false,
});

describe('банк вопросов', () => {
  it('настоящий банк проходит валидацию', () => {
    expect(validateBank(QUESTIONS, CURRENT_IDS)).toEqual([]);
  });
  it('манифест содержит текущую версию', () => {
    expect(MANIFEST[BANK_VERSION]).toBe(CURRENT_IDS);
  });
  it('в банке есть все три блока', () => {
    expect(new Set(QUESTIONS.map((x) => x.block))).toEqual(new Set(['friendship', 'relationship', 'maturity']));
  });
  it('сфер 21: 8 дружбы, 9 отношений и 4 зрелости', () => {
    expect(SPHERES.filter((s) => s.block === 'friendship')).toHaveLength(8);
    expect(SPHERES.filter((s) => s.block === 'relationship')).toHaveLength(9);
    expect(SPHERES.filter((s) => s.block === 'maturity')).toHaveLength(4);
  });
});

describe('полный банк', () => {
  const count = (sphere: string) => QUESTIONS.filter((x) => x.sphere === sphere).length;

  it('136 вопросов: 57 о партнёре как друге, 58 отношений и 21 зрелости', () => {
    expect(QUESTIONS).toHaveLength(136);
    expect(QUESTIONS.filter((x) => x.block === 'friendship')).toHaveLength(57);
    expect(QUESTIONS.filter((x) => x.block === 'relationship')).toHaveLength(58);
    expect(QUESTIONS.filter((x) => x.block === 'maturity')).toHaveLength(21);
  });

  it('блок зрелости — в конце, вопросы о прошлом — последними и подряд', () => {
    expect(QUESTIONS.slice(-21).every((x) => x.block === 'maturity')).toBe(true);
    expect(QUESTIONS.slice(-6).every((x) => x.sphere === 'past')).toBe(true);
  });

  it('в каждой сфере дружбы 4–9 вопросов, в каждой сфере отношений 6–8', () => {
    for (const s of SPHERES.filter((x) => x.block !== 'maturity')) {
      const [min, max] = s.block === 'friendship' ? [4, 9] : [6, 8];
      expect(count(s.id), s.id).toBeGreaterThanOrEqual(min);
      expect(count(s.id), s.id).toBeLessThanOrEqual(max);
    }
  });

  it('пропускать можно только вопросы о близости и о прошлом опыте, и все они пропускаемые', () => {
    for (const x of QUESTIONS) expect(x.optional, x.id).toBe(x.sphere === 'intimacy' || x.sphere === 'past');
  });

  it('манифест v3 не изменился — 118 вопросов, без блока зрелости', () => {
    expect(MANIFEST[3]).toHaveLength(118);
    expect(MANIFEST[4].slice(0, 118)).toEqual(MANIFEST[3]);
  });

  it('манифест v4 не изменился — 136 вопросов; v5 содержит все его вопросы', () => {
    expect(MANIFEST[4]).toHaveLength(136);
    expect(MANIFEST[4].every((id) => MANIFEST[5].includes(id))).toBe(true);
    expect(MANIFEST[5]).toHaveLength(141);
    expect(MANIFEST[6]).toHaveLength(136);
  });

  it('манифест v1 не изменился — старые ссылки открываются', () => {
    expect(MANIFEST[1]).toEqual([
      'humor-01', 'kids-01', 'money-01', 'home-01', 'conflicts-01', 'living-01',
      'rhythm-01', 'career-01', 'loyalty-01', 'intimacy-01', 'values-01', 'space-01',
    ]);
  });

  // 4 бита на вопрос: 136 вопросов + имя в 40 байт → 151 символ.
  it('ссылка на полный банк с именем в 40 байт — не длиннее 155 символов', () => {
    const responses = Object.fromEntries(CURRENT_IDS.map((id) => [id, { value: 10, lo: 0, hi: 10, importance: 3 as const }]));
    const code = encode({ name: 'Александра-Анастасия', bankVersion: BANK_VERSION, responses }, CURRENT_IDS);
    expect(code.length).toBeLessThanOrEqual(155);
  });
});

describe('validateBank ловит ошибки', () => {
  const ok = [q('a', 'humor'), q('b', 'money')];
  it('дубликат id', () => {
    const bank = [q('a', 'humor'), q('a', 'money')];
    expect(validateBank(bank, ['a', 'a']).join()).toMatch(/дубликат id: a/);
  });
  it('пустое поле', () => {
    const bank = [{ ...q('a', 'humor'), topic: ' ' }];
    expect(validateBank(bank, ['a']).join()).toMatch(/пустое поле topic/);
  });
  it('неизвестная сфера и не тот блок', () => {
    expect(validateBank([q('a', 'nope')], ['a']).join()).toMatch(/неизвестная сфера/);
    expect(validateBank([q('a', 'kids', 'friendship')], ['a']).join()).toMatch(/относится к блоку relationship/);
  });
  it('два вопроса одной сферы подряд', () => {
    expect(validateBank([q('a', 'humor'), q('b', 'humor')], ['a', 'b']).join()).toMatch(/подряд/);
  });
  it('подряд можно только в сфере-подблоке', () => {
    expect(validateBank([q('a', 'past', 'maturity'), q('b', 'past', 'maturity')], ['a', 'b'])).toEqual([]);
  });
  it('манифест не совпадает с порядком', () => {
    expect(validateBank(ok, ['b', 'a']).join()).toMatch(/манифест/);
  });
});
