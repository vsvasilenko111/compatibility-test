import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { importanceFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const { pairs } = JSON.parse(fs.readFileSync(`${D}/personas30.json`, 'utf8'));
const judge = JSON.parse(fs.readFileSync(`${D}/judge30.json`, 'utf8')).ratings;
const ans: Record<string, Record<string, number>> = {};
for (const p of pairs) for (const x of [p.man, p.woman]) ans[x.id] = JSON.parse(fs.readFileSync(`${D}/answers/${x.id}.json`, 'utf8'));
const men = pairs.map((p: any) => p.man.id), women = pairs.map((p: any) => p.woman.id);
const typeOf = new Map(pairs.map((p: any) => [`${p.man.id}|${p.woman.id}`, p.type]));
const BAD = new Set<string>();
const fit = (a: number, b: number) => Math.max(0, 1 - Math.abs(a - b) / 6);
function score(m: string, w: string, W: number[], drop: boolean) {
  let na = 0, sa = 0, nb = 0, sb = 0;
  for (const q of QUESTIONS) { if (q.block !== 'friendship' || (drop && BAD.has(q.id))) continue;
    const a = ans[m][q.id], b = ans[w][q.id]; const wa = W[importanceFor(a)], wb = W[importanceFor(b)], f = fit(a, b);
    na += wa * f; sa += wa; nb += wb * f; sb += wb; }
  return Math.sqrt((sa ? na / sa : 1) * (sb ? nb / sb : 1)) * 100;
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); idx.forEach(([, i], k) => (r[i] = k)); return r as number[]; };
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let s = 0, x = 0, y = 0; a.forEach((v, i) => { s += (v - ma) * (b[i] - mb); x += (v - ma) ** 2; y += (b[i] - mb) ** 2; }); return s / Math.sqrt(x * y); };
const variants: [string, number[], boolean][] = [['сейчас 1/10/50', [0, 1, 10, 50], false], ['1/3/9', [0, 1, 3, 9], false], ['равные веса', [0, 1, 1, 1], false], ['равные + без 5 плохих', [0, 1, 1, 1], true], ['1/3/9 + без 5 плохих', [0, 1, 3, 9], true]];
for (const [name, W, drop] of variants) {
  const all: { s: number; k: string }[] = []; for (const m of men) for (const w of women) all.push({ s: score(m, w, W, drop), k: (typeOf.get(`${m}|${w}`) as string) ?? 'r' });
  const rnd = all.filter((x) => x.k === 'r').map((x) => x.s).sort((a, b) => a - b);
  const pct = (x: number) => (rnd.filter((v) => v < x).length / rnd.length) * 100;
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const A = all.filter((x) => x.k === 'A').map((x) => pct(x.s)), B = all.filter((x) => x.k === 'B').map((x) => pct(x.s)), C = all.filter((x) => x.k === 'C').map((x) => pct(x.s));
  const rho = corr(rank(judge.map((j: any) => score(j.man, j.woman, W, drop))), rank(judge.map((j: any) => j.friends)));
  console.log(`${name.padEnd(24)} ρ=${rho.toFixed(2)} | A медиана ${Math.round(med(A))}, мин ${Math.round(Math.min(...A))}, <40: ${A.filter((x) => x < 40).length} | B ${Math.round(med(B))} | C ${Math.round(med(C))}`);
}
