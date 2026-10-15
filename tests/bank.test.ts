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
  it('в банке есть оба блока', () => {
    expect(new Set(QUESTIONS.map((x) => x.block))).toEqual(new Set(['friendship', 'relationship']));
  });
  it('сфер 17: 8 дружбы и 9 отношений', () => {
    expect(SPHERES.filter((s) => s.block === 'friendship')).toHaveLength(8);
    expect(SPHERES.filter((s) => s.block === 'relationship')).toHaveLength(9);
  });
});

describe('полный банк', () => {
  const count = (sphere: string) => QUESTIONS.filter((x) => x.sphere === sphere).length;

  it('116 вопросов: 60 дружбы и 56 отношений', () => {
    expect(QUESTIONS).toHaveLength(116);
    expect(QUESTIONS.filter((x) => x.block === 'friendship')).toHaveLength(60);
    expect(QUESTIONS.filter((x) => x.block === 'relationship')).toHaveLength(56);
  });

  it('в каждой сфере дружбы 7–8 вопросов, в каждой сфере отношений 6–7', () => {
    for (const s of SPHERES) {
      const [min, max] = s.block === 'friendship' ? [7, 8] : [6, 7];
      expect(count(s.id), s.id).toBeGreaterThanOrEqual(min);
      expect(count(s.id), s.id).toBeLessThanOrEqual(max);
    }
  });

  it('пропускать можно только вопросы о близости, и все они пропускаемые', () => {
    for (const x of QUESTIONS) expect(x.optional, x.id).toBe(x.sphere === 'intimacy');
  });

  it('манифест v1 не изменился — старые ссылки открываются', () => {
    expect(MANIFEST[1]).toEqual([
      'humor-01', 'kids-01', 'money-01', 'home-01', 'conflicts-01', 'living-01',
      'rhythm-01', 'career-01', 'loyalty-01', 'intimacy-01', 'values-01', 'space-01',
    ]);
  });

  it('ссылка на полный банк с именем в 40 байт — не длиннее 340 символов', () => {
    const responses = Object.fromEntries(CURRENT_IDS.map((id) => [id, { value: 10, lo: 0, hi: 10, importance: 3 as const }]));
    const code = encode({ name: 'Александра-Анастасия', bankVersion: BANK_VERSION, responses }, CURRENT_IDS);
    expect(code.length).toBeLessThanOrEqual(340);
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
  it('манифест не совпадает с порядком', () => {
    expect(validateBank(ok, ['b', 'a']).join()).toMatch(/манифест/);
  });
});
