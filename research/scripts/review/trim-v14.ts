// Банк v14: какие вопросы можно убрать. Для каждого вопроса, влияющего на проценты:
// SD — разброс номера варианта у 132 персонажей; дубль — сильнейшая |r| с другим вопросом;
// Δ — как меняется согласие с критериями без вопроса (свежие — средний ранг E/T/S; старые — эксперты «пара»). Δ > 0 — без вопроса лучше.
// Запуск: npx vite-node research/scripts/review/trim-v14.ts [id,id,…]
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '../../../src/questions/spheres';
import { answerFor, OPTION_VALUES } from '../../../src/answer';
import type { Priority, Profile } from '../../../src/types';

const D = 'research/synthetic', F = `${D}/fresh`;
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];
const raws = new Map<string, Record<string, any>>();
function profile(dir: string, id: string): Profile {
  const r = read(`${dir}/${id}.json`); raws.set(id, r);
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = r[q.id];
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(OPTION_VALUES[v - 1]);
    responses[q.id] = q.firm && r[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  const priorities = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith('prio:')).map(([k, v]) => [k.slice(5), v as Priority]));
  return { name: id, bankVersion: 14, responses, priorities };
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
const fk: Key[] = (read(`${F}/combos.json`) as any[]).map((c) => [c.man, c.woman]);
const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
const js = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const E = fk.map((k) => (ja.get(id(k)).couple + jb.get(id(k)).couple) / 2);
const T = fk.map((k) => jt.get(id(k)).couple);
const S = fk.map((k) => { const s = js.get(id(k)); return (s.together / 100) * (s.satM + s.satW) / 20; });
const [rE, rT, rS] = [E, T, S].map(rankOf);
const ALL = fk.map((_, i) => (rE[i] + rT[i] + rS[i]) / 3);

const P = new Map<string, Profile>();
for (const [m, w] of ok) for (const x of [m, w]) if (!P.has(x)) P.set(x, profile(`${D}/answers-v14`, x));
for (const [m, w] of fk) for (const x of [m, w]) if (!P.has(x)) P.set(x, profile(`${F}/answers-v14`, x));
const all: string[] = [];
for (let n = 1; n <= 46; n++) for (const g of ['m', 'w']) { const x = `p${n}${g}`; if (!P.has(x)) P.set(x, profile(`${D}/answers-v14`, x)); }
for (let n = 47; n <= 66; n++) for (const g of ['m', 'w']) { const x = `p${n}${g}`; if (!P.has(x)) P.set(x, profile(`${F}/answers-v14`, x)); }
for (const k of P.keys()) all.push(k);

const scored = QUESTIONS.filter((q) => q.block !== 'maturity' && q.scored !== false);
const run = (qs = QUESTIONS) => ({
  fresh: cidx(fk.map(([m, w]) => compare(qs, P.get(m)!, P.get(w)!, relationshipWeight, friendshipWeight).relationship.percent!), ALL),
  old: cidx(ok.map(([m, w]) => compare(qs, P.get(m)!, P.get(w)!, relationshipWeight, friendshipWeight).relationship.percent!), oE),
});
const base = run();
const vec = (qid: string) => all.map((x) => raws.get(x)![qid] as number);
const r = (a: number[], b: number[]) => {
  const ok2 = a.map((_, i) => i).filter((i) => a[i] > 0 && b[i] > 0);
  const ma = ok2.reduce((s, i) => s + a[i], 0) / ok2.length, mb = ok2.reduce((s, i) => s + b[i], 0) / ok2.length;
  let c = 0, va = 0, vb = 0;
  for (const i of ok2) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va && vb ? c / Math.sqrt(va * vb) : 0;
};
console.log(`Сейчас: свежие ${base.fresh.toFixed(1)}, старые «пара» ${base.old.toFixed(1)}\n`);
// С аргументом — проверка удаления набора: npx vite-node research/scripts/review/trim-v14.ts id,id,…
const drop = process.argv[2]?.split(',');
if (drop) {
  const w = run(QUESTIONS.filter((x) => !drop.includes(x.id)));
  console.log(`Без ${drop.length} вопросов: свежие ${w.fresh.toFixed(1)} (${(w.fresh - base.fresh).toFixed(1)}), старые «пара» ${w.old.toFixed(1)} (${(w.old - base.old).toFixed(1)})`);
  process.exit(0);
}
console.log('id | SD | топ-вариант | дубль | Δ свежие | Δ старые | вопрос');
const rows = scored.map((q) => {
  const v = vec(q.id).filter((x) => x > 0);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  const top = Math.max(...[1, 2, 3, 4, 5].map((k) => v.filter((x) => x === k).length)) / v.length;
  let dup = { id: '', r: 0 };
  for (const o of scored) if (o.id !== q.id) { const rr = Math.abs(r(vec(q.id), vec(o.id))); if (rr > dup.r) dup = { id: o.id, r: rr }; }
  const without = run(QUESTIONS.filter((x) => x.id !== q.id));
  return { q, sd, top, dup, df: without.fresh - base.fresh, dold: without.old - base.old };
}).sort((a, b) => (b.df + b.dold) - (a.df + a.dold));
for (const x of rows) console.log(`${x.q.id} | ${x.sd.toFixed(2)} | ${(100 * x.top).toFixed(0)}% | ${x.dup.r.toFixed(2)} ${x.dup.id} | ${x.df.toFixed(2)} | ${x.dold.toFixed(2)} | ${x.q.text.slice(0, 70)}`);
