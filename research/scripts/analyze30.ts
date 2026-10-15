// Прогон на 30 парах: распределение случайных пар → шкала «лучше, чем X% пар», место типов A/B/C, согласие с экспертом.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
import type { Profile } from '/Users/arkady.vasilenko/projects/compatibility-test/src/types';

const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const { pairs } = JSON.parse(fs.readFileSync(`${D}/personas30.json`, 'utf8'));
const judge = JSON.parse(fs.readFileSync(`${D}/judge30.json`, 'utf8')).ratings as { man: string; woman: string; couple: number; friends: number }[];

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
const men: string[] = pairs.map((p: any) => p.man.id);
const women: string[] = pairs.map((p: any) => p.woman.id);
const typeOf = new Map<string, string>(pairs.map((p: any) => [`${p.man.id}|${p.woman.id}`, p.type]));
const P = new Map([...men, ...women].map((id) => [id, profile(id)]));

type Row = { man: string; woman: string; kind: string; rel: number; fr: number };
const rows: Row[] = [];
for (const m of men) for (const w of women) {
  const r = compare(QUESTIONS, P.get(m)!, P.get(w)!, relationshipWeight);
  rows.push({ man: m, woman: w, kind: typeOf.get(`${m}|${w}`) ?? 'random', rel: r.relationship.percent ?? 100, fr: r.friendship.percent ?? 100 });
}
const random = rows.filter((r) => r.kind === 'random');
const relDist = random.map((r) => r.rel).sort((a, b) => a - b);
const frDist = random.map((r) => r.fr).sort((a, b) => a - b);
const pctile = (dist: number[], x: number) => {
  let below = 0, eq = 0;
  for (const v of dist) { if (v < x) below++; else if (v === x) eq++; }
  return ((below + eq / 2) / dist.length) * 100;
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const r0 = (x: number) => Math.round(x);

console.log(`Случайных комбинаций: ${random.length}. Сырой «как пара»: медиана ${r0(med(relDist))}%, 10–90%: ${r0(relDist[Math.floor(relDist.length * 0.1)])}–${r0(relDist[Math.floor(relDist.length * 0.9)])}%`);
console.log(`Сырой «как друзья»: медиана ${r0(med(frDist))}%, 10–90%: ${r0(frDist[Math.floor(frDist.length * 0.1)])}–${r0(frDist[Math.floor(frDist.length * 0.9)])}%`);

console.log('\n=== Настоящие пары: «лучше, чем X% случайных пар» (пара / друзья) ===');
for (const k of ['A', 'B', 'C']) {
  const g = rows.filter((r) => r.kind === k);
  const pr = g.map((r) => pctile(relDist, r.rel)), pf = g.map((r) => pctile(frDist, r.fr));
  console.log(`${k} (n=${g.length}): пара — медиана ${r0(med(pr))}, мин ${r0(Math.min(...pr))}, макс ${r0(Math.max(...pr))} | друзья — медиана ${r0(med(pf))}, мин ${r0(Math.min(...pf))}, макс ${r0(Math.max(...pf))}`);
  console.log('   ' + g.map((r) => `${r.man.replace('m', '')}: ${r0(pctile(relDist, r.rel))}/${r0(pctile(frDist, r.fr))}`).join('  '));
}

const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let k = i; while (k + 1 < idx.length && idx[k + 1][0] === idx[i][0]) k++; for (let t = i; t <= k; t++) r[idx[t][1]] = (i + k) / 2; i = k + 1; } return r as number[]; };
const pearson = (a: number[], b: number[]) => { const n = a.length, ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
const judged = judge.map((j) => ({ j, row: rows.find((r) => r.man === j.man && r.woman === j.woman)! }));
console.log(`\n=== Согласие с экспертом на ${judged.length} комбинациях (Спирмен) ===`);
console.log(`как пара ρ = ${pearson(rank(judged.map((x) => x.row.rel)), rank(judged.map((x) => x.j.couple))).toFixed(2)}, как друзья ρ = ${pearson(rank(judged.map((x) => x.row.fr)), rank(judged.map((x) => x.j.friends))).toFixed(2)}`);
const realJ = judged.filter((x) => x.row.kind !== 'random'), randJ = judged.filter((x) => x.row.kind === 'random');
console.log(`эксперт: настоящие A ${r0(mean(realJ.filter((x) => x.row.kind === 'A').map((x) => x.j.couple)))}, B ${r0(mean(realJ.filter((x) => x.row.kind === 'B').map((x) => x.j.couple)))}, C ${r0(mean(realJ.filter((x) => x.row.kind === 'C').map((x) => x.j.couple)))}, случайные ${r0(mean(randJ.map((x) => x.j.couple)))} (как пара)`);

// Насколько хорошо тест отделяет пары A от случайных: AUC (доля пар A×случайная, где A выше).
const auc = (pos: number[], neg: number[]) => { let s = 0; for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0; return s / (pos.length * neg.length); };
const A = rows.filter((r) => r.kind === 'A');
console.log(`\nAUC «A против случайных»: как пара ${auc(A.map((r) => r.rel), random.map((r) => r.rel)).toFixed(2)}, как друзья ${auc(A.map((r) => r.fr), random.map((r) => r.fr)).toFixed(2)}`);
const B = rows.filter((r) => r.kind === 'B');
console.log(`AUC «B: дружба выше пары?» — доля пар B, где процентиль дружбы > процентиля пары: ${(B.filter((r) => pctile(frDist, r.fr) > pctile(relDist, r.rel)).length / B.length).toFixed(2)}`);

// Таблица для калибровки: сырой процент на каждые 5 процентилей случайных пар.
const q = (dist: number[]) => Array.from({ length: 21 }, (_, i) => +dist[Math.min(dist.length - 1, Math.floor((dist.length - 1) * i / 20))].toFixed(1));
fs.writeFileSync(`${D}/calibration.json`, JSON.stringify({ n: random.length, relationship: q(relDist), friendship: q(frDist) }, null, 1));
console.log('\nТаблица калибровки (сырой % на процентилях 0,5,…,100):');
console.log('пара:  ', q(relDist).join(' '));
console.log('друзья:', q(frDist).join(' '));
