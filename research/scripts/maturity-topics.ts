// Что блок «Эмоциональная зрелость» показывает парам синтетического прогона: частота тем и примеры.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { maturity } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/maturity';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const judge = JSON.parse(fs.readFileSync(`${D}/judge30.json`, 'utf8')).ratings as any[];
const personas = JSON.parse(fs.readFileSync(`${D}/personas30.json`, 'utf8'));
const prof = (id: string) => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')); return { name: id, bankVersion: 4, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, answerFor(r[q.id])])) }; };
const count: Record<string, number> = {};
const byExpert: Record<string, number[]> = {};
let none = 0;
for (const j of judge) {
  const r = maturity(QUESTIONS, prof(j.man), prof(j.woman))!;
  if (!r.talks.length) none++;
  for (const t of r.talks) { count[t.key] = (count[t.key] ?? 0) + 1; (byExpert[t.key] ??= []).push(j.couple); }
  for (const s of r.softTopics) count['soft: ' + s] = (count['soft: ' + s] ?? 0) + 1;
  for (const s of r.strengths) count['опора: ' + s] = (count['опора: ' + s] ?? 0) + 1;
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`пар: ${judge.length}; без тем «стоит обсудить»: ${none}; средняя оценка эксперта по всем парам ${mean(judge.map((j) => j.couple)).toFixed(0)}`);
for (const [k, n] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${k}${byExpert[k] ? `  (эксперт в среднем ${mean(byExpert[k]).toFixed(0)})` : ''}`);
void personas;
