// Градация процентов: какие исходы у синтетических пар в каждом диапазоне показанного процента «совместимости в отношениях».
// Запуск: npx vite-node research/scripts/review/bands.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { relationshipWeight, friendshipWeight } from '../../../src/questions/spheres';
import { calibrate, RELATIONSHIP_TABLE, FRIENDSHIP_TABLE } from '../../../src/scoring/calibration';
import { answerFor } from '../../../src/answer';
const D = 'research/synthetic';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const prof = (dir: string, id: string) => { const raw = read(`${dir}/${id}.json`); const r: any = {};
  for (const q of QUESTIONS) { const v = raw[q.id]; r[q.id] = v < 0 ? 'skipped' : answerFor(Math.max(0, Math.min(10, Math.round(v)))); } return { name: id, bankVersion: 11, responses: r }; };
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
const shown = (dir: string, m: string, w: string) => { const r = compare(QUESTIONS, prof(dir, m), prof(dir, w), relationshipWeight, friendshipWeight); return calibrate(r.relationship.percent, RELATIONSHIP_TABLE)!; };
const BANDS = [[0, 40], [40, 50], [50, 60], [60, 70], [70, 80], [80, 90], [90, 101]];
const band = (x: number) => BANDS.findIndex(([a, b]) => x >= a && x < b);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

// Свежие: эксперты, терапевт (0–100) и симуляция трёх лет: вместе ли через 3 года (вероятность %), удовлетворённость 1–10.
const F = `${D}/fresh`;
const fk = read(`${F}/combos.json`).map((c: any) => [c.man, c.woman, c.kind ?? '']);
const fa = judge(`${F}/judge-a.json`), fb = judge(`${F}/judge-b.json`), ft = judge(`${F}/judge-t.json`);
const sim = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const design = new Map<string, string>((read(`${F}/personas-v.json`).pairs as any[]).map((p) => [`${p.man.id}|${p.woman.id}`, p.design]));
const rows = fk.map(([m, w]: string[]) => { const id = `${m}|${w}`, s = sim.get(id); return { p: shown(`${F}/answers`, m, w), e: (fa.get(id).couple + fb.get(id).couple) / 2, t: ft.get(id).couple, tog: s.together, sat: (s.satM + s.satW) / 2, d: design.get(id) ?? 'случайная' }; });
// Старые: 120 комбинаций с двумя экспертами; задуманные пары A (крепкие), B (друзья, но планы расходятся), C (плохие), D (динамика ссор).
const j1 = judge(`${D}/judge30.json`), j2 = judge(`${D}/judge30b.json`);
const kind = new Map<string, string>(); for (const f of ['personas30.json', 'personas-d.json']) { const d = read(`${D}/${f}`); for (const p of (d.pairs ?? d)) kind.set(`${p.man.id}|${p.woman.id}`, p.type); }
const old = [...j1.keys()].map((id) => { const [m, w] = id.split('|'); return { p: shown(`${D}/answers`, m, w), e: (j1.get(id).couple + j2.get(id).couple) / 2, k: kind.get(id) ?? 'случайная' }; });
// Все случайные пары p1–p30 (870): какая доля в каждом диапазоне.
const ids = Array.from({ length: 30 }, (_, i) => i + 1);
const rand = ids.flatMap((m) => ids.filter((w) => w !== m).map((w) => shown(`${D}/answers`, `p${m}m`, `p${w}w`)));
const real = [...kind.entries()].filter(([, t]) => t === 'A').map(([id]) => { const [m, w] = id.split('|'); return shown(`${D}/answers`, m, w); });

console.log('| Диапазон | Случайные пары | Свежие: n | эксперты | терапевт | вместе через 3 года | удовл. 1–10 | Старые: n | эксперты | из них задуманных крепких |');
BANDS.forEach(([a, b], i) => {
  const f = rows.filter((r) => band(r.p) === i), o = old.filter((r) => band(r.p) === i);
  console.log(`| ${a}–${Math.min(b, 100)} | ${(100 * rand.filter((x) => band(x) === i).length / rand.length).toFixed(0)}% | ${f.length} | ${mean(f.map((r) => r.e)).toFixed(0)} | ${mean(f.map((r) => r.t)).toFixed(0)} | ${mean(f.map((r) => r.tog)).toFixed(0)}% | ${mean(f.map((r) => r.sat)).toFixed(1)} | ${o.length} | ${mean(o.map((r) => r.e)).toFixed(0)} | ${o.filter((r) => r.k === 'A').length} |`);
});
console.log('\nЗадуманные пары у свежих — медиана процента по типу:');
for (const d of [...new Set(rows.map((r) => r.d))]) { const v = rows.filter((r) => r.d === d).map((r) => r.p).sort((x, y) => x - y); console.log(`  ${d}: n=${v.length}, медиана ${v[v.length >> 1].toFixed(0)}, от ${v[0].toFixed(0)} до ${v[v.length - 1].toFixed(0)}`); }
console.log('Старые задуманные пары — медиана по типу:');
for (const t of ['A', 'B', 'C', 'D']) { const v = old.filter((r) => r.k === t).map((r) => r.p).sort((x, y) => x - y); if (v.length) console.log(`  ${t}: n=${v.length}, медиана ${v[v.length >> 1].toFixed(0)}, от ${v[0].toFixed(0)} до ${v[v.length - 1].toFixed(0)}`); }
void FRIENDSHIP_TABLE; void real;
