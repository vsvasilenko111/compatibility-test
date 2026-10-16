// Гипотезы по ошибкам: (1) разница в возрасте, (2) «хочу детей / не хочу» как принципиальное расхождение независимо от силы ответа.
import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions/spheres';
import { answerFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const J = (f: string) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')).ratings as any[];
const raw = (id: string) => JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8'));
const age = (id: string) => Number(fs.readFileSync(`${D}/bios/${id}.txt`, 'utf8').split('\n')[0].match(/(\d+)/)![1]);
const prof = (id: string) => { const r = raw(id); return { name: id, bankVersion: 6, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, r[q.id] === undefined || r[q.id] < 0 ? 'skipped' : answerFor(r[q.id])])) } as any; };
const f = (js: any[], a: any) => js.find((x) => x.man === a.man && x.woman === a.woman);
const j1 = J('judge30.json'), j2 = J('judge30b.json'), d1 = J('judge30-dyn.json'), d2 = J('judge30b-dyn.json'), p1 = J('judge30-pf.json'), p2 = J('judge30b-pf.json');
const rows = j1.map((a) => { const c = compare(QUESTIONS, prof(a.man), prof(a.woman), relationshipWeight, friendshipWeight);
  const ka = raw(a.man)['kids-02'], kb = raw(a.woman)['kids-02'];
  return { gap: Math.abs(age(a.man) - age(a.woman)), kidsGap: Math.abs(ka - kb), rel: c.relationship.percent!, fr: c.friendship.percent!,
    eRel: (a.couple + f(j2, a).couple) / 2, eDyn: (f(d1, a).couple + f(d2, a).couple) / 2, ePf: (f(p1, a).pf + f(p2, a).pf) / 2 }; });
type R = (typeof rows)[number];
const cidx = (v: number[], e: number[], idx: number[]) => { let s = 0, n = 0;
  for (let i = 0; i < idx.length; i++) for (let k = i + 1; k < idx.length; k++) { const dy = e[idx[i]] - e[idx[k]]; if (!dy) continue; const dx = v[idx[i]] - v[idx[k]]; s += dx === 0 ? 0.5 : (dx > 0) === (dy > 0) ? 1 : 0; n++; } return (100 * s) / n; };
console.log('разница в возрасте: медиана', [...rows.map((r) => r.gap)].sort((a, b) => a - b)[60], 'макс', Math.max(...rows.map((r) => r.gap)));
type V = { name: string; s: (r: R, base: number) => number };
const VARS: V[] = [{ name: 'сейчас', s: (_r, b) => b }];
for (const g0 of [3, 5, 8, 10]) for (const p of [0.01, 0.02, 0.03, 0.05]) VARS.push({ name: `возраст: −${p * 100}% за год сверх ${g0}`, s: (r, b) => b * Math.max(0, 1 - p * Math.max(0, r.gap - g0)) });
for (const t of [5, 6, 7]) for (const p of [0.1, 0.2, 0.3]) VARS.push({ name: `дети: −${p * 100}% при разнице ≥${t}`, s: (r, b) => (r.kidsGap >= t ? b * (1 - p) : b) });
let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const all = rows.map((_, i) => i);
for (const [t, key, ek] of [['отношения', 'rel', 'eRel'], ['отношения (динамика)', 'rel', 'eDyn'], ['партнёр как друг', 'fr', 'ePf']] as const) {
  const e = rows.map((r) => r[ek]);
  for (const fam of ['возраст', 'дети']) {
    const vs = [VARS[0], ...VARS.filter((v) => v.name.startsWith(fam))]; const S = vs.map((v) => rows.map((r) => v.s(r, r[key])));
    let b = 0, s = 0, w = 0; const N = 200;
    for (let i = 0; i < N; i++) { const sh = [...all].sort(() => rnd() - 0.5), tr = sh.slice(0, 60), te = sh.slice(60);
      let bi = 0, bs = -1; S.forEach((v, j) => { const c = cidx(v, e, tr); if (c > bs + 1e-9) { bs = c; bi = j; } });
      const cb = cidx(S[0], e, te), cs = cidx(S[bi], e, te); b += cb; s += cs; if (cs > cb) w++; }
    const best = S.map((v, j) => [cidx(v, e, all), j]).sort((x, y) => y[0] - x[0])[0];
    console.log(`${t.padEnd(22)} ${fam.padEnd(8)} отложенная: ${(b / N).toFixed(1)}% → ${(s / N).toFixed(1)}% (лучше в ${w}/${N}); лучший на всех: ${vs[best[1]].name} ${best[0].toFixed(1)}%`);
  }
}
