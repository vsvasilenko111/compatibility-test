import { describe, it, expect } from 'vitest';
import { BANK_VERSION, CURRENT_FIRM, CURRENT_IDS, FIRM, MANIFEST, QUESTIONS } from '../src/questions';
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
  it('у каждого вопроса 5 вариантов; крайние совпадают с left и right', () => {
    for (const x of QUESTIONS) {
      expect(x.options, x.id).toHaveLength(5);
      expect([x.options![0], x.options![4]], x.id).toEqual([x.left, x.right]);
    }
  });
  it('в банке есть все три блока', () => {
    expect(new Set(QUESTIONS.map((x) => x.block))).toEqual(new Set(['friendship', 'relationship', 'maturity']));
  });
  it('сфер 22: 7 дружбы, 11 отношений и 4 зрелости', () => {
    expect(SPHERES.filter((s) => s.block === 'friendship')).toHaveLength(7);
    expect(SPHERES.filter((s) => s.block === 'relationship')).toHaveLength(11);
    expect(SPHERES.filter((s) => s.block === 'maturity')).toHaveLength(4);
  });
});

describe('полный банк', () => {
  const count = (sphere: string) => QUESTIONS.filter((x) => x.sphere === sphere).length;

  it('156 вопросов: 51 о партнёре как друге, 84 отношений и 21 зрелости', () => {
    expect(QUESTIONS).toHaveLength(156);
    expect(QUESTIONS.filter((x) => x.block === 'friendship')).toHaveLength(51);
    expect(QUESTIONS.filter((x) => x.block === 'relationship')).toHaveLength(84);
    expect(QUESTIONS.filter((x) => x.block === 'maturity')).toHaveLength(21);
  });

  it('блок зрелости — в конце, вопросы о прошлом — последними и подряд', () => {
    expect(QUESTIONS.slice(-21).every((x) => x.block === 'maturity')).toBe(true);
    expect(QUESTIONS.slice(-6).every((x) => x.sphere === 'past')).toBe(true);
  });

  it('в каждой сфере 4–12 вопросов', () => {
    for (const s of SPHERES.filter((x) => x.block !== 'maturity')) {
      const [min, max] = [4, 12];
      expect(count(s.id), s.id).toBeGreaterThanOrEqual(min);
      expect(count(s.id), s.id).toBeLessThanOrEqual(max);
    }
  });

  it('пропускать можно только вопросы о близости, о прошлом опыте и «когда ребёнок», и все они пропускаемые', () => {
    for (const x of QUESTIONS) expect(x.optional, x.id).toBe(x.sphere === 'intimacy' || x.sphere === 'past' || x.id === 'kids-08');
  });

  it('отметка «не обсуждается» — у 13 вопросов, список в коде ссылки совпадает с банком', () => {
    const firm = QUESTIONS.filter((x) => x.firm).map((x) => x.id);
    expect(firm).toHaveLength(13);
    expect(CURRENT_FIRM).toEqual(firm);
    expect(FIRM[8]).toBeUndefined();
  });

  it('манифест v12 не изменился; в v13 humor-01 и conflicts-05 заменены на humor-12 и conflicts-10 на тех же местах', () => {
    expect(MANIFEST[12]).toHaveLength(152);
    expect(MANIFEST[13]).toEqual(MANIFEST[12].map((id) => ({ 'humor-01': 'humor-12', 'conflicts-05': 'conflicts-10' })[id] ?? id));
  });

  it('манифест v8 не изменился — 141 вопрос', () => {
    expect(MANIFEST[8]).toHaveLength(141);
    expect(MANIFEST[8]).toContain('humor-10');
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
    expect(MANIFEST[7]).toHaveLength(136);
  });

  it('манифест v1 не изменился — старые ссылки открываются', () => {
    expect(MANIFEST[1]).toEqual([
      'humor-01', 'kids-01', 'money-01', 'home-01', 'conflicts-01', 'living-01',
      'rhythm-01', 'career-01', 'loyalty-01', 'intimacy-01', 'values-01', 'space-01',
    ]);
  });

  // 4 бита на вопрос + бит на отметку + 37 бит важности сфер: 156 вопросов, 13 отметок и имя в 40 байт → 180 символов.
  it('ссылка на полный банк с именем в 40 байт и важностью сфер — не длиннее 180 символов', () => {
    const responses = Object.fromEntries(CURRENT_IDS.map((id) => [id, { value: 10, lo: 0, hi: 10, importance: 3 as const, firm: true }]));
    const priorities = { kids: 'top', budget: 'top', loyalty: 'top', conflicts: 'top', values: 'top', humor: 'low', roles: 'low', career: 'low' } as const;
    const code = encode({ name: 'Александра-Анастасия', bankVersion: BANK_VERSION, responses, priorities }, CURRENT_IDS, CURRENT_FIRM);
    expect(code.length).toBeLessThanOrEqual(180);
  });
});

describe('validateBank ловит ошибки', () => {
  const ok = [q('a', 'humor'), q('b', 'honesty')];
  it('дубликат id', () => {
    const bank = [q('a', 'humor'), q('a', 'honesty')];
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
