import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const OUT = '/private/tmp/claude-503/-Users-arkady-vasilenko/71ff6682-1bc2-4c86-9e54-7ceb258fc537/scratchpad/review/metric';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const raw = (id: string) => JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
const prof = (id: string, skipNeg: boolean) => { const r = raw(id);
  return { name: id, bankVersion: 8, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r[q.id] === undefined || (skipNeg && r[q.id] < 0) ? 'skipped' : answerFor(r[q.id])])) } as any; };
const rows: any[] = [];
for (const f of ['judge30.json', 'judge-d.json']) for (const a of J(f)) {
  const c = compare(QUESTIONS, prof(a.man, true), prof(a.woman, true), relationshipWeight, friendshipWeight);
  const c0 = compare(QUESTIONS, prof(a.man, false), prof(a.woman, false), relationshipWeight, friendshipWeight);
  const ceq = compare(QUESTIONS, prof(a.man, true), prof(a.woman, true));
  rows.push({ set: f, man: a.man, woman: a.woman, rel: c.relationship.percent, fr: c.friendship.percent, relNoSkip: c0.relationship.percent, relEqual: ceq.relationship.percent });
}
const qs = QUESTIONS.filter((q) => q.block !== 'maturity' && q.scored !== false).map((q) => ({ id: q.id, sphere: q.sphere, block: q.block, topic: q.topic }));
fs.writeFileSync(`${OUT}/scores.json`, JSON.stringify({ rows, qs }, null, 1));
console.log(rows.length, qs.length);
