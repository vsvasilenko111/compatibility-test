// Личная важность сфер (5 важных ×2, 3 менее важных ×0,5): как она сдвигает сырые проценты и согласие с критериями.
// У синтетических персонажей выбора нет, поэтому два приближения:
//  random   — 5 и 3 случайные сферы (худший случай: выбор не связан с ответами);
//  informed — важные там, где ответы человека самые резкие (средний |ответ − 5|), менее важные — где самые мягкие.
// Банк v13: humor-12 и conflicts-10 берутся из ответов на humor-01 и conflicts-05 — смысл почти тот же.
// Запуск: npx vite-node research/scripts/review/priorities-eval.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { FRIENDSHIP_WEIGHTS, PRIORITY_LOW, PRIORITY_SPHERES, PRIORITY_TOP, RELATIONSHIP_WEIGHTS } from '../../../src/questions/spheres';
import { RELATIONSHIP_TABLE, FRIENDSHIP_TABLE } from '../../../src/scoring/calibration';
import { answerFor } from '../../../src/answer';
import type { Priority, Profile } from '../../../src/types';

const D = 'research/synthetic';
const ALIAS: Record<string, string> = { 'humor-12': 'humor-01', 'conflicts-10': 'conflicts-05' };
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];

function profile(dir: string, id: string): Profile {
  const raw = read(`${dir}/${id}.json`) as Record<string, number>;
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id] ?? raw[ALIAS[q.id]];
    if (v === undefined) throw new Error(`${id}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(Math.max(0, Math.min(10, Math.round(v))));
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  return { name: id, bankVersion: 13, responses };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
const pick = (order: string[]): Record<string, Priority> => ({
  ...Object.fromEntries(order.slice(0, PRIORITY_TOP).map((s) => [s, 'top'])),
  ...Object.fromEntries(order.slice(-PRIORITY_LOW).map((s) => [s, 'low'])),
});
const SPH = PRIORITY_SPHERES.map((s) => s.id);
function randomPriorities(r: () => number) {
  const order = [...SPH];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return pick(order);
}
function informedPriorities(p: Profile) {
  const strength = (s: string) => {
    const vs = QUESTIONS.filter((q) => q.sphere === s).map((q) => p.responses[q.id]).filter((a) => a && a !== 'skipped') as { value: number }[];
    return vs.reduce((t, a) => t + Math.abs(a.value - 5), 0) / Math.max(1, vs.length);
  };
  return pick([...SPH].sort((a, b) => strength(b) - strength(a)));
}

const rw = (s: string) => RELATIONSHIP_WEIGHTS[s] ?? 1;
const fw = (s: string) => FRIENDSHIP_WEIGHTS[s] ?? 0;
const score = (a: Profile, b: Profile) => {
  const r = compare(QUESTIONS, a, b, rw, fw);
  return [r.relationship.percent!, r.friendship.percent!];
};
const quant = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return Array.from({ length: 21 }, (_, i) => s[Math.min(s.length - 1, Math.round((i / 20) * (s.length - 1)))]);
};
const fmt = (t: readonly number[]) => [1, 5, 10, 15, 19].map((i) => t[i].toFixed(1)).join(' ');

// Случайные пары старой выборки — на них строилась калибровка.
const A = `${D}/answers`;
const people = Array.from({ length: 30 }, (_, i) => i + 1);
const base = new Map<string, Profile>();
for (const n of people) for (const g of ['m', 'w']) base.set(`p${n}${g}`, profile(A, `p${n}${g}`));
const pairs: Key[] = people.flatMap((m) => people.filter((w) => w !== m).map((w) => [`p${m}m`, `p${w}w`] as Key));

const variants: [string, (id: string, p: Profile, r: () => number) => Profile][] = [
  ['без выбора', (_, p) => p],
  ['random', (_, p, r) => ({ ...p, priorities: randomPriorities(r) })],
  ['informed', (_, p) => ({ ...p, priorities: informedPriorities(p) })],
];
console.log(`Сырой процент на процентилях 5/25/50/75/95 (${pairs.length} случайных пар)`);
console.log(`  таблица калибровки: отношения ${fmt(RELATIONSHIP_TABLE)} | друг ${fmt(FRIENDSHIP_TABLE)}`);
for (const [name, make] of variants) {
  const rel: number[] = [], fr: number[] = [];
  const repeats = name === 'random' ? 10 : 1;
  for (let k = 0; k < repeats; k++) {
    const r = rng(k + 1);
    const ps = new Map([...base].map(([id, p]) => [id, make(id, p, r)]));
    for (const [m, w] of pairs) { const [x, y] = score(ps.get(m)!, ps.get(w)!); rel.push(x); fr.push(y); }
  }
  console.log(`  ${name.padEnd(18)}: отношения ${fmt(quant(rel))} | друг ${fmt(quant(fr))}`);
}

// Согласие с критериями (c-index, %) на парах с оценками: старые (два эксперта) и свежие (эксперты, терапевт, симуляция).
function cidx(t: number[], e: number[]): number {
  let num = 0, den = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    if (e[i] === e[j]) continue;
    den++;
    const st = Math.sign(t[i] - t[j]), se = Math.sign(e[i] - e[j]);
    num += st === se ? 1 : st === 0 ? 0.5 : 0;
  }
  return (100 * num) / den;
}
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
const id = (k: Key) => k.join('|');
const ja30 = judge(`${D}/judge30.json`), jb30 = judge(`${D}/judge30b.json`);
const ok: Key[] = [...ja30.keys()].map((k) => k.split('|') as Key);
const oE = ok.map((k) => (ja30.get(id(k)).couple + jb30.get(id(k)).couple) / 2);
const F = `${D}/fresh`;
const fk: Key[] = (read(`${F}/combos.json`) as any[]).map((c) => [c.man, c.woman]);
const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
const js = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const E = fk.map((k) => (ja.get(id(k)).couple + jb.get(id(k)).couple) / 2);
const T = fk.map((k) => jt.get(id(k)).couple);
const S = fk.map((k) => { const s = js.get(id(k)); return (s.together / 100) * (s.satM + s.satW) / 20; });

console.log('\nСогласие с критериями, «отношения» (c-index): старые E | свежие E T S');
for (const [name, make] of variants) {
  const repeats = name === 'random' ? 10 : 1;
  const acc = [0, 0, 0, 0];
  for (let k = 0; k < repeats; k++) {
    const r = rng(k + 1);
    const cache = new Map<string, Profile>();
    const get = (dir: string, pid: string) => {
      const key = `${dir}/${pid}`;
      if (!cache.has(key)) cache.set(key, make(pid, profile(dir, pid), r));
      return cache.get(key)!;
    };
    const o = ok.map(([m, w]) => score(get(A, m), get(A, w))[0]);
    const f = fk.map(([m, w]) => score(get(`${F}/answers`, m), get(`${F}/answers`, w))[0]);
    [cidx(o, oE), cidx(f, E), cidx(f, T), cidx(f, S)].forEach((v, i) => { acc[i] += v / repeats; });
  }
  console.log(`  ${name.padEnd(18)}: ${acc[0].toFixed(1)} | ${acc.slice(1).map((v) => v.toFixed(1)).join(' ')}`);
}
