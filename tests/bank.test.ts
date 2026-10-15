import { describe, it, expect } from 'vitest';
import { BANK_VERSION, CURRENT_IDS, MANIFEST, QUESTIONS } from '../src/questions';
import { SPHERES } from '../src/questions/spheres';
import { validateBank } from '../src/questions/validate';
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
