// Где тест сильнее всего расходится с экспертами: разница рангов (процентилей) теста и эксперта.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const prof = (id: string) => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
  return { name: id, bankVersion: 6, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r[q.id] === undefined || r[q.id] < 0 ? 'skipped' : answerFor(r[q.id])])) } as any; };
const j1 = J('judge30.json'), j2 = J('judge30b.json'), p1 = J('judge30-pf.json'), p2 = J('judge30b-pf.json');
const f = (js: any[], a: any) => js.find((x) => x.man === a.man && x.woman === a.woman);
const rows = j1.map((a) => { const c = compare(QUESTIONS, prof(a.man), prof(a.woman), relationshipWeight, friendshipWeight);
  return { id: `${a.man}|${a.woman}`, rel: c.relationship.percent!, fr: c.friendship.percent!, eRel: (a.couple + f(j2, a).couple) / 2, ePf: (f(p1, a).pf + f(p2, a).pf) / 2 }; });
const pct = (xs: number[]) => xs.map((x) => (100 * xs.filter((y) => y < x).length + 50 * (xs.filter((y) => y === x).length - 1)) / (xs.length - 1));
for (const [t, s, e] of [['ОТНОШЕНИЯ', 'rel', 'eRel'], ['ПАРТНЁР КАК ДРУГ', 'fr', 'ePf']] as const) {
  const ps = pct(rows.map((r) => r[s])), pe = pct(rows.map((r) => r[e]));
  const d = rows.map((r, i) => ({ ...r, d: ps[i] - pe[i], ps: ps[i], pe: pe[i] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  console.log(`\n${t}: тест выше экспертов (+) / ниже (−), в процентилях`);
  for (const r of d.slice(0, 12)) console.log(`  ${r.id.padEnd(10)} тест ${r[s].toFixed(0)}% (п${r.ps.toFixed(0)})  эксперты ${r[e]} (п${r.pe.toFixed(0)})  ${r.d > 0 ? '+' : ''}${r.d.toFixed(0)}`);
}
