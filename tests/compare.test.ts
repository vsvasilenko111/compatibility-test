import { describe, it, expect } from 'vitest';
import { compare, FIRM_FACTOR } from '../src/scoring/compare';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Answer, Profile, Question } from '../src/types';

const q = (id: string, block: Question['block'], sphere: string): Question => ({
  id, block, sphere, text: id, left: 'L', right: 'R', topic: `topic-${id}`, optional: false,
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
/** Ответ — номер варианта 1..5. */
const o = (n: number): Answer => answerFor(OPTION_VALUES[n - 1]);
const anya = () => profile({ kids: o(5), money: o(1), conf: o(5), home: o(3), space: o(4) });
const misha = () => profile({ kids: o(5), money: o(4), conf: o(2), home: o(3), space: o(4) });

describe('compare — пример Ани и Миши', () => {
  const r = compare(QS, anya(), misha());

  // По таблице MATCH: дети 5/5 → 1, деньги 1/4 → 0,1, ссоры 5/2 → 0,1, быт 3/3 → 0,9, пространство 4/4 → 0,95.
  it('отношения = (1 + 0,1 + 0,1 + 0,9 + 0,95) / 5 = 61%', () => {
    expect(r.relationship.percent).toBeCloseTo(61, 6);
  });
  it('дружба считается только по блоку friendship → (0,1 + 0,1) / 2 = 10%', () => {
    expect(r.friendship.percent).toBeCloseTo(10, 6);
    expect(r.friendship.spheres.map((s) => s.sphere)).toEqual(['money', 'conflicts']);
  });
  it('зоны для разговора — деньги и ссоры (через три варианта), флагов нет', () => {
    expect(ids(r.relationship.talkZones)).toEqual(['money', 'conf']);
    expect(r.relationship.redFlags).toEqual([]);
  });
  it('дети 5/5 — супер-совпадение, пространство 4/4 — сильное, быт 3/3 — без награды (середина)', () => {
    expect(ids(r.relationship.superMatches)).toEqual(['kids']);
    expect(ids(r.relationship.strongMatches)).toEqual(['space']);
    expect(r.relationship.superCount).toBe(1);
  });
  it('быт 3/3 — оба гибкие', () => {
    expect(r.relationship.flexibleCount).toBe(1);
  });
  it('в каждой сфере — темы её вопросов со степенью совпадения, без ответов', () => {
    const fr = r.relationship.spheres.find((x) => x.sphere === 'home')!;
    expect(fr.items).toHaveLength(1);
    expect(fr.items[0].id).toBe('home');
    expect(fr.items[0].topic).toBe('topic-home');
    expect(fr.items[0].match).toBeCloseTo(0.9, 10);
    expect(Object.keys(fr.items[0]).sort()).toEqual(['id', 'match', 'topic']);
  });
  it('ItemRef несёт topic и сферу, а не ответы', () => {
    expect(r.relationship.talkZones[0]).toEqual({ id: 'money', topic: 'topic-money', sphere: 'money' });
  });
});

describe('compare — граничные случаи', () => {
  it('противоположные края без отметки → тема для разговора, не флаг; (0 + 0,1 + 0,1 + 0,9 + 0,95) / 5 = 41%', () => {
    const m = misha();
    m.responses.kids = o(1);
    const r = compare(QS, anya(), m);
    expect(r.relationship.redFlags).toEqual([]);
    expect(r.relationship.percent).toBeCloseTo(41, 6);
    expect(ids(r.relationship.talkZones)).toContain('kids');
  });

  it('с отметкой «не обсуждается» → красный флаг, «отношения» × FIRM_FACTOR, «дружба» без штрафа', () => {
    const qs = QS.map((x) => (x.id === 'kids' ? { ...x, firm: true } : x));
    const m = misha();
    m.responses.kids = { ...o(1), firm: true };
    const r = compare(qs, anya(), m);
    expect(ids(r.relationship.redFlags)).toEqual(['kids']);
    expect(r.relationship.percent).toBeCloseTo(41 * FIRM_FACTOR, 6);
    expect(ids(r.relationship.talkZones)).not.toContain('kids');
    expect(r.friendship.percent).toBeCloseTo(compare(QS, anya(), misha()).friendship.percent!, 6);
  });

  it('отметка с расхождением в один вариант — не флаг', () => {
    const qs = QS.map((x) => (x.id === 'kids' ? { ...x, firm: true } : x));
    const m = misha();
    m.responses.kids = { ...o(4), firm: true };
    expect(compare(qs, anya(), m).relationship.redFlags).toEqual([]);
  });

  it('отметка у вопроса без firm в банке не действует', () => {
    const m = misha();
    m.responses.kids = { ...o(1), firm: true };
    expect(compare(QS, anya(), m).relationship.redFlags).toEqual([]);
  });

  it('пропущенный одним вопрос исключается для обоих: (1 + 0,1 + 0,9 + 0,95) / 4', () => {
    const m = misha();
    m.responses.money = 'skipped';
    expect(compare(QS, anya(), m).relationship.percent).toBeCloseTo(73.75, 6);
  });

  it('вопрос, которого нет в коде другого (старая версия банка), исключается: (1 + 0,1 + 0,1 + 0,9) / 4', () => {
    const m = misha();
    delete m.responses.space;
    expect(compare(QS, anya(), m).relationship.percent).toBeCloseTo(52.5, 6);
  });

  it('нет общих ответов → null', () => {
    const r = compare(QS, profile({}), profile({}));
    expect(r.relationship.percent).toBeNull();
    expect(r.relationship.spheres).toEqual([]);
  });

  it('награды: край к краю — супер, второй ко второму — сильное, по силе·важности', () => {
    const qs = Array.from({ length: 7 }, (_, i) => q(`h${i}`, 'friendship', i % 2 ? 'humor' : 'leisure'));
    const a = profile(Object.fromEntries(qs.map((x, i) => [x.id, o(i < 2 ? 5 : 4)])));
    const r = compare(qs, a, a);
    expect(ids(r.friendship.superMatches)).toEqual(['h0', 'h1']);
    expect(r.friendship.strongMatches).toHaveLength(5);
  });
});

describe('compare — веса сфер в «отношениях»', () => {
  const W = (s: string) => ({ kids: 1, conflicts: 0.05 } as Record<string, number>)[s] ?? 1;
  const qs = [q('k', 'relationship', 'kids'), q('c', 'friendship', 'conflicts')];
  const p2 = (k: number, c: number) => profile({ k: o(k), c: o(c) });

  it('расхождение по детям роняет «отношения» сильнее, чем расхождение в стиле ссор', () => {
    const kidsApart = compare(qs, p2(5, 3), p2(1, 3), W).relationship.percent!;
    const conflictsApart = compare(qs, p2(3, 5), p2(3, 1), W).relationship.percent!;
    expect(kidsApart).toBeLessThan(conflictsApart);
    expect(kidsApart).toBeLessThan(5);
    expect(conflictsApart).toBeGreaterThan(25);
  });
  it('расхождение в стиле ссор без отметки — тема для разговора, не флаг', () => {
    const r = compare(qs, p2(3, 5), p2(3, 1), W);
    expect(r.relationship.redFlags).toEqual([]);
    expect(ids(r.relationship.talkZones)).toEqual(['c']);
    expect(r.friendship.redFlags).toEqual([]);
  });
});

describe('compare — вопрос с scored: false', () => {
  it('в процент, флаги и темы не идёт', () => {
    const qs = [...QS, { ...q('ambition', 'relationship', 'career'), scored: false }];
    const a = anya(), b = misha();
    a.responses.ambition = o(1);
    b.responses.ambition = o(5);
    const r = compare(qs, a, b);
    expect(r.relationship.percent).toBeCloseTo(compare(QS, anya(), misha()).relationship.percent!, 6);
    expect(ids([...r.relationship.redFlags, ...r.relationship.talkZones])).not.toContain('ambition');
  });
});

describe('compare — веса «партнёр как друг»', () => {
  it('сфера с весом 0 не входит, сфера пары с весом входит', () => {
    const only = (s: string) => (s === 'money' || s === 'space' ? 1 : 0);
    const r = compare(QS, anya(), misha(), undefined, only);
    expect(r.friendship.spheres.map((s) => s.sphere).sort()).toEqual(['money', 'space']);
  });
});

describe('compare — личная важность сфер', () => {
  const qs = [q('k', 'relationship', 'kids'), q('m', 'relationship', 'budget')];
  // Дети совпали (fit 1), бюджет разошёлся (fit 0): без выбора у обоих 1/2 → 50%.
  const a = (): Profile => profile({ k: answerFor(10), m: answerFor(0) });
  const b = (): Profile => profile({ k: answerFor(10), m: answerFor(10) });

  it('без выбора — как раньше', () => {
    expect(compare(qs, a(), b()).relationship.percent).toBeCloseTo(50, 5);
  });
  it('важная сфера весит втрое больше только для выбравшего: √(3/4 · 1/2) ≈ 61,2%', () => {
    expect(compare(qs, { ...a(), priorities: { kids: 'top' } }, b()).relationship.percent).toBeCloseTo(Math.sqrt(3 / 4 / 2) * 100, 5);
  });
  it('«менее важная» из старых ссылок ничего не меняет', () => {
    expect(compare(qs, { ...a(), priorities: { budget: 'low' } }, b()).relationship.percent).toBeCloseTo(50, 5);
  });
  it('важность действует и на «партнёр как друг»', () => {
    const fw = () => 1;
    const pa = { ...a(), priorities: { kids: 'top' as const } };
    expect(compare(qs, pa, b(), undefined, fw).friendship.percent).toBeCloseTo(Math.sqrt(3 / 4 / 2) * 100, 5);
  });
  it('проценты по сферам от выбора не зависят', () => {
    const r = compare(qs, { ...a(), priorities: { kids: 'top' } }, b());
    expect(r.relationship.spheres.map((x) => x.percent)).toEqual(compare(qs, a(), b()).relationship.spheres.map((x) => x.percent));
  });
});
