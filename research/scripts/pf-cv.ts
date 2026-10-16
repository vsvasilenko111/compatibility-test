// «Партнёр как друг»: добавить в процент вопросы о паре (по сферам) и поднять вес ценностей.
// Честная оценка: веса подбираются жадно на случайной половине комбинаций, проверяются на другой; 200 разбиений.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
import { fit, weight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/primitives';
import type { Answer } from '/Users/arkady.vasilenko/projects/compatibility-test/src/types';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const P1 = J('judge30-pf.json'), P2 = J('judge30b-pf.json');
const QS = QUESTIONS.filter((q) => q.block !== 'maturity' && q.scored !== false);
const SPH = [...new Set(QS.map((q) => q.sphere))];
const REL = process.env.ONLY ? process.env.ONLY.split(',') : [...new Set(QS.filter((q) => q.block === 'relationship').map((q) => q.sphere))];
const ans = (id: string) => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')); return (qid: string): Answer | null => (r[qid] === undefined || r[qid] < 0 ? null : answerFor(r[qid])); };
// Суммы по сферам: [numA, sumA, numB, sumB].
const combos = P1.map((a) => { const A = ans(a.man), B = ans(a.woman); const s: Record<string, number[]> = Object.fromEntries(SPH.map((x) => [x, [0, 0, 0, 0]]));
  for (const q of QS) { const x = A(q.id), y = B(q.id); if (!x || !y) continue; const t = s[q.sphere]; const wa = weight(x), wb = weight(y); t[0] += wa * fit(x, y.value); t[1] += wa; t[2] += wb * fit(y, x.value); t[3] += wb; }
  return { s, e: (a.pf + P2.find((b) => b.man === a.man && b.woman === a.woman).pf) / 2 }; });
type W = Record<string, number>;
const score = (c: (typeof combos)[number], w: W) => { let na = 0, sa = 0, nb = 0, sb = 0;
  for (const x of SPH) { const k = w[x] ?? 0; if (!k) continue; const t = c.s[x]; na += k * t[0]; sa += k * t[1]; nb += k * t[2]; sb += k * t[3]; }
  return Math.sqrt((sa ? na / sa : 1) * (sb ? nb / sb : 1)); };
const cidx = (idx: number[], w: W) => { const v = idx.map((i) => score(combos[i], w)); let ok = 0, n = 0;
  for (let i = 0; i < idx.length; i++) for (let k = i + 1; k < idx.length; k++) { const dy = combos[idx[i]].e - combos[idx[k]].e; if (!dy) continue; const dx = v[i] - v[k]; ok += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; }
  return (100 * ok) / n; };
const BASE: W = Object.fromEntries([...new Set(QS.filter((q) => q.block === 'friendship').map((q) => q.sphere))].map((x) => [x, 1]));
const STEPS = [0, 0.25, 0.5, 1];
/** Жадно: по очереди для ценностей (1/2/3/5) и каждой сферы пары (0…1) берём лучший вес на обучающей половине, два прохода. */
function fitW(train: number[]): W {
  const w: W = { ...BASE };
  for (let pass = 0; pass < 2; pass++) {
    for (const x of ['values', ...REL]) {
      const opts = x === 'values' ? [1, 2, 3, 5] : STEPS; let best = w[x] ?? 0, bs = -1;
      for (const o of opts) { const s = cidx(train, { ...w, [x]: o }); if (s > bs + 1e-9) { bs = s; best = o; } }
      w[x] = best;
    }
  }
  return w;
}
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const all = combos.map((_, i) => i);
const N = 200; let b = 0, t = 0, wins = 0; const picked: Record<string, number[]> = {};
for (let r = 0; r < N; r++) {
  const sh = [...all].sort(() => rnd() - 0.5); const tr = sh.slice(0, 60), te = sh.slice(60);
  const w = fitW(tr); const sb = cidx(te, BASE), st = cidx(te, w); b += sb; t += st; if (st > sb) wins++;
  for (const x of ['values', ...REL]) (picked[x] ??= []).push(w[x] ?? 0);
}
console.log(`отложенная половина, ${N} разбиений: сейчас ${(b / N).toFixed(1)}% → с подбором ${(t / N).toFixed(1)}%; подбор лучше в ${wins} из ${N}`);
console.log('средний выбранный вес:', Object.entries(picked).map(([k, v]) => `${k} ${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)}`).join(', '));
const full = fitW(all);
console.log('веса на всех 120:', JSON.stringify(full), `→ ${cidx(all, full).toFixed(1)}% (сейчас ${cidx(all, BASE).toFixed(1)}%)`);
