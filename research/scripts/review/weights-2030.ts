// Веса сфер для пар 20–30 лет из больших городов: прежние (подгонка под экспертов) против ручных по исследованиям. C-index с экспертами.
// Запуск: npx vite-node research/scripts/review/weights-2030.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { RELATIONSHIP_WEIGHTS } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const age = new Map<string, number>();
for (const f of ['personas30.json', 'personas-d.json', 'fresh/personas-v.json']) { const d = read(`${D}/${f}`); for (const p of (d.pairs ?? d)) { age.set(p.man.id, p.man.age); age.set(p.woman.id, p.woman.age); } }
const prof = (dir: string, id: string) => { const raw = read(`${dir}/${id}.json`); const r: any = {}; for (const q of QUESTIONS) { const v = raw[q.id]; r[q.id] = v < 0 ? 'skipped' : answerFor(Math.max(0, Math.min(10, Math.round(v)))); } return { name: id, bankVersion: 11, responses: r }; };
const cidx = (t: number[], e: number[]) => { let n = 0, d = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { if (e[i] === e[j]) continue; d++; const st = Math.sign(t[i] - t[j]), se = Math.sign(e[i] - e[j]); n += st === se ? 1 : st === 0 ? 0.5 : 0; } return 100 * n / d; };
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
type K = [string, string];
const sets: { name: string; dir: string; keys: K[]; E: number[] }[] = [];
for (const [a, b] of [['judge30', 'judge30b'], ['judge-d', 'judge-d-b']]) { const ja = judge(`${D}/${a}.json`), jb = judge(`${D}/${b}.json`); const keys = [...ja.keys()].map((k) => k.split('|') as K); sets.push({ name: a, dir: `${D}/answers`, keys, E: keys.map((k) => (ja.get(k.join('|')).couple + jb.get(k.join('|')).couple) / 2) }); }
{ const F = `${D}/fresh`; const keys: K[] = read(`${F}/combos.json`).map((c: any) => [c.man, c.woman]); const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
  sets.push({ name: 'fresh', dir: `${F}/answers`, keys, E: keys.map((k) => { const id = k.join('|'); return (ja.get(id).couple + jb.get(id).couple + jt.get(id).couple) / 3; }) }); }
const young = (k: K) => age.get(k[0])! <= 32 && age.get(k[1])! <= 32;
const W: Record<string, Record<string, number>> = {
  'прежние (подгонка)': { kids: 1, living: 1, budget: 1, relatives: 1, space: 1, values: 1, home: 1, career: 1, roles: 0.4, money: 0.4, intimacy: 0.4, leisure: 0.15, rhythm: 0.15, loyalty: 0.15, humor: 0.15, conflicts: 0.05, honesty: 0.05 },
  'текущие': RELATIONSHIP_WEIGHTS,
  'все поровну': {},
  'для 20–30 без поправок на город': { kids: 1, living: 1, intimacy: 1, conflicts: 1, space: 1, budget: 0.7, home: 0.7, roles: 0.7, relatives: 0.7, values: 0.7, loyalty: 0.7, career: 0.7, money: 0.4, honesty: 0.4, rhythm: 0.4, leisure: 0.4, humor: 0.4 },
};
console.log('возраст персонажей:', [...age.values()].sort((a, b) => a - b).join(' '));
for (const s of sets) console.log(s.name, 'комбинаций', s.keys.length, 'из них оба ≤32:', s.keys.filter(young).length);
for (const [wn, w] of Object.entries(W)) {
  const f = (sp: string) => w[sp] ?? 1;
  const out = sets.map((s) => { const t = s.keys.map(([m, x]) => compare(QUESTIONS, prof(s.dir, m), prof(s.dir, x), f).relationship.percent!); const yi = s.keys.map((k, i) => young(k) ? i : -1).filter((i) => i >= 0);
    return `${s.name}: все ${cidx(t, s.E).toFixed(1)}, 20–32 ${cidx(yi.map((i) => t[i]), yi.map((i) => s.E[i])).toFixed(1)}`; });
  console.log(`${wn.padEnd(30)} ${out.join(' | ')}`);
}
