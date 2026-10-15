// Даёт ли блок «Эмоциональная зрелость» прирост согласия с экспертами? Подбор на одной половине пар, проверка на другой.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
// JUDGES=dyn — эксперты, которых явно просили учитывать динамику ссор и привязанность (judge30-dyn.json, judge30b-dyn.json).
const SUF = process.env.JUDGES ? `-${process.env.JUDGES}` : '';
const J1 = JSON.parse(fs.readFileSync(`${D}/judge30${SUF}.json`, 'utf8')).ratings as any[];
const J2 = JSON.parse(fs.readFileSync(`${D}/judge30b${SUF}.json`, 'utf8')).ratings as any[];
console.log(`эксперты: judge30${SUF}, judge30b${SUF}`);
const rows = J1.map((a) => ({ man: a.man, woman: a.woman, e1: a.couple, e2: J2.find((b) => b.man === a.man && b.woman === a.woman).couple }));
const raw = (id: string) => JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
const mat = (id: string): Record<string, number> => JSON.parse(fs.readFileSync(`${D}/answers-maturity/${id}.json`, 'utf8'));
const prof = (id: string) => { const r = raw(id); return { name: id, bankVersion: 3, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, answerFor(r[q.id])])) }; };
const v = (m: Record<string, number>, id: string) => (m[id] === undefined || m[id] < 0 ? null : m[id]);

const LEVEL = ['attach-01', 'attach-03', 'regul-01', 'regul-02', 'reflect-02', 'reflect-03', 'trauma-01', 'trauma-02', 'trauma-03', 'trauma-04', 'trauma-05', 'trauma-06'];
const LEVEL_W: Record<string, number> = { 'reflect-01': 0.3, 'trauma-03': 0.5 };
const SIM = ['regul-05', 'reflect-04'];
const ALL = Object.keys(mat('p1m'));

/** Устойчивость человека 0..1 (1 — устойчиво): средний «низкий полюс» по level-вопросам. */
function stability(m: Record<string, number>, items = [...LEVEL, 'reflect-01']): number {
  let s = 0, w = 0; for (const id of items) { const x = v(m, id); if (x === null) continue; const k = LEVEL_W[id] ?? 1; s += k * (1 - x / 10); w += k; }
  return w ? s / w : 0.5;
}
const hi = (m: Record<string, number>, id: string, t = 7) => (v(m, id) ?? -1) >= t;
const avoid = (m: Record<string, number>) => ((v(m, 'attach-02') ?? 0) + (v(m, 'attach-03') ?? 0)) / 2;
/** Опасные сочетания (в обе стороны), 0..n. */
function risks(a: Record<string, number>, b: Record<string, number>) {
  const one = (x: Record<string, number>, y: Record<string, number>) => {
    const r: string[] = [];
    if (hi(x, 'attach-01') && avoid(y) >= 7) r.push('anx-avoid');
    if (hi(x, 'regul-03') && hi(y, 'regul-04')) r.push('pursue-withdraw');
    if (hi(x, 'trauma-06') && (hi(y, 'regul-04') || hi(y, 'attach-02'))) r.push('silence');
    if (hi(x, 'trauma-05') && hi(y, 'regul-01', 8)) r.push('escalation');
    return r;
  };
  return [...new Set([...one(a, b), ...one(b, a)])];
}
const simFit = (a: Record<string, number>, b: Record<string, number>, ids: string[]) => {
  let s = 0, n = 0; for (const id of ids) { const x = v(a, id), y = v(b, id); if (x === null || y === null) continue; s += Math.max(0, 1 - Math.abs(x - y) / 6); n++; } return n ? s / n : 1; };

const feats = rows.map((r) => {
  const a = mat(r.man), b = mat(r.woman);
  return { ...r,
    base: compare(QUESTIONS, prof(r.man), prof(r.woman), relationshipWeight).relationship.percent! / 100,
    stabMin: Math.min(stability(a), stability(b)), stabAvg: (stability(a) + stability(b)) / 2,
    stabProd: stability(a) * stability(b),
    risk: risks(a, b).length, riskList: risks(a, b),
    sim: simFit(a, b, SIM), simAll: simFit(a, b, ALL) };
});

const cidx = (x: number[], y: number[]) => { let ok = 0, n = 0; for (let i = 0; i < x.length; i++) for (let k = i + 1; k < x.length; k++) { const dy = y[i] - y[k]; if (!dy) continue; const dx = x[i] - x[k]; ok += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; } return (100 * ok) / n; };
const num = (id: string) => +id.slice(1, -1);
type F = (typeof feats)[number];
const halves: [string, (f: F) => boolean][] = [['p1–15', (f) => num(f.man) <= 15], ['p16–30', (f) => num(f.man) > 15]];
const evalOn = (fs_: F[], score: (f: F) => number) => {
  const t = fs_.map(score); return { e1: cidx(t, fs_.map((f) => f.e1)), e2: cidx(t, fs_.map((f) => f.e2)), avg: cidx(t, fs_.map((f) => (f.e1 + f.e2) / 2)) };
};
const fmt = (r: { e1: number; e2: number; avg: number }) => `э1 ${r.e1.toFixed(1)} э2 ${r.e2.toFixed(1)} ср ${r.avg.toFixed(1)}`;

console.log('сами по себе (весь набор):');
for (const k of ['base', 'stabMin', 'stabAvg', 'stabProd', 'sim', 'simAll'] as const) console.log(`  ${k.padEnd(9)} ${fmt(evalOn(feats, (f) => f[k]))}`);
console.log(`  -risk     ${fmt(evalOn(feats, (f) => -f.risk))}`);
console.log('частота рисков:', feats.filter((f) => f.risk).length, '/', feats.length);

type Model = { name: string; grid: number[]; score: (f: F, p: number) => number };
const models: Model[] = [
  { name: 'base·(1−p·risk)', grid: [0, 0.02, 0.05, 0.08, 0.12, 0.2], score: (f, p) => f.base * (1 - p * f.risk) },
  { name: 'base·stabMin^p', grid: [0, 0.1, 0.2, 0.3, 0.5, 0.8], score: (f, p) => f.base * f.stabMin ** p },
  { name: 'base·stabAvg^p', grid: [0, 0.1, 0.2, 0.3, 0.5, 0.8], score: (f, p) => f.base * f.stabAvg ** p },
  { name: 'base·sim^p', grid: [0, 0.1, 0.2, 0.3, 0.5, 0.8], score: (f, p) => f.base * f.sim ** p },
  { name: 'base·simAll^p', grid: [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2], score: (f, p) => f.base * f.simAll ** p },
  { name: 'base·stabMin^p·(1−.05risk)', grid: [0, 0.1, 0.2, 0.3, 0.5], score: (f, p) => f.base * f.stabMin ** p * (1 - 0.05 * f.risk) },
];
for (const m of models) {
  console.log(`\n${m.name}`);
  for (const [tr, isTr] of halves) {
    const train = feats.filter(isTr), test = feats.filter((f) => !isTr(f));
    const best = m.grid.map((p) => ({ p, s: evalOn(train, (f) => m.score(f, p)).avg })).sort((a, b) => b.s - a.s)[0];
    console.log(`  подбор на ${tr}: p=${best.p} | обучение ${best.s.toFixed(1)} | проверка ${fmt(evalOn(test, (f) => m.score(f, best.p)))} (без блока ${fmt(evalOn(test, (f) => f.base))})`);
  }
  console.log('  по p (весь набор, ср):', m.grid.map((p) => `${p}:${evalOn(feats, (f) => m.score(f, p)).avg.toFixed(1)}`).join(' '));
}
