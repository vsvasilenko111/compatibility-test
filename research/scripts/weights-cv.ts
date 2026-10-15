import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { importanceFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const judge = JSON.parse(fs.readFileSync(`${D}/judge30.json`, 'utf8')).ratings as any[];
const raw: Record<string, Record<string, number>> = {};
const A = (id: string) => (raw[id] ??= JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')));
const W = [0, 1, 10, 50];
const score = (m: string, w: string, mult: Record<string, number>) => { let na = 0, sa = 0, nb = 0, sb = 0;
  for (const q of QUESTIONS) { const a = A(m)[q.id], b = A(w)[q.id], k = mult[q.sphere] ?? 1, wa = W[importanceFor(a)] * k, wb = W[importanceFor(b)] * k, f = Math.max(0, 1 - Math.abs(a - b) / 6); na += wa * f; sa += wa; nb += wb * f; sb += wb; }
  return Math.sqrt((na / sa) * (nb / sb)); };
const cidx = (rows: any[], mult: Record<string, number>) => { const x = rows.map((j) => ({ t: score(j.man, j.woman, mult), e: j.couple })); let ok = 0, n = 0;
  for (let i = 0; i < x.length; i++) for (let k = i + 1; k < x.length; k++) { const de = x[i].e - x[k].e; if (!de) continue; const dt = x[i].t - x[k].t; ok += dt === 0 ? 0.5 : (dt > 0) === (de > 0) ? 1 : 0; n++; } return (100 * ok) / n; };
const num = (id: string) => +id.slice(1, -1);
const train = judge.filter((j) => num(j.man) <= 15), test = judge.filter((j) => num(j.man) > 15);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let s = 0, p = 0, q = 0; a.forEach((v, i) => { s += (v - ma) * (b[i] - mb); p += (v - ma) ** 2; q += (b[i] - mb) ** 2; }); return p && q ? s / Math.sqrt(p * q) : 0; };
const spheres = [...new Set(QUESTIONS.map((q) => q.sphere))];
const validity = (rows: any[]) => Object.fromEntries(spheres.map((s) => { const qs = QUESTIONS.filter((q) => q.sphere === s); return [s, corr(rows.map((j) => mean(qs.map((q) => -Math.abs(A(j.man)[q.id] - A(j.woman)[q.id])))), rows.map((j) => j.couple))]; }));
const vTrain = validity(train);
const make = (v: Record<string, number>, p: number, floor: number) => Object.fromEntries(spheres.map((s) => [s, Math.max(floor, v[s]) ** p]));
console.log(`без весов:            обучение ${cidx(train, {}).toFixed(1)}% | проверка ${cidx(test, {}).toFixed(1)}%`);
for (const [p, floor] of [[1, 0.1], [2, 0.1], [1, 0.2], [2, 0.2], [3, 0.1]] as const) {
  const m = make(vTrain, p, floor); console.log(`веса r^${p}, пол ${floor}:    обучение ${cidx(train, m).toFixed(1)}% | проверка ${cidx(test, m).toFixed(1)}%`);
}
const m = make(vTrain, 2, 0.1); const norm = Math.max(...Object.values(m));
console.log('множители (r^2, пол 0.1, по обучающей половине, нормированы на макс):', Object.entries(m).sort((a, b) => b[1] - a[1]).map(([s, k]) => `${s} ${(k / norm).toFixed(2)}`).join(', '));
console.log('весь набор, без весов → r^2:', cidx(judge, {}).toFixed(1), '→', cidx(judge, m).toFixed(1));
const tiers: Record<string, number> = { kids: 1, living: 1, budget: 1, relatives: 1, space: 1, values: 1, home: 1, career: 1, roles: 0.4, money: 0.4, intimacy: 0.4, leisure: 0.15, rhythm: 0.15, loyalty: 0.15, humor: 0.15, conflicts: 0.05, honesty: 0.05 };
console.log(`уровни 1 / 0.4 / 0.15 / 0.05: обучение ${cidx(train, tiers).toFixed(1)}% | проверка ${cidx(test, tiers).toFixed(1)}% | весь набор ${cidx(judge, tiers).toFixed(1)}%`);
