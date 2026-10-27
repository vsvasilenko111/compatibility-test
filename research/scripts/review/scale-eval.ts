// Банк v14: 5 вариантов словами вместо шкалы 0–10. Те же 132 персонажа ответили заново (answers-v14/, fresh/answers-v14/)
// и сами выбрали 5 важных и 3 наименее важных сферы (prio:<сфера>).
// 1) Согласие теста с критериями (c-index): v13 (0–10) против v14, без и с личной важностью сфер.
// 2) Калибровка: сырой процент на процентилях 0, 5, …, 100 по 870 случайным парам p1–p30 (как в analyze30.ts).
// 3) Ресурсы пары: доли уровней — пороги задумывались как верхняя и нижняя четверть.
// Запуск: npx vite-node research/scripts/review/scale-eval.ts
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';
import type { Priority, Profile, Question } from '../../../src/types';

const D = 'research/synthetic';
const F = `${D}/fresh`;
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];
const V13: Question[] = JSON.parse(execSync('git show 2d2b317:src/questions/bank.json', { encoding: 'utf8' })).questions;

function v13(dir: string, id: string): Profile {
  const raw = read(`${dir}/${id}.json`) as Record<string, number>;
  const alias: Record<string, string> = { 'humor-12': 'humor-01', 'conflicts-10': 'conflicts-05' };
  const responses: Profile['responses'] = {};
  for (const q of V13) {
    const v = raw[q.id] ?? raw[alias[q.id]];
    if (v === undefined) throw new Error(`${id}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(Math.max(0, Math.min(10, Math.round(v))));
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  return { name: id, bankVersion: 13, responses };
}
function v14(dir: string, id: string, values: readonly number[], withPrio: boolean): Profile {
  const raw = read(`${dir}/${id}.json`) as Record<string, number | string>;
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id] as number;
    if (v === undefined) throw new Error(`${id}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(values[v - 1]);
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  const priorities = Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith('prio:')).map(([k, v]) => [k.slice(5), v as Priority]));
  return { name: id, bankVersion: 14, responses, ...(withPrio ? { priorities } : {}) };
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
const fk: Key[] = (read(`${F}/combos.json`) as any[]).map((c) => [c.man, c.woman]);
const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
const js = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const E = fk.map((k) => (ja.get(id(k)).couple + jb.get(id(k)).couple) / 2);
const T = fk.map((k) => jt.get(id(k)).couple);
const S = fk.map((k) => { const s = js.get(id(k)); return (s.together / 100) * (s.satM + s.satW) / 20; });
const [rE, rT, rS] = [E, T, S].map(rankOf);
const ALL = fk.map((_, i) => (rE[i] + rT[i] + rS[i]) / 3);

type Load = (dir: string, pid: string) => Profile;
const score = (qs: Question[], a: Profile, b: Profile) => {
  const r = compare(qs, a, b, relationshipWeight, friendshipWeight);
  return [r.relationship.percent!, r.friendship.percent!];
};
function evaluate(name: string, qs: Question[], load: Load) {
  const o = ok.map(([m, w]) => score(qs, load(`${D}/answers`, m), load(`${D}/answers`, w)));
  const f = fk.map(([m, w]) => score(qs, load(`${F}/answers`, m), load(`${F}/answers`, w))[0]);
  console.log(`${name.padEnd(30)} | ${cidx(o.map((x) => x[0]), oE).toFixed(1)} ${cidx(o.map((x) => x[1]), oF).toFixed(1)} | ${[E, T, S, ALL].map((c) => cidx(f, c).toFixed(1)).join(' ')}`);
}

// Прежний результат (банк v13, шкала 0–10, прежняя формула) — из прогона до перехода: старые 82,2 72,7 | свежие 71,7 76,9 73,2 74,0.
// Здесь compare() уже с таблицей MATCH, поэтому строка v13 — старые ответы через новую формулу, а не прежний результат.
console.log('вариант                        | старые: пара друг | свежие: E T S ALL');
console.log('v13 (прежняя формула, справка) | 82.2 72.7 | 71.7 76.9 73.2 74.0');
evaluate('v13-ответы через новую формулу', V13, (dir, pid) => v13(dir, pid));
const dirV14 = (dir: string) => dir.replace(/answers$/, 'answers-v14');
evaluate('v14', QUESTIONS, (dir, pid) => v14(dirV14(dir), pid, [0, 3, 5, 7, 10], false));
evaluate('v14 + личная важность', QUESTIONS, (dir, pid) => v14(dirV14(dir), pid, [0, 3, 5, 7, 10], true));

// Калибровка — по формуле приложения (таблица MATCH) с личной важностью: так будут считаться настоящие пары.
const { pairs } = read(`${D}/personas30.json`);
const men: string[] = pairs.map((p: any) => p.man.id), women: string[] = pairs.map((p: any) => p.woman.id);
const real = new Set(pairs.map((p: any) => `${p.man.id}|${p.woman.id}`));
const P = new Map([...men, ...women].map((pid) => [pid, v14(`${D}/answers-v14`, pid, [0, 3, 5, 7, 10], true)]));
const rel: number[] = [], fr: number[] = [];
for (const m of men) for (const w of women) {
  if (real.has(`${m}|${w}`)) continue;
  const [x, y] = score(QUESTIONS, P.get(m)!, P.get(w)!);
  rel.push(x); fr.push(y);
}
const q = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return Array.from({ length: 21 }, (_, i) => +s[Math.min(s.length - 1, Math.round((i / 20) * (s.length - 1)))].toFixed(1));
};
console.log(`\nКалибровка (${rel.length} случайных пар):`);
console.log(`RELATIONSHIP_TABLE = ${JSON.stringify(q(rel))}`);
console.log(`FRIENDSHIP_TABLE = ${JSON.stringify(q(fr))}`);

// Ресурсы пары: доли уровней на тех же случайных парах.
const levels: Record<string, Record<string, number>> = {};
for (const m of men) for (const w of women) {
  if (real.has(`${m}|${w}`)) continue;
  for (const r of compare(QUESTIONS, P.get(m)!, P.get(w)!).resources ?? []) {
    levels[r.key] ??= { strong: 0, ok: 0, grow: 0 };
    levels[r.key][r.level]++;
  }
}
console.log('\nРесурсы пары (доли уровней на случайных парах, %):');
for (const [k, v] of Object.entries(levels)) {
  const n = v.strong + v.ok + v.grow;
  console.log(`  ${k.padEnd(12)} получается ${(100 * v.strong / n).toFixed(0)} · в целом ${(100 * v.ok / n).toFixed(0)} · зона роста ${(100 * v.grow / n).toFixed(0)}`);
}
