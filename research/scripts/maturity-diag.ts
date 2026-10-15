// Почему блок «Эмоциональная зрелость» ухудшает согласие с экспертами: где штраф ломает порядок пар.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { maturity } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/maturity';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
// JUDGES=dyn — эксперты, которых явно просили учитывать динамику ссор и привязанность (judge30-dyn.json, judge30b-dyn.json).
const SUF = process.env.JUDGES ? `-${process.env.JUDGES}` : '';
const J1 = JSON.parse(fs.readFileSync(`${D}/judge30${SUF}.json`, 'utf8')).ratings as any[];
const J2 = JSON.parse(fs.readFileSync(`${D}/judge30b${SUF}.json`, 'utf8')).ratings as any[];
console.log(`эксперты: judge30${SUF}, judge30b${SUF}`);
const pairs = JSON.parse(fs.readFileSync(`${D}/personas30.json`, 'utf8')).pairs as any[];
const type = new Map(pairs.map((p) => [`${p.man.id}|${p.woman.id}`, p.type]));
const rawA = (id: string) => JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
const prof = (id: string) => { const r = rawA(id); return { name: id, bankVersion: 4, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, answerFor(r[q.id])])) }; };

const rows = J1.map((a) => {
  const e = (a.couple + J2.find((b) => b.man === a.man && b.woman === a.woman).couple) / 2;
  const r = compare(QUESTIONS, prof(a.man), prof(a.woman), relationshipWeight);
  const m = maturity(QUESTIONS, prof(a.man), prof(a.woman))!;
  return { id: `${a.man}|${a.woman}`, kind: type.get(`${a.man}|${a.woman}`) ?? 'случ', e, base: r.relationship.percent!, flags: m.talks.filter((t) => ['closeness', 'heated', 'silence', 'escalation'].includes(t.key)).map((t) => t.key) };
});

// 1. Есть ли у флагов информация сверх базового процента: остаток эксперта после линейной регрессии на базовый процент.
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const mb = mean(rows.map((r) => r.base)), me = mean(rows.map((r) => r.e));
const slope = rows.reduce((s, r) => s + (r.base - mb) * (r.e - me), 0) / rows.reduce((s, r) => s + (r.base - mb) ** 2, 0);
const resid = (r: (typeof rows)[number]) => r.e - (me + slope * (r.base - mb));
const fl = rows.filter((r) => r.flags.length), nf = rows.filter((r) => !r.flags.length);
console.log(`1. эксперт ≈ ${me.toFixed(0)} + ${slope.toFixed(2)}·(база − ${mb.toFixed(0)})`);
console.log(`   с флагом: ${fl.length} пар, эксперт ${mean(fl.map((r) => r.e)).toFixed(1)}, база ${mean(fl.map((r) => r.base)).toFixed(1)}, остаток ${mean(fl.map(resid)).toFixed(1)}`);
console.log(`   без флага: ${nf.length} пар, эксперт ${mean(nf.map((r) => r.e)).toFixed(1)}, база ${mean(nf.map((r) => r.base)).toFixed(1)}, остаток ${mean(nf.map(resid)).toFixed(1)}`);

// 2. По типам пар.
console.log('\n2. доля пар с флагом по типам:');
for (const k of ['A', 'B', 'C', 'случ']) { const g = rows.filter((r) => r.kind === k); if (g.length) console.log(`   ${k}: ${g.filter((r) => r.flags.length).length}/${g.length}, эксперт ${mean(g.map((r) => r.e)).toFixed(0)}`); }

// 3. Какие сравнения пар штраф переворачивает, и в какую сторону.
let fixed = 0, broken = 0; const brokenBy: Record<string, number> = {};
const P = 0.12;
for (let i = 0; i < rows.length; i++) for (let k = i + 1; k < rows.length; k++) {
  const x = rows[i], y = rows[k]; const de = x.e - y.e; if (!de) continue;
  const before = Math.sign(x.base - y.base), after = Math.sign(x.base * (1 - P * x.flags.length) - y.base * (1 - P * y.flags.length));
  if (before === after) continue;
  if (after === Math.sign(de)) fixed++; else { broken++; const who = x.flags.length > y.flags.length ? x : y; brokenBy[who.kind] = (brokenBy[who.kind] ?? 0) + 1; }
}
console.log(`\n3. штраф ${P * 100}% за флаг: исправил ${fixed} сравнений, сломал ${broken}; сломанные — из-за штрафа паре типа`, brokenBy);

// 4. Пары с флагом, которые эксперт ставит высоко.
console.log('\n4. пары с флагом и высокой оценкой эксперта:');
for (const r of fl.sort((a, b) => b.e - a.e).slice(0, 10)) console.log(`   ${r.id.padEnd(10)} ${r.kind.padEnd(4)} эксперт ${r.e.toFixed(0).padStart(3)} база ${r.base.toFixed(0)} остаток ${resid(r).toFixed(0).padStart(4)} ${r.flags.join(',')}`);

// 5. Насколько ответы на блок вообще различают людей: разброс по вопросам.
console.log('\n5. распределение ответов по вопросам блока (60 персонажей): среднее, ст. откл., доля ≥7');
const ids = QUESTIONS.filter((q) => q.block === 'maturity').map((q) => q.id);
const people = [...new Set(J1.flatMap((j) => [j.man, j.woman]))];
for (const id of ids) { const v = people.map((p) => rawA(p)[id] as number); const m = mean(v); console.log(`   ${id.padEnd(10)} ${m.toFixed(1)} ± ${Math.sqrt(mean(v.map((x) => (x - m) ** 2))).toFixed(1)}  ≥7: ${v.filter((x) => x >= 7).length}`); }
