// Учёт манеры ответов: один отвечает решительно (много 0–1 и 9–10), другой сдержанно. Варианты подсчёта и их согласие с экспертами.
// Критерий выбора — только синтетика: старые эксперты (120), эксперты с динамикой (120), пары D (16 и 40). Реальные пары в выборе не участвуют.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { importanceFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const W = [0, 1, 10, 50];
const QS = QUESTIONS.filter((q) => q.block !== 'maturity');
type V = Record<string, number>;
const cache: Record<string, V> = {};
const ans = (id: string): V => (cache[id] ??= JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')));
const ok = (x: number | undefined) => x !== undefined && x >= 0;
const dev = (v: V) => { const xs = QS.map((q) => v[q.id]).filter(ok).map((x) => Math.abs(x - 5)); return xs.reduce((s, x) => s + x, 0) / xs.length; };
const people = fs.readdirSync(`${D}/answers`).map((f) => f.replace('.json', ''));
const DEV0 = (() => { const d = people.map((p) => dev(ans(p))).sort((a, b) => a - b); return d[d.length >> 1]; })();

/** Шкала человека, приведённая к типичной манере: расстояние от середины · DEV0 / его средняя удалённость. */
const norm = (v: V, x: number) => 5 + ((x - 5) * DEV0) / dev(v);
const wOf = (x: number) => W[importanceFor(Math.max(0, Math.min(10, Math.round(x))))];

type Variant = { name: string; w: (v: V, x: number) => number; fit: (va: V, a: number, vb: V, b: number) => number };
const plainFit = (_va: V, a: number, _vb: V, b: number) => Math.max(0, 1 - Math.abs(a - b) / 6);
const normFit = (va: V, a: number, vb: V, b: number) => Math.max(0, 1 - Math.abs(norm(va, a) - norm(vb, b)) / 6);
const sideFit = (_va: V, a: number, _vb: V, b: number) => { const same = (a - 5) * (b - 5) > 0; return Math.max(0, 1 - (Math.abs(a - b) * (same ? 0.5 : 1)) / 6); };
const VARIANTS: Variant[] = [
  { name: 'как сейчас', w: (_v, x) => wOf(x), fit: plainFit },
  { name: 'важность по своей манере', w: (v, x) => wOf(norm(v, x)), fit: plainFit },
  { name: 'важность и сравнение по своей манере', w: (v, x) => wOf(norm(v, x)), fit: normFit },
  { name: 'одна сторона — разница вдвое мягче', w: (_v, x) => wOf(x), fit: sideFit },
  { name: 'важность по манере + одна сторона мягче', w: (v, x) => wOf(norm(v, x)), fit: sideFit },
];

function percent(m: string, f: string, vr: Variant): number {
  const a = ans(m), b = ans(f); let na = 0, sa = 0, nb = 0, sb = 0;
  for (const q of QS) { const x = a[q.id], y = b[q.id]; if (!ok(x) || !ok(y)) continue; const k = relationshipWeight(q.sphere);
    const wa = k * vr.w(a, x), wb = k * vr.w(b, y); na += wa * vr.fit(a, x, b, y); sa += wa; nb += wb * vr.fit(b, y, a, x); sb += wb; }
  return 100 * Math.sqrt((sa ? na / sa : 1) * (sb ? nb / sb : 1));
}
const judges = (f1: string, f2: string) => { const a = JSON.parse(fs.readFileSync(`${D}/${f1}`, 'utf8')).ratings as any[]; const b = JSON.parse(fs.readFileSync(`${D}/${f2}`, 'utf8')).ratings as any[];
  return a.map((r) => ({ m: r.man, f: r.woman, e: (r.couple + b.find((x) => x.man === r.man && x.woman === r.woman).couple) / 2 })); };
const designed = new Set((JSON.parse(fs.readFileSync(`${D}/personas-d.json`, 'utf8')).pairs as any[]).map((p) => `${p.man.id}|${p.woman.id}`));
const SETS: [string, { m: string; f: string; e: number }[]][] = [
  ['120 старые', judges('judge30.json', 'judge30b.json')],
  ['120 динамика', judges('judge30-dyn.json', 'judge30b-dyn.json')],
  ['D 16', judges('judge-d.json', 'judge-d-b.json').filter((r) => designed.has(`${r.m}|${r.f}`))],
  ['D 40', judges('judge-d.json', 'judge-d-b.json')],
];
const cidx = (xs: number[], ys: number[]) => { let s = 0, n = 0; for (let i = 0; i < xs.length; i++) for (let k = i + 1; k < xs.length; k++) { const dy = ys[i] - ys[k]; if (!dy) continue; const dx = xs[i] - xs[k]; s += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; } return (100 * s) / n; };
console.log(`типичная удалённость от середины (медиана по ${people.length} персонажам): ${DEV0.toFixed(2)}`);
for (const vr of VARIANTS) {
  const res = SETS.map(([, rows]) => cidx(rows.map((r) => percent(r.m, r.f, vr)), rows.map((r) => r.e)));
  console.log(`${vr.name.padEnd(40)} ${SETS.map(([n], i) => `${n} ${res[i].toFixed(1)}`).join(' | ')} | среднее ${(res.reduce((a, b) => a + b, 0) / res.length).toFixed(1)}`);
}
// Пары с самой разной манерой ответов: помогает ли учёт манеры именно им.
const pairsAll = SETS[0][1];
const gap = (r: { m: string; f: string }) => Math.abs(dev(ans(r.m)) - dev(ans(r.f)));
const big = [...pairsAll].sort((x, y) => gap(y) - gap(x)).slice(0, 40);
console.log(`\n40 пар из 120 с самой разной манерой (разница удалённости ≥ ${gap(big[39]).toFixed(2)}):`);
for (const vr of VARIANTS) console.log(`  ${vr.name.padEnd(40)} ${cidx(big.map((r) => percent(r.m, r.f, vr)), big.map((r) => r.e)).toFixed(1)}`);
