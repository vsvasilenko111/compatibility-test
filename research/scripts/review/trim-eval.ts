// Какие вопросы можно убрать, чтобы сократить тест. Для каждого вопроса отношений и дружбы:
// SD — разброс ответов 132 персонажей (мало разброса — вопрос почти не различает людей);
// дубль — самая сильная корреляция с другим вопросом (|r|); Δ — как меняется согласие теста с критериями, если вопрос убрать
// (свежие 60 комбинаций — средний ранг E/T/S; старые 120 — эксперты «как пара» и «как друзья»). Δ > 0 — без вопроса лучше.
// Запуск: npx vite-node research/scripts/review/trim-eval.ts [id,id,…] — с аргументом проверяется удаление набора целиком.
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';
import type { Profile, Question } from '../../../src/types';

const D = 'research/synthetic';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];
const raws = new Map<string, Record<string, number>>();
function profile(dir: string, id: string): Profile {
  const raw = read(`${dir}/${id}.json`) as Record<string, number>; raws.set(id, raw);
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id];
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(Math.max(0, Math.min(10, Math.round(v))));
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  return { name: id, bankVersion: 12, responses };
}
function cidx(t: number[], e: number[]): number {
  let num = 0, den = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    if (e[i] === e[j]) continue; den++;
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

const P = new Map<string, Profile>();
const pr = (dir: string, x: string) => P.get(x) ?? (P.set(x, profile(dir, x)), P.get(x)!);
const oldPairs = ok.map(([m, w]) => [pr(`${D}/answers`, m), pr(`${D}/answers`, w)] as const);
const freshPairs = fk.map(([m, w]) => [pr(`${F}/answers`, m), pr(`${F}/answers`, w)] as const);
function score(qs: Question[]) {
  const o = oldPairs.map(([a, b]) => compare(qs, a, b, relationshipWeight, friendshipWeight));
  const f = freshPairs.map(([a, b]) => compare(qs, a, b, relationshipWeight, friendshipWeight).relationship.percent!);
  return { fresh: cidx(f, ALL), old: cidx(o.map((r) => r.relationship.percent!), oE), fr: cidx(o.map((r) => r.friendship.percent!), oF) };
}
const scored = QUESTIONS.filter((q) => q.block !== 'maturity');
const base = score(QUESTIONS);
console.log(`Сейчас: свежие ${base.fresh.toFixed(1)}, старые «пара» ${base.old.toFixed(1)}, старые «друзья» ${base.fr.toFixed(1)}`);

const arg = process.argv[2];
if (arg) {
  const drop = new Set(arg.split(','));
  const s = score(QUESTIONS.filter((q) => !drop.has(q.id)));
  console.log(`Без ${drop.size} вопросов: свежие ${s.fresh.toFixed(1)} (${(s.fresh - base.fresh).toFixed(1)}), старые «пара» ${s.old.toFixed(1)} (${(s.old - base.old).toFixed(1)}), «друзья» ${s.fr.toFixed(1)} (${(s.fr - base.fr).toFixed(1)})`);
  process.exit(0);
}
const people = [...raws.keys()];
const col = (qid: string) => people.map((p) => raws.get(p)![qid]).map((v) => (v === undefined || v < 0 ? NaN : v));
const sd = (v: number[]) => { const x = v.filter((n) => !isNaN(n)); const m = x.reduce((a, b) => a + b, 0) / x.length; return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length); };
const corr = (a: number[], b: number[]) => { const i = a.map((_, k) => k).filter((k) => !isNaN(a[k]) && !isNaN(b[k]));
  const ma = i.reduce((s, k) => s + a[k], 0) / i.length, mb = i.reduce((s, k) => s + b[k], 0) / i.length;
  let s = 0, sa = 0, sb = 0; for (const k of i) { s += (a[k] - ma) * (b[k] - mb); sa += (a[k] - ma) ** 2; sb += (b[k] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
const cols = new Map(scored.map((q) => [q.id, col(q.id)]));
const rows = scored.map((q) => {
  let best = 0, twin = '';
  for (const o of scored) if (o.id !== q.id) { const r = Math.abs(corr(cols.get(q.id)!, cols.get(o.id)!)); if (r > best) { best = r; twin = o.id; } }
  const s = q.scored === false ? null : score(QUESTIONS.filter((x) => x.id !== q.id));
  return { q, sd: sd(cols.get(q.id)!), best, twin, s };
});
console.log('\nid | SD | дубль | Δ свежие | Δ «пара» | Δ «друзья» | вопрос');
for (const r of rows.sort((a, b) => (b.s ? b.s.fresh - base.fresh + b.s.old - base.old : 9) - (a.s ? a.s.fresh - base.fresh + a.s.old - base.old : 9)))
  console.log([r.q.id, r.sd.toFixed(1), `${r.best.toFixed(2)} ${r.twin}`,
    r.s ? (r.s.fresh - base.fresh).toFixed(1) : 'не считается', r.s ? (r.s.old - base.old).toFixed(1) : '', r.s ? (r.s.fr - base.fr).toFixed(1) : '', r.q.text.slice(0, 60)].join(' | '));
