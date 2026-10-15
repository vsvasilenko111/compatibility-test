import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const judge = JSON.parse(fs.readFileSync(`${D}/judge30.json`, 'utf8')).ratings as any[];
const prof = (id: string) => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')); return { name: id, bankVersion: 3, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, answerFor(r[q.id])])) }; };
const x = judge.map((j) => ({ t: compare(QUESTIONS, prof(j.man), prof(j.woman), relationshipWeight).relationship.percent!, e: j.couple }));
let ok = 0, all = 0, big = 0, bigAll = 0;
for (let i = 0; i < x.length; i++) for (let k = i + 1; k < x.length; k++) {
  const de = x[i].e - x[k].e; if (de === 0) continue;
  const dt = x[i].t - x[k].t; const s = dt === 0 ? 0.5 : (dt > 0) === (de > 0) ? 1 : 0;
  ok += s; all++; if (Math.abs(de) >= 30) { big += s; bigAll++; }
}
console.log(`все пары сравнений: ${(100 * ok / all).toFixed(0)}% (${all}); когда эксперт видит явную разницу (≥30 баллов): ${(100 * big / bigAll).toFixed(0)}% (${bigAll})`);
