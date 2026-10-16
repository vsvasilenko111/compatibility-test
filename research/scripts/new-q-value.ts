// Польза отдельных вопросов: согласие с экспертами без вопроса и с ним (все 120 комбинаций).
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const f = (js: any[], a: any) => js.find((x) => x.man === a.man && x.woman === a.woman);
const j1 = J('judge30.json'), j2 = J('judge30b.json'), p1 = J('judge30-pf.json'), p2 = J('judge30b-pf.json');
const P: Record<string, any> = {};
const prof = (id: string) => (P[id] ??= (() => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
  return { name: id, bankVersion: 8, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r[q.id] === undefined || r[q.id] < 0 ? 'skipped' : answerFor(r[q.id])])) }; })());
const eRel = j1.map((a) => (a.couple + f(j2, a).couple) / 2), ePf = j1.map((a) => (f(p1, a).pf + f(p2, a).pf) / 2);
const cidx = (v: number[], e: number[]) => { let s = 0, n = 0; for (let i = 0; i < v.length; i++) for (let k = i + 1; k < v.length; k++) { const dy = e[i] - e[k]; if (!dy) continue; const dx = v[i] - v[k]; s += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; } return (100 * s) / n; };
const run = (qs: typeof QUESTIONS) => { const r = j1.map((a) => compare(qs, prof(a.man), prof(a.woman), relationshipWeight, friendshipWeight)); return [cidx(r.map((x) => x.relationship.percent!), eRel), cidx(r.map((x) => x.friendship.percent!), ePf)]; };
const [br, bf] = run(QUESTIONS);
console.log(`все вопросы: отношения ${br.toFixed(1)}%, партнёр как друг ${bf.toFixed(1)}%`);
const ids = process.argv.slice(2);
for (const id of ids) { const [r, fr] = run(QUESTIONS.filter((q) => q.id !== id)); console.log(`${id.padEnd(13)} вклад: отношения ${(br - r).toFixed(2)}, партнёр как друг ${(bf - fr).toFixed(2)}`); }
