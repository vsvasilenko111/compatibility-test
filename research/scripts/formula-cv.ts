// Формула подсчёта: веса важности, крутизна падения совпадения, смягчение по одну сторону, способ свести двоих.
// Конфигурация выбирается на случайной половине комбинаций, проверяется на другой; 200 разбиений.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { friendshipWeight, relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { importanceFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const QS = QUESTIONS.filter((q) => q.block !== 'maturity' && q.scored !== false);
const cache: Record<string, Record<string, number>> = {};
const ans = (id: string) => (cache[id] ??= JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')));
const avg = (f1: string, f2: string, key: string) => { const b = J(f2); return J(f1).map((a) => ({ m: a.man, f: a.woman, e: (a[key] + b.find((x) => x.man === a.man && x.woman === a.woman)[key]) / 2 })); };
const TARGETS: [string, ReturnType<typeof avg>, (s: string) => number][] = [
  ['отношения', avg('judge30.json', 'judge30b.json', 'couple'), relationshipWeight],
  ['отношения (динамика)', avg('judge30-dyn.json', 'judge30b-dyn.json', 'couple'), relationshipWeight],
  ['партнёр как друг', avg('judge30-pf.json', 'judge30b-pf.json', 'pf'), friendshipWeight],
];
type Cfg = { W: number[]; K: number; F: number; agg: 'geo' | 'mean' | 'min' };
const CFGS: Cfg[] = [];
for (const W of [[0, 1, 10, 50], [0, 1, 5, 20], [0, 1, 3, 9], [0, 1, 2, 4], [0, 1, 1, 1], [0, 1, 10, 100]])
  for (const K of [4, 5, 6, 8, 10]) for (const F of [0.5, 0.75, 1]) for (const agg of ['geo', 'mean', 'min'] as const) CFGS.push({ W, K, F, agg });
const ok = (x: number | undefined) => x !== undefined && x >= 0;
function score(m: string, f: string, c: Cfg, k: (s: string) => number) {
  const a = ans(m), b = ans(f); let na = 0, sa = 0, nb = 0, sb = 0;
  for (const q of QS) { const w = k(q.sphere); if (!w) continue; const x = a[q.id], y = b[q.id]; if (!ok(x) || !ok(y)) continue;
    const same = (x - 5) * (y - 5) > 0; const fitv = Math.max(0, 1 - (Math.abs(x - y) * (same ? c.F : 1)) / c.K);
    const wa = w * c.W[importanceFor(x)], wb = w * c.W[importanceFor(y)]; na += wa * fitv; sa += wa; nb += wb * fitv; sb += wb; }
  const A = sa ? na / sa : 1, B = sb ? nb / sb : 1;
  return c.agg === 'geo' ? Math.sqrt(A * B) : c.agg === 'mean' ? (A + B) / 2 : Math.min(A, B);
}
const cidx = (v: number[], e: number[], idx: number[]) => { let s = 0, n = 0;
  for (let i = 0; i < idx.length; i++) for (let k = i + 1; k < idx.length; k++) { const dy = e[idx[i]] - e[idx[k]]; if (!dy) continue; const dx = v[idx[i]] - v[idx[k]]; s += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; } return (100 * s) / n; };
const name = (c: Cfg) => `W=${c.W.join('/')} K=${c.K} F=${c.F} ${c.agg}`;
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
for (const [t, rows, k] of TARGETS) {
  const e = rows.map((r) => r.e); const S = CFGS.map((c) => rows.map((r) => score(r.m, r.f, c, k)));
  const cur = CFGS.findIndex((c) => c.W.join() === '0,1,10,50' && c.K === 6 && c.F === 0.5 && c.agg === 'geo');
  const all = rows.map((_, i) => i); let base = 0, sel = 0, wins = 0; const N = 200;
  for (let r = 0; r < N; r++) { const sh = [...all].sort(() => rnd() - 0.5), tr = sh.slice(0, 60), te = sh.slice(60);
    let bi = 0, bs = -1; S.forEach((v, i) => { const s = cidx(v, e, tr); if (s > bs) { bs = s; bi = i; } });
    const b = cidx(S[cur], e, te), s = cidx(S[bi], e, te); base += b; sel += s; if (s > b) wins++; }
  const full = S.map((v, i) => [cidx(v, e, all), i]).sort((x, y) => y[0] - x[0]);
  console.log(`\n${t}: отложенная половина — сейчас ${(base / N).toFixed(1)}%, с подбором ${(sel / N).toFixed(1)}% (лучше в ${wins}/${N}); на всех: сейчас ${cidx(S[cur], e, all).toFixed(1)}%`);
  for (const [s, i] of full.slice(0, 5)) console.log(`   ${s.toFixed(1)}%  ${name(CFGS[i])}`);
}
