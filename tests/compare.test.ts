import { describe, it, expect } from 'vitest';
import { compare } from '../src/scoring/compare';
import type { Answer, ImportanceLevel, Profile, Question } from '../src/types';

const q = (id: string, block: Question['block'], sphere: string): Question => ({
  id, block, sphere, text: id, left: 'L', right: 'R', topic: `topic-${id}`, optional: false,
});
const ans = (value: number, lo: number, hi: number, importance: ImportanceLevel): Answer => ({
  value, lo, hi, importance,
});
const profile = (responses: Profile['responses']): Profile => ({ name: '', bankVersion: 1, responses });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

const QS = [
  q('kids', 'relationship', 'kids'),
  q('money', 'friendship', 'money'),
  q('conf', 'friendship', 'conflicts'),
  q('home', 'relationship', 'home'),
  q('space', 'relationship', 'space'),
];
const anya = () => profile({
  kids: ans(10, 9, 10, 3), money: ans(2, 0, 4, 2), conf: ans(9, 7, 10, 2),
  home: ans(4, 2, 6, 1), space: ans(8, 7, 10, 2),
});
const misha = () => profile({
  kids: ans(9, 5, 10, 2), money: ans(8, 0, 10, 1), conf: ans(3, 0, 10, 2),
  home: ans(6, 4, 8, 1), space: ans(8, 6, 10, 1),
});

describe('compare — пример Ани и Миши', () => {
  const r = compare(QS, anya(), misha());

  // fit по разнице ответов: дети 10/9 (одна сторона, разница вдвое мягче) → 11/12, деньги 2/8 → 0, ссоры 9/3 → 0, быт 4/6 (разные стороны) → 2/3, пространство 8/8 → 1
  it('отношения = √(56½/81 · 10⅚/23) ≈ 57,32%', () => {
    expect(r.relationship.percent).toBeCloseTo(57.32, 1);
  });
  it('дружба считается только по блоку friendship → 0%', () => {
    expect(r.friendship.percent).toBeCloseTo(0, 5);
    expect(r.friendship.spheres.map((s) => s.sphere)).toEqual(['money', 'conflicts']);
  });
  it('зоны для разговора — деньги и ссоры, флагов нет', () => {
    expect(ids(r.relationship.talkZones)).toEqual(['conf', 'money']);
    expect(r.relationship.redFlags).toEqual([]);
  });
  it('дети 10/9 при важности 50 и 10 → сильное совпадение', () => {
    expect(ids(r.relationship.strongMatches)).toEqual(['kids']);
    expect(r.relationship.superMatches).toEqual([]);
    expect(r.relationship.superCount).toBe(0);
  });
  it('жильё 4/6 — оба гибкие', () => {
    expect(r.relationship.flexibleCount).toBe(1);
  });
  it('в каждой сфере — темы её вопросов со степенью совпадения, без ответов', () => {
    const fr = r.relationship.spheres.find((x) => x.sphere === 'home')!;
    expect(fr.items).toHaveLength(1);
    expect(fr.items[0].id).toBe('home');
    expect(fr.items[0].topic).toBe('topic-home');
    expect(fr.items[0].match).toBeCloseTo(4 / 6, 10);
    expect(Object.keys(fr.items[0]).sort()).toEqual(['id', 'match', 'topic']);
  });
  it('ItemRef несёт topic и сферу, а не ответы', () => {
    expect(r.relationship.talkZones[0]).toEqual({ id: 'conf', topic: 'topic-conf', sphere: 'conflicts' });
  });
});

describe('compare — граничные случаи', () => {
  it('критичное расхождение → красный флаг и ≈9,77%', () => {
    const m = misha();
    m.responses.kids = ans(0, 0, 10, 2);
    const r = compare(QS, anya(), m);
    expect(ids(r.relationship.redFlags)).toEqual(['kids']);
    expect(r.relationship.percent).toBeCloseTo(9.77, 1);
    expect(ids(r.relationship.talkZones)).not.toContain('kids');
  });

  it('пропущенный одним вопрос исключается для обоих', () => {
    const m = misha();
    m.responses.money = 'skipped';
    expect(compare(QS, anya(), m).relationship.percent).toBeCloseTo(62.60, 1);
  });

  it('вопрос, которого нет в коде другого (старая версия банка), исключается', () => {
    const m = misha();
    delete m.responses.space;
    expect(compare(QS, anya(), m).relationship.percent).toBeCloseTo(54.10, 1);
  });

  it('у обоих все веса 0 → null, и у сфер тоже null', () => {
    const zero = profile(Object.fromEntries(QS.map((x) => [x.id, ans(5, 0, 10, 0)])));
    const r = compare(QS, zero, zero);
    expect(r.relationship.percent).toBeNull();
    expect(r.relationship.spheres.every((s) => s.percent === null)).toBe(true);
  });

  it('у одного все веса 0 → его S = 1', () => {
    const zero = profile(Object.fromEntries(QS.map((x) => [x.id, ans(5, 0, 10, 0)])));
    // S_A = 1; Миша против пятёрок: дети 9 → 2/6, деньги 8 → 3/6, ссоры 3 → 4/6, быт 6 → 5/6, пространство 8 → 3/6
    // S_B = (10·2/6 + 1·3/6 + 10·4/6 + 1·5/6 + 1·3/6)/23 = (71/6)/23
    expect(compare(QS, zero, misha()).relationship.percent).toBeCloseTo(Math.sqrt((71 / 6) / 23) * 100, 5);
  });

  it('супер-совпадения: считаются все, показываются топ-5 по силе·весу', () => {
    const qs = Array.from({ length: 7 }, (_, i) => q(`h${i}`, 'friendship', i % 2 ? 'humor' : 'leisure'));
    const a = profile(Object.fromEntries(qs.map((x, i) => [x.id, ans(i < 2 ? 10 : 9, 0, 10, 2)])));
    const r = compare(qs, a, a);
    expect(r.friendship.superCount).toBe(7);
    expect(r.friendship.superMatches).toHaveLength(5);
    expect(ids(r.friendship.superMatches).slice(0, 2)).toEqual(['h0', 'h1']);
  });
});

describe('compare — веса сфер в «отношениях»', () => {
  const W = (s: string) => ({ kids: 1, conflicts: 0.05 } as Record<string, number>)[s] ?? 1;
  const qs = [q('k', 'relationship', 'kids'), q('c', 'friendship', 'conflicts')];
  const p2 = (k: number, c: number) => profile({ k: ans(k, k, k, k >= 9 || k <= 1 ? 3 : 2), c: ans(c, c, c, c >= 9 || c <= 1 ? 3 : 2) });

  it('расхождение по детям роняет «отношения» сильнее, чем расхождение в стиле ссор', () => {
    const kidsApart = compare(qs, p2(10, 5), p2(0, 5), W).relationship.percent!;
    const conflictsApart = compare(qs, p2(5, 10), p2(5, 0), W).relationship.percent!;
    expect(kidsApart).toBeLessThan(conflictsApart);
    expect(kidsApart).toBeLessThan(1);
    expect(conflictsApart).toBeGreaterThan(25);
  });
  it('в сферах с весом < 0,4 красного флага нет — только «обсудить»; в «дружбе» флаг остаётся', () => {
    const r = compare(qs, p2(5, 10), p2(5, 0), W);
    expect(r.relationship.redFlags).toEqual([]);
    expect(ids(r.relationship.talkZones)).toEqual(['c']);
    expect(ids(r.friendship.redFlags)).toEqual(['c']);
  });
  it('без весов поведение прежнее', () => {
    expect(compare(qs, p2(5, 10), p2(5, 0)).relationship.redFlags.map((x) => x.id)).toEqual(['c']);
  });
});

describe('compare — вопрос с scored: false', () => {
  it('в процент, флаги и темы не идёт', () => {
    const qs = [...QS, { ...q('ambition', 'relationship', 'career'), scored: false }];
    const a = anya(), b = misha();
    a.responses.ambition = ans(0, 0, 1, 3);
    b.responses.ambition = ans(10, 9, 10, 3);
    const r = compare(qs, a, b);
    expect(r.relationship.percent).toBeCloseTo(compare(QS, anya(), misha()).relationship.percent!, 6);
    expect(ids([...r.relationship.redFlags, ...r.relationship.talkZones])).not.toContain('ambition');
  });
});
