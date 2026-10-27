// Личная важность сфер на банке v14 (новые 18 сфер, выбор самих персонажей): сила множителя, нужны ли «неважные», влиять ли на «друга».
// но совпадение по вопросу и вес вопроса подставляются из варианта схемы. Сверка: схема «сейчас» должна дать ровно compare().
// Запуск: npx vite-node research/scripts/review/priorities-eval-v14.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare, PRIORITY_FACTOR } from '../../../src/scoring/compare';
import { fit } from '../../../src/scoring/primitives';
import { FRIENDSHIP_WEIGHTS, RELATIONSHIP_WEIGHTS } from '../../../src/questions/spheres';
import { answerFor, OPTION_VALUES } from '../../../src/answer';
import { IMPORTANCE_WEIGHTS, type Priority, type Profile } from '../../../src/types';

let FACT: Record<string, number> = { ...PRIORITY_FACTOR };
const D = 'research/synthetic', F = `${D}/fresh`;
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];
// Ответ персонажа: номер варианта 1..5 (или -1) и выбор сфер.
interface Raw { opt: Record<string, number>; prio: Record<string, Priority> }
const cache = new Map<string, Raw>();
function raw(dir: string, id: string): Raw {
  const k = `${dir}/${id}`;
  if (!cache.has(k)) {
    const r = read(`${dir}/${id}.json`);
    cache.set(k, { opt: r, prio: Object.fromEntries(Object.entries(r).filter(([x]) => x.startsWith('prio:')).map(([x, v]) => [x.slice(5), v as Priority])) });
  }
  return cache.get(k)!;
}

const SCORED = QUESTIONS.filter((q) => q.block !== 'maturity' && q.scored !== false);
interface Scheme { name: string; match(i: number, j: number): number; weight(i: number, j: number): number }
const val = (i: number) => OPTION_VALUES[i];
const oldFit = (a: number, b: number) => Math.max(0, 1 - (Math.abs(a - b) * ((a - 5) * (b - 5) > 0 ? 0.5 : 1)) / 6);
const STEPS = (t: number[]) => (i: number, j: number) => t[Math.abs(i - j)];
const BASE = STEPS([1, 0.75, 0.35, 0.1, 0]);
const edge = (i: number) => i === 0 || i === 4;
const SCHEMES: Scheme[] = [
  // Прежняя формула (до банка v14): 1/6 за деление, по одну сторону от середины вдвое мягче; вес — из удалённости от середины.
  { name: 'было: 0/3/5/7/10, веса 50/10/1', match: (i, j) => oldFit(val(i), val(j)), weight: (i) => IMPORTANCE_WEIGHTS[answerFor(val(i)).importance] },
  { name: 'было, но все вопросы равны', match: (i, j) => oldFit(val(i), val(j)), weight: () => 1 },
  { name: 'шаги 100/75/35/10/0, равные', match: STEPS([1, 0.75, 0.35, 0.1, 0]), weight: () => 1 },
  { name: 'шаги 100/75/35/10/0, края ×1,5', match: STEPS([1, 0.75, 0.35, 0.1, 0]), weight: (i) => (i === 0 || i === 4 ? 1.5 : 1) },
  { name: 'шаги 100/60/20/0/0, равные', match: STEPS([1, 0.6, 0.2, 0, 0]), weight: () => 1 },
  { name: 'шаги 100/80/50/20/0, равные', match: STEPS([1, 0.8, 0.5, 0.2, 0]), weight: () => 1 },
  // Как учесть, что совпасть в крайнем варианте лучше, чем в среднем.
  { name: '1) вес: края ×1,3, 2-й/4-й ×1,15', match: BASE, weight: (i) => [1.3, 1.15, 1, 1.15, 1.3][i] },
  { name: '2) совпадение: края 100, 2/4 95, сер. 90', match: (i, j) => (i === j ? [1, 0.95, 0.9, 0.95, 1][i] : BASE(i, j)), weight: () => 1 },
  { name: '2б) совпадение: края 100, 2/4 90, сер. 80', match: (i, j) => (i === j ? [1, 0.9, 0.8, 0.9, 1][i] : BASE(i, j)), weight: () => 1 },
  { name: '3) бонус: оба в одном крае → вес ×1,3', match: BASE, weight: (i, j) => (i === j && edge(i) ? 1.3 : 1) },
  { name: '3б) бонус: оба в одном крае → вес ×1,6', match: BASE, weight: (i, j) => (i === j && edge(i) ? 1.6 : 1) },
];

function percent(s: Scheme, a: Raw, b: Raw, sw: (sphere: string) => number, prio: boolean): number {
  let nA = 0, dA = 0, nB = 0, dB = 0;
  for (const q of SCORED) {
    const k = sw(q.sphere);
    if (!k) continue;
    const x = a.opt[q.id], y = b.opt[q.id];
    if (x < 0 || y < 0) continue;
    const i = x - 1, j = y - 1;
    const mA = prio && a.prio[q.sphere] ? FACT[a.prio[q.sphere]] : 1;
    const mB = prio && b.prio[q.sphere] ? FACT[b.prio[q.sphere]] : 1;
    const wA = k * mA * s.weight(i, j), wB = k * mB * s.weight(j, i);
    nA += wA * s.match(i, j); dA += wA;
    nB += wB * s.match(j, i); dB += wB;
  }
  return Math.sqrt((nA / dA) * (nB / dB)) * 100;
}
const rw = (s: string) => RELATIONSHIP_WEIGHTS[s] ?? 1;
const fw = (s: string) => FRIENDSHIP_WEIGHTS[s] ?? 0;

// Сверка со compare() на одной паре.
{
  const a = raw(`${D}/answers-v14`, 'p1m'), b = raw(`${D}/answers-v14`, 'p1w');
  const prof = (r: Raw): Profile => ({ name: '', bankVersion: 14, priorities: r.prio,
    responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r.opt[q.id] < 0 ? 'skipped' : answerFor(val(r.opt[q.id] - 1))])) });
  const ref = compare(QUESTIONS, prof(a), prof(b), rw).relationship.percent!;
  // В приложении — схема «2)»: таблица MATCH (fit) и равные веса.
  const mine = percent({ name: 'приложение', match: (i, j) => fit(answerFor(val(i)), answerFor(val(j))), weight: () => 1 }, a, b, rw, true);
  const scheme2 = percent(SCHEMES.find((x) => x.name.startsWith('2)'))!, a, b, rw, true);
  if (Math.abs(scheme2 - mine) > 1e-6) throw new Error(`MATCH ≠ схеме 2: ${mine} ≠ ${scheme2}`);
  if (Math.abs(ref - mine) > 1e-6) throw new Error(`сверка не сошлась: compare ${ref} ≠ ${mine}`);
  console.log(`Сверка со compare(): ${ref.toFixed(3)} = ${mine.toFixed(3)} ✓\n`);
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

const S2 = SCHEMES.find((x) => x.name.startsWith('2)'))!;
console.log('важные × / неважные × | старые: пара друг | свежие: E T S ALL');
for (const [t, l, fr] of [[1, 1, 1], [2, 0.5, 1], [2, 1, 1], [2.5, 1, 1], [3, 1, 1], [2.5, 1, 0], [3, 0.33, 1]] as [number, number, number][]) {
  FACT = { top: t, low: l };
  const o = ok.map(([m, w]) => [percent(S2, raw(`${D}/answers-v14`, m), raw(`${D}/answers-v14`, w), rw, true), percent(S2, raw(`${D}/answers-v14`, m), raw(`${D}/answers-v14`, w), fw, fr === 1)]);
  const f = fk.map(([m, w]) => percent(S2, raw(`${F}/answers-v14`, m), raw(`${F}/answers-v14`, w), rw, true));
  console.log(`×${t} / ×${l}${fr ? '' : ', друг без'}`.padEnd(22) + ` | ${cidx(o.map((x) => x[0]), oE).toFixed(1)} ${cidx(o.map((x) => x[1]), oF).toFixed(1)} | ${[E, T, S, ALL].map((c) => cidx(f, c).toFixed(1)).join(' ')}`);
}
