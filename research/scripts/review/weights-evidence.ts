// Обоснование весов сфер на синтетике: (1) связь совпадения в каждой сфере с независимыми критериями —
// эксперты по биографиям (E), терапевт (T), симуляция трёх лет (S), эксперт по динамике ссор (DYN);
// (2) веса, подобранные под каждый критерий с перекрёстной проверкой; (3) сравнение наборов весов с бутстрэпом.
// Запуск: npx vite-node research/scripts/review/weights-evidence.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { RELATIONSHIP_WEIGHTS, SPHERES } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';

const D = 'research/synthetic';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type K = [string, string];
const prof = (dir: string, id: string) => { const raw = read(`${dir}/${id}.json`); const r: any = {};
  for (const q of QUESTIONS) { const v = raw[q.id]; r[q.id] = v < 0 ? 'skipped' : answerFor(Math.max(0, Math.min(10, Math.round(v)))); } return { name: id, bankVersion: 11, responses: r }; };
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
const age = new Map<string, number>();
for (const f of ['personas30.json', 'personas-d.json', 'fresh/personas-v.json']) { const d = read(`${D}/${f}`); for (const p of (d.pairs ?? d)) { age.set(p.man.id, p.man.age); age.set(p.woman.id, p.woman.age); } }

// Наборы: свежие 60 комбинаций (E, T, S) и старые 120 (E по двум экспертам, DYN — эксперт по динамике ссор).
const F = `${D}/fresh`;
const fk: K[] = read(`${F}/combos.json`).map((c: any) => [c.man, c.woman]);
const fa = judge(`${F}/judge-a.json`), fb = judge(`${F}/judge-b.json`), ft = judge(`${F}/judge-t.json`);
const fs1 = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const id = (k: K) => k.join('|');
const ok = read(`${D}/judge30-combos.json`); void ok;
const j1 = judge(`${D}/judge30.json`), j2 = judge(`${D}/judge30b.json`), jd = judge(`${D}/judge30-dyn.json`), jd2 = judge(`${D}/judge30b-dyn.json`);
const tk: K[] = [...j1.keys()].map((k) => k.split('|') as K);
const sets = [
  { name: 'свежие', dir: `${F}/answers`, keys: fk, crit: {
    'E эксперты': fk.map((k) => (fa.get(id(k)).couple + fb.get(id(k)).couple) / 2),
    'T терапевт': fk.map((k) => ft.get(id(k)).couple),
    'S симуляция 3 лет': fk.map((k) => { const s = fs1.get(id(k)); return (s.together / 100) * (s.satM + s.satW) / 20; }),
  } as Record<string, number[]> },
  { name: 'старые', dir: `${D}/answers`, keys: tk, crit: {
    'E эксперты': tk.map((k) => (j1.get(id(k)).couple + j2.get(id(k)).couple) / 2),
    'DYN динамика ссор': tk.map((k) => (jd.get(id(k)).couple + jd2.get(id(k)).couple) / 2),
  } as Record<string, number[]> },
];
const spheres = SPHERES.filter((s) => s.block !== 'maturity');
const rank = (v: number[]) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length - 1) / 2);
const pear = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb) || 0; };
const rho = (a: number[], b: number[]) => pear(rank(a), rank(b));
const cidx = (t: number[], e: number[], idx?: number[]) => { const I = idx ?? t.map((_, i) => i); let n = 0, d = 0; for (let x = 0; x < I.length; x++) for (let y = x + 1; y < I.length; y++) { const i = I[x], j = I[y]; if (e[i] === e[j]) continue; d++; const st = Math.sign(t[i] - t[j]), se = Math.sign(e[i] - e[j]); n += st === se ? 1 : st === 0 ? 0.5 : 0; } return 100 * n / d; };
let seed = 11; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

// Профили и сырые проценты по сферам для каждой комбинации.
const data = sets.map((s) => { const P = new Map<string, any>(); const get = (x: string) => P.get(x) ?? (P.set(x, prof(s.dir, x)), P.get(x));
  const sp = s.keys.map(([m, w]) => { const r = compare(QUESTIONS, get(m), get(w)).relationship; return Object.fromEntries(r.spheres.map((x) => [x.sphere, x.percent ?? 50])); });
  return { ...s, get, sp }; });

console.log('=== 1. Связь совпадения в сфере с критерием (ρ Спирмена; в скобках 90% бутстрэп-интервал) ===');
for (const d of data) {
  const cn = Object.keys(d.crit);
  console.log(`\n${d.name} (${d.keys.length} комбинаций)\n| Сфера | ${cn.join(' | ')} |`);
  for (const s of spheres) {
    const x = d.sp.map((r) => r[s.id]);
    const cells = cn.map((c) => { const e = d.crit[c]; const bs: number[] = []; for (let b = 0; b < 500; b++) { const I = d.keys.map(() => Math.floor(rnd() * d.keys.length)); bs.push(rho(I.map((i) => x[i]), I.map((i) => e[i]))); } bs.sort((a, b) => a - b); return `${rho(x, e).toFixed(2)} (${bs[25].toFixed(2)}…${bs[474].toFixed(2)})`; });
    console.log(`| ${s.label} | ${cells.join(' | ')} |`);
  }
}

// 2. Веса, подобранные под каждый критерий: координатный спуск по сетке, проверка на отложенной половине (100 разбиений).
const GRID = [0, 0.15, 0.4, 0.7, 1];
const score = (d: typeof data[number], w: Record<string, number>) => d.keys.map(([m, x]) => compare(QUESTIONS, d.get(m), d.get(x), (s) => w[s] ?? 0).relationship.percent ?? 0);
// Быстрая версия: процент ≈ взвешенное среднее сырых процентов сфер с весом сферы × числом отвечённых вопросов.
const nq = Object.fromEntries(spheres.map((s) => [s.id, QUESTIONS.filter((q) => q.sphere === s.id && q.scored !== false).length]));
const fast = (d: typeof data[number], w: Record<string, number>, I: number[]) => I.map((i) => { let a = 0, b = 0; for (const s of spheres) { const k = (w[s.id] ?? 0) * nq[s.id]; a += k * d.sp[i][s.id]; b += k; } return b ? a / b : 0; });
const fit = (d: typeof data[number], e: number[], I: number[]) => { const w: Record<string, number> = Object.fromEntries(spheres.map((s) => [s.id, 0.7])); for (let it = 0; it < 3; it++) for (const s of spheres) { let best = w[s.id], bc = -1; for (const g of GRID) { w[s.id] = g; const c = cidx(fast(d, w, I), e.map((x) => x), undefined); void c; const t = fast(d, w, I); const cc = cidx(t, I.map((i) => e[i])); if (cc > bc + 1e-9) { bc = cc; best = g; } } w[s.id] = best; } return w; };
console.log('\n=== 2. Веса, подобранные под критерий (средние по 100 разбиениям пополам) и точность на отложенной половине ===');
const fitted: Record<string, Record<string, number>> = {};
for (const d of data) for (const [cn, e] of Object.entries(d.crit)) {
  const acc: Record<string, number[]> = Object.fromEntries(spheres.map((s) => [s.id, []])); const gain: number[] = []; const cur: number[] = [];
  for (let r = 0; r < 100; r++) { const I = d.keys.map((_, i) => i).sort(() => rnd() - 0.5); const tr = I.slice(0, I.length >> 1), te = I.slice(I.length >> 1);
    const w = fit(d, e, tr); for (const s of spheres) acc[s.id].push(w[s.id]);
    gain.push(cidx(fast(d, w, te), te.map((i) => e[i]))); cur.push(cidx(fast(d, RELATIONSHIP_WEIGHTS, te), te.map((i) => e[i]))); }
  const m = Object.fromEntries(spheres.map((s) => [s.id, acc[s.id].reduce((a, b) => a + b, 0) / 100])); fitted[`${d.name}: ${cn}`] = m;
  console.log(`\n${d.name}, ${cn}: подобранные на половине → ${(gain.reduce((a, b) => a + b) / 100).toFixed(1)}, текущие веса → ${(cur.reduce((a, b) => a + b) / 100).toFixed(1)} на другой половине`);
  console.log('  ' + spheres.map((s) => `${s.label} ${m[s.id].toFixed(2)}`).join(' · '));
}

// 3. Наборы весов на всех критериях, точный подсчёт через compare(); у свежих — также пары, где оба 20–32 лет.
const OLD = { kids: 1, living: 1, budget: 1, relatives: 1, space: 1, values: 1, home: 1, career: 1, roles: 0.4, money: 0.4, intimacy: 0.4, leisure: 0.15, rhythm: 0.15, loyalty: 0.15, humor: 0.15, conflicts: 0.05, honesty: 0.05 };
const EQ = Object.fromEntries(spheres.map((s) => [s.id, 1]));
console.log('\n=== 3. Наборы весов: C-index с критерием (точный подсчёт) ===');
for (const d of data) {
  const young = d.keys.map((k, i) => (age.get(k[0])! <= 32 && age.get(k[1])! <= 32 ? i : -1)).filter((i) => i >= 0);
  const LIT = { kids: 1, conflicts: 1, budget: 1, loyalty: 1, intimacy: 0.7, living: 0.7, values: 0.7, roles: 0.7, home: 0.7, space: 0.7, relatives: 0.5, career: 0.5, honesty: 0.4, rhythm: 0.4, leisure: 0.4, humor: 0.4, money: 0.4 };
  for (const [wn, w] of Object.entries({ 'прежние (подгонка под E)': OLD, 'текущие (20–30, город)': RELATIONSHIP_WEIGHTS, 'исследования + симуляция': LIT, 'все поровну': EQ })) {
    const t = score(d, w);
    console.log(`${d.name} | ${wn.padEnd(26)} | ` + Object.entries(d.crit).map(([cn, e]) => `${cn.split(' ')[0]} ${cidx(t, e).toFixed(1)}${d.name === 'свежие' ? ` (20–32: ${cidx(t, e, young).toFixed(1)})` : ''}`).join(' | '));
  }
}
fs.writeFileSync('research/review/weights-fitted.json', JSON.stringify(fitted, null, 1));
