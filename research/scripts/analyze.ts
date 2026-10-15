// Синтетическая проверка: тест против слепой экспертной оценки на 12 персонажах (6 мужчин × 6 женщин = 36 комбинаций).
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
import type { Profile } from '/Users/arkady.vasilenko/projects/compatibility-test/src/types';

const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const personas = JSON.parse(fs.readFileSync(`${D}/personas.json`, 'utf8'));
const judge = JSON.parse(fs.readFileSync(`${D}/judge.json`, 'utf8')) as { ratings: { man: string; woman: string; couple: number; friends: number }[] };

const profile = (id: string): Profile => {
  const raw = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')) as Record<string, number>;
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id];
    if (v === undefined || v === null) throw new Error(`${id}: нет ответа на ${q.id}`);
    responses[q.id] = v < 0 ? 'skipped' : answerFor(Math.max(0, Math.min(10, Math.round(v))));
  }
  return { name: id, bankVersion: 2, responses };
};

const men = personas.pairs.map((p: any) => p.man.id) as string[];
const women = personas.pairs.map((p: any) => p.woman.id) as string[];
const typeOf = new Map<string, string>(personas.pairs.map((p: any) => [`${p.man.id}|${p.woman.id}`, p.type]));
const P = new Map([...men, ...women].map((id) => [id, profile(id)]));

type Row = { man: string; woman: string; kind: string; rel: number; fr: number; jc: number; jf: number; flags: number };
const rows: Row[] = [];
for (const m of men) for (const w of women) {
  const r = compare(QUESTIONS, P.get(m)!, P.get(w)!);
  const j = judge.ratings.find((x) => x.man === m && x.woman === w);
  if (!j) throw new Error(`эксперт не оценил ${m}×${w}`);
  rows.push({ man: m, woman: w, kind: typeOf.get(`${m}|${w}`) ?? 'shuffled', rel: r.relationship.percent ?? 100, fr: r.friendship.percent ?? 100, jc: j.couple, jf: j.friends, flags: r.relationship.redFlags.length });
}

const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let k = i; while (k + 1 < idx.length && idx[k + 1][0] === idx[i][0]) k++; for (let t = i; t <= k; t++) r[idx[t][1]] = (i + k) / 2; i = k + 1; } return r as number[]; };
const pearson = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
const spearman = (a: number[], b: number[]) => pearson(rank(a), rank(b));
const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
const r0 = (x: number) => Math.round(x);

console.log('\n=== Настоящие пары ===');
for (const row of rows.filter((x) => x.kind !== 'shuffled')) {
  console.log(`${row.man}×${row.woman} тип ${row.kind}: тест пара ${r0(row.rel)}% / друзья ${r0(row.fr)}% · эксперт пара ${row.jc} / друзья ${row.jf} · флагов ${row.flags}`);
}
console.log('\n=== Средние по группам (тест пара / друзья · эксперт пара / друзья) ===');
for (const k of ['A', 'B', 'C', 'shuffled']) {
  const g = rows.filter((x) => x.kind === k);
  console.log(`${k.padEnd(8)} n=${String(g.length).padStart(2)}: ${r0(mean(g.map((x) => x.rel)))}% / ${r0(mean(g.map((x) => x.fr)))}% · ${r0(mean(g.map((x) => x.jc)))} / ${r0(mean(g.map((x) => x.jf)))}`);
}
console.log('\n=== Согласие теста с экспертом по всем 36 комбинациям (Спирмен) ===');
console.log(`как пара:   ρ = ${spearman(rows.map((x) => x.rel), rows.map((x) => x.jc)).toFixed(2)}`);
console.log(`как друзья: ρ = ${spearman(rows.map((x) => x.fr), rows.map((x) => x.jf)).toFixed(2)}`);

// Перестановочный тест: насколько часто случайные «настоящие пары» дали бы такое же преимущество над остальными.
const realIdx = rows.map((x, i) => (x.kind === 'A' ? i : -1)).filter((i) => i >= 0);
const gap = (idx: number[]) => mean(idx.map((i) => rows[i].rel)) - mean(rows.filter((_, i) => !idx.includes(i)).map((x) => x.rel));
const obs = gap(realIdx);
let s = 3; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
let hits = 0; const N = 5000;
for (let t = 0; t < N; t++) { const pick = new Set<number>(); while (pick.size < realIdx.length) pick.add(Math.floor(rnd() * rows.length)); if (gap([...pick]) >= obs) hits++; }
console.log(`\nПары типа A выше остальных комбинаций на ${obs.toFixed(1)} п.п. (p ≈ ${(hits / N).toFixed(3)} по перестановкам)`);

// Какие вопросы различают: средняя разница ответов в парах A против перемешанных.
const diff = (m: string, w: string, id: string) => { const a = P.get(m)!.responses[id], b = P.get(w)!.responses[id]; return a === 'skipped' || b === 'skipped' ? null : Math.abs(a.value - b.value); };
const itemStats = QUESTIONS.map((q) => {
  const A = rows.filter((x) => x.kind === 'A').map((x) => diff(x.man, x.woman, q.id)).filter((x): x is number => x !== null);
  const S = rows.filter((x) => x.kind === 'shuffled').map((x) => diff(x.man, x.woman, q.id)).filter((x): x is number => x !== null);
  const spread = [...men, ...women].map((id) => P.get(id)!.responses[q.id]).filter((r) => r !== 'skipped').map((r) => (r as { value: number }).value);
  return { id: q.id, sep: (S.length ? mean(S) : 0) - (A.length ? mean(A) : 0), sd: Math.sqrt(mean(spread.map((v) => (v - mean(spread)) ** 2))) };
}).sort((a, b) => b.sep - a.sep);
console.log('\nЛучше всего отличают пары A от случайных (разница ответов меньше у пар):', itemStats.slice(0, 8).map((x) => `${x.id} (${x.sep.toFixed(1)})`).join(', '));
console.log('Не отличают или наоборот:', itemStats.slice(-8).map((x) => `${x.id} (${x.sep.toFixed(1)})`).join(', '));
console.log('Почти все ответили одинаково (разброс < 1,5 — вопрос мало что различает):', itemStats.filter((x) => x.sd < 1.5).map((x) => x.id).join(', ') || 'нет');
fs.writeFileSync(`${D}/rows.json`, JSON.stringify(rows, null, 1));
