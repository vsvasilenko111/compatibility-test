// Пары типа D: совпадают по планам, различаются динамикой ссор. Ловит ли блок «Эмоциональная зрелость» то, что видят эксперты?
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { maturity } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/maturity';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
import type { Response } from '/Users/arkady.vasilenko/projects/compatibility-test/src/types';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J1 = JSON.parse(fs.readFileSync(`${D}/judge-d.json`, 'utf8')).ratings as any[];
const J2 = JSON.parse(fs.readFileSync(`${D}/judge-d-b.json`, 'utf8')).ratings as any[];
const pairs = JSON.parse(fs.readFileSync(`${D}/personas-d.json`, 'utf8')).pairs as any[];
const info = new Map(pairs.map((p) => [`${p.man.id}|${p.woman.id}`, p]));
const prof = (id: string) => {
  const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
  return { name: id, bankVersion: 4, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, (r[q.id] < 0 ? 'skipped' : answerFor(r[q.id])) as Response])) };
};
const DANGER = ['closeness', 'heated', 'silence', 'escalation'];
const rows = J1.map((a) => {
  const b = J2.find((x) => x.man === a.man && x.woman === a.woman);
  const pa = prof(a.man), pb = prof(a.woman);
  const m = maturity(QUESTIONS, pa, pb)!;
  const p = info.get(`${a.man}|${a.woman}`);
  return { id: `${a.man}|${a.woman}`, kind: p ? p.type : 'перекр', dyn: p?.dynamic ?? '', sev: p?.severity ?? '', e1: a.couple, e2: b.couple, e: (a.couple + b.couple) / 2,
    base: compare(QUESTIONS, pa, pb, relationshipWeight).relationship.percent!, risk: m.talks.filter((t) => DANGER.includes(t.key)).length, talks: m.talks.map((t) => t.key) };
});
type R = (typeof rows)[number];
const cidx = (rs: R[], s: (r: R) => number, e: (r: R) => number = (r) => r.e) => { let ok = 0, n = 0;
  for (let i = 0; i < rs.length; i++) for (let k = i + 1; k < rs.length; k++) { const dy = e(rs[i]) - e(rs[k]); if (!dy) continue; const dx = s(rs[i]) - s(rs[k]); ok += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; }
  return n ? ((100 * ok) / n).toFixed(1) : '—'; };

console.log('пара          тип     динамика           сила    э1  э2  база  флаги');
for (const r of [...rows].sort((x, y) => y.e - x.e)) console.log(`${r.id.padEnd(13)} ${r.kind.padEnd(7)} ${r.dyn.padEnd(18)} ${r.sev.padEnd(6)} ${String(r.e1).padStart(3)} ${String(r.e2).padStart(3)}  ${r.base.toFixed(0).padStart(3)}   ${r.talks.join(',')}`);

const designed = rows.filter((r) => r.kind !== 'перекр');
console.log(`\nэксперт1↔эксперт2: все ${cidx(rows, (r) => r.e1, (r) => r.e2)}% | задуманные ${cidx(designed, (r) => r.e1, (r) => r.e2)}%`);
for (const p of [0, 0.05, 0.1, 0.15, 0.2, 0.3]) {
  const s = (r: R) => r.base * (1 - p * r.risk);
  console.log(`штраф ${String(p * 100).padStart(2)}% за флаг: все 40 пар ${cidx(rows, s)}% | 16 задуманных ${cidx(designed, s)}% | внутри D+A2 по эксперту1 ${cidx(designed, s, (r) => r.e1)}%, эксперту2 ${cidx(designed, s, (r) => r.e2)}%`);
}
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const d = designed.filter((r) => r.kind === 'D'), a2 = designed.filter((r) => r.kind === 'A2');
console.log(`\nD: эксперт ${mean(d.map((r) => r.e)).toFixed(0)}, база ${mean(d.map((r) => r.base)).toFixed(0)}, с флагом ${d.filter((r) => r.risk).length}/${d.length}`);
console.log(`A2: эксперт ${mean(a2.map((r) => r.e)).toFixed(0)}, база ${mean(a2.map((r) => r.base)).toFixed(0)}, с флагом ${a2.filter((r) => r.risk).length}/${a2.length}`);
