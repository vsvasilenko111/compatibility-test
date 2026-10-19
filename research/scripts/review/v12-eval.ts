// Банк v12: сфера «Образ жизни и увлечения». Как меняется согласие теста с критериями при весе сферы 0 / 0,5 / 1.
// Старые: 120 комбинаций p1–p30 (два эксперта). Свежие: 60 комбинаций — эксперты E, терапевт T, симуляция трёх лет S, ALL — средний ранг.
// Критерии ставились по биографиям до появления новых вопросов, поэтому это проверка, а не подгонка.
// Запуск: npx vite-node research/scripts/review/v12-eval.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { FRIENDSHIP_WEIGHTS, RELATIONSHIP_WEIGHTS } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';
import type { Profile } from '../../../src/types';

const D = 'research/synthetic';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];
function profile(dir: string, id: string): Profile {
  const raw = read(`${dir}/${id}.json`) as Record<string, number>;
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id];
    if (v === undefined) throw new Error(`${id}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(Math.max(0, Math.min(10, Math.round(v))));
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  return { name: id, bankVersion: 12, responses };
}
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
const rankOf = (v: number[]) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length - 1) / 2 + 1);
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
const id = (k: Key) => k.join('|');

const ja30 = judge(`${D}/judge30.json`), jb30 = judge(`${D}/judge30b.json`);
const ok: Key[] = [...ja30.keys()].map((k) => k.split('|') as Key);
const oE = ok.map((k) => (ja30.get(id(k)).couple + jb30.get(id(k)).couple) / 2);
const oF = ok.map((k) => (ja30.get(id(k)).friends + jb30.get(id(k)).friends) / 2);

const F = `${D}/fresh`;
const fk: Key[] = (read(`${F}/combos.json`) as any[]).map((c) => [c.man, c.woman]);
const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
const js = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const E = fk.map((k) => (ja.get(id(k)).couple + jb.get(id(k)).couple) / 2);
const T = fk.map((k) => jt.get(id(k)).couple);
const S = fk.map((k) => { const s = js.get(id(k)); return (s.together / 100) * (s.satM + s.satW) / 20; });
const [rE, rT, rS] = [E, T, S].map(rankOf);
const ALL = fk.map((_, i) => (rE[i] + rT[i] + rS[i]) / 3);

const run = (dir: string, keys: Key[], wr: number, wf: number) => keys.map(([m, w]) => {
  const r = compare(QUESTIONS, profile(dir, m), profile(dir, w),
    (s) => (s === 'lifestyle' ? wr : RELATIONSHIP_WEIGHTS[s] ?? 1),
    (s) => (s === 'lifestyle' ? wf : FRIENDSHIP_WEIGHTS[s] ?? 0));
  return [r.relationship.percent!, r.friendship.percent!];
});
console.log('вес «образ жизни» (отношения / друг) | старые E, друг | свежие E T S ALL');
for (const [wr, wf] of [[0, 0], [0.4, 1], [0.5, 1], [0.7, 1], [1, 1]]) {
  const o = run(`${D}/answers`, ok, wr, wf), f = run(`${F}/answers`, fk, wr, wf);
  const t = f.map((x) => x[0]);
  console.log(`  ${wr} / ${wf}: старые ${cidx(o.map((x) => x[0]), oE).toFixed(1)}, ${cidx(o.map((x) => x[1]), oF).toFixed(1)}`
    + ` | свежие ${cidx(t, E).toFixed(1)} ${cidx(t, T).toFixed(1)} ${cidx(t, S).toFixed(1)} ${cidx(t, ALL).toFixed(1)}`);
}
// Различает ли сфера пары: разброс совпадения сферы по случайным комбинациям старой выборки.
const ids = Array.from({ length: 30 }, (_, i) => i + 1);
const sph = ids.flatMap((m) => ids.filter((w) => w !== m).map((w) =>
  compare(QUESTIONS, profile(`${D}/answers`, `p${m}m`), profile(`${D}/answers`, `p${w}w`)).relationship.spheres.find((s) => s.sphere === 'lifestyle')!.percent!));
sph.sort((a, b) => a - b);
console.log(`Совпадение в сфере у случайных пар: медиана ${sph[sph.length >> 1].toFixed(0)}%, 10–90% ${sph[Math.floor(sph.length * 0.1)].toFixed(0)}–${sph[Math.floor(sph.length * 0.9)].toFixed(0)}%`);
