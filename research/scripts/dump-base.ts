// Процент «совместимости в отношениях» для списка пар: vite-node dump-base.ts <combos.json> <out.json>
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const prof = (id: string) => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')); return { name: id, bankVersion: 4, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r[q.id] < 0 ? 'skipped' : answerFor(r[q.id])])) } as any; };
const combos: string[][] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
fs.writeFileSync(process.argv[3], JSON.stringify(Object.fromEntries(combos.map(([m, w]) => [`${m}|${w}`, compare(QUESTIONS, prof(m), prof(w), relationshipWeight).relationship.percent]))));
