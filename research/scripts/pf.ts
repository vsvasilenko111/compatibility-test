// «Партнёр как друг»: согласие процента дружбы с экспертами, которые оценивали именно дружбу внутри пары (judge30-pf, judge30b-pf).
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const P1 = J('judge30-pf.json'), P2 = J('judge30b-pf.json'), O1 = J('judge30.json'), O2 = J('judge30b.json');
const find = (js: any[], r: any) => js.find((x) => x.man === r.man && x.woman === r.woman);
const prof = (id: string) => { const r = JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
  return { name: id, bankVersion: 6, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r[q.id] === undefined || r[q.id] < 0 ? 'skipped' : answerFor(r[q.id])])) }; };
const rows = P1.map((a) => { const c = compare(QUESTIONS, prof(a.man), prof(a.woman), relationshipWeight);
  return { p1: a.pf, p2: find(P2, a).pf, o: (find(O1, a).friends + find(O2, a).friends) / 2, couple: (find(O1, a).couple + find(O2, a).couple) / 2, fr: c.friendship.percent!, rel: c.relationship.percent! }; });
type R = (typeof rows)[number];
const cidx = (s: (r: R) => number, e: (r: R) => number) => { let ok = 0, n = 0;
  for (let i = 0; i < rows.length; i++) for (let k = i + 1; k < rows.length; k++) { const dy = e(rows[i]) - e(rows[k]); if (!dy) continue; const dx = s(rows[i]) - s(rows[k]); ok += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; }
  return ((100 * ok) / n).toFixed(1); };
const pm = (r: R) => (r.p1 + r.p2) / 2;
console.log(`эксперт1↔эксперт2 (партнёр как друг): ${cidx((r) => r.p1, (r) => r.p2)}%`);
console.log(`тест «партнёр как друг» ↔ эксперт1 ${cidx((r) => r.fr, (r) => r.p1)}% | эксперт2 ${cidx((r) => r.fr, (r) => r.p2)}% | среднее ${cidx((r) => r.fr, pm)}%`);
console.log(`для сравнения: тест ↔ старые эксперты «как друзья» ${cidx((r) => r.fr, (r) => r.o)}%; процент отношений ↔ новые эксперты ${cidx((r) => r.rel, pm)}%`);
console.log(`новые эксперты ↔ старые «как друзья» ${cidx(pm, (r) => r.o)}% | новые ↔ «как пара» ${cidx(pm, (r) => r.couple)}%`);

// Варианты: дружба с весами сфер как в отношениях; дружба только по ценностям; без ценностей.
const W = (k: (s: string) => number) => (r: any) => compare(QUESTIONS.filter((q) => q.block === 'friendship'), prof(r.man), prof(r.woman), k).relationship.percent!;
const vars: [string, (s: string) => number][] = [['веса как в отношениях', relationshipWeight], ['ценности ×3', (s) => (s === 'values' ? 3 : 1)], ['ценности ×5', (s) => (s === 'values' ? 5 : 1)], ['без ценностей', (s) => (s === 'values' ? 0 : 1)]];
for (const [name, k] of vars) { const f = W(k); const xs = P1.map((a) => f(a)); rows.forEach((r: any, i) => (r.v = xs[i])); console.log(`вариант «${name}»: ↔ новые эксперты ${cidx((r: any) => r.v, pm)}%`); }
