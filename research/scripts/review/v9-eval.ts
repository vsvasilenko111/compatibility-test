// Банк v9: отметка «не обсуждается» и штраф за красный флаг. Сила штрафа подбирается на старых парах (120 + 40 комбинаций),
// проверяется на свежих (60 комбинаций, критерии E/T/S/ALL). Считается настоящим compare() из src/.
// Запуск: npx vite-node research/scripts/review/v9-eval.ts
import fs from 'node:fs';
import { QUESTIONS } from '../../../src/questions';
import { compare, FIRM_FACTOR } from '../../../src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';
import type { Profile } from '../../../src/types';

const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Профиль персонажа; withFirm = false — как будто отметок нет. */
function profile(dir: string, id: string, withFirm = true): Profile {
  const raw = read(`${dir}/${id}.json`) as Record<string, number>;
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id];
    if (v === undefined) throw new Error(`${id}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(Math.max(0, Math.min(10, Math.round(v))));
    responses[q.id] = withFirm && q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  return { name: id, bankVersion: 9, responses };
}

type Key = [string, string];
interface Row { base: number; reds: number }
function rows(dir: string, keys: Key[], withFirm = true): Row[] {
  return keys.map(([m, w]) => {
    const r = compare(QUESTIONS, profile(dir, m, withFirm), profile(dir, w, withFirm), relationshipWeight, friendshipWeight).relationship;
    // percent уже со штрафом FIRM_FACTOR^n — снимаем его, чтобы подбирать силу штрафа заново.
    return { base: r.percent! / FIRM_FACTOR ** r.redFlags.length, reds: r.redFlags.length };
  });
}
const score = (rs: Row[], f: number) => rs.map((r) => r.base * f ** r.reds);

/** C-index: доля пар комбинаций, упорядоченных как у критерия (ничьи критерия не считаются, ничьи теста — ½). */
function cidx(t: number[], e: number[], w?: number[]): number {
  let num = 0, den = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    if (e[i] === e[j]) continue;
    const k = w ? w[i] * w[j] : 1;
    den += k;
    const st = Math.sign(t[i] - t[j]), se = Math.sign(e[i] - e[j]);
    num += k * (st === se ? 1 : st === 0 ? 0.5 : 0);
  }
  return (100 * num) / den;
}
let seed = 7;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
/** 95% ДИ бутстрэпом по людям: мужчины и женщины пересэмплируются отдельно. */
function boot(t: number[], e: number[], keys: Key[], B = 1000): [number, number] {
  const men = [...new Set(keys.map((k) => k[0]))], wom = [...new Set(keys.map((k) => k[1]))];
  const vals: number[] = [];
  for (let b = 0; b < B; b++) {
    const cm = new Map<string, number>(), cw = new Map<string, number>();
    for (let i = 0; i < men.length; i++) { const x = men[Math.floor(rnd() * men.length)]; cm.set(x, (cm.get(x) ?? 0) + 1); }
    for (let i = 0; i < wom.length; i++) { const x = wom[Math.floor(rnd() * wom.length)]; cw.set(x, (cw.get(x) ?? 0) + 1); }
    vals.push(cidx(t, e, keys.map(([m, w]) => (cm.get(m) ?? 0) * (cw.get(w) ?? 0))));
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(B * 0.025)], vals[Math.floor(B * 0.975)]];
}
const rankOf = (v: number[]) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length - 1) / 2 + 1);

// Старые: 120 комбинаций p1–p30 (judge30 + judge30b) и 40 комбинаций пар D (judge-d + judge-d-b).
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
const old: { name: string; keys: Key[]; E: number[] }[] = [['judge30', 'judge30b'], ['judge-d', 'judge-d-b']].map(([a, b]) => {
  const ja = judge(`${D}/${a}.json`), jb = judge(`${D}/${b}.json`);
  const keys = [...ja.keys()].map((k) => k.split('|') as Key);
  return { name: a, keys, E: keys.map((k) => (ja.get(k.join('|')).couple + jb.get(k.join('|')).couple) / 2) };
});
const oldRows = old.map((o) => rows(`${D}/answers`, o.keys));

// Свежие: 60 комбинаций, E — два эксперта, T — терапевт, S — симуляция трёх лет, ALL — средний ранг.
const F = `${D}/fresh`;
const fk: Key[] = (read(`${F}/combos.json`) as any[]).map((c) => [c.man, c.woman]);
const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
const js = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
const id = (k: Key) => k.join('|');
const E = fk.map((k) => (ja.get(id(k)).couple + jb.get(id(k)).couple) / 2);
const T = fk.map((k) => jt.get(id(k)).couple);
const S = fk.map((k) => { const s = js.get(id(k)); return (s.together / 100) * (s.satM + s.satW) / 20; });
const [rE, rT, rS] = [E, T, S].map(rankOf);
const ALL = fk.map((_, i) => (rE[i] + rT[i] + rS[i]) / 3);
const design = new Map<string, string>((read(`${F}/personas-v.json`).pairs as any[]).map((p) => [`${p.man.id}|${p.woman.id}`, p.design]));
const freshRows = rows(`${F}/answers`, fk);

// Сколько красных флагов: доля случайных пар старой выборки (p1–p30, 870 комбинаций) хотя бы с одним флагом.
const ids30 = Array.from({ length: 30 }, (_, i) => i + 1);
const rand: Key[] = ids30.flatMap((m) => ids30.filter((w) => w !== m).map((w) => [`p${m}m`, `p${w}w`] as Key));
const randRows = rows(`${D}/answers`, rand);
const share = (rs: Row[]) => (100 * rs.filter((r) => r.reds > 0).length / rs.length).toFixed(0);
const marks = (dir: string) => {
  const files = fs.readdirSync(dir);
  const n = files.map((f) => Object.entries(read(`${dir}/${f}`)).filter(([k, v]) => k.startsWith('firm:') && v === 1).length);
  return `${(n.reduce((a, b) => a + b, 0) / n.length).toFixed(1)} в среднем, без отметок ${n.filter((x) => x === 0).length} из ${n.length}`;
};
console.log(`Отметок «не обсуждается» на человека: старые ${marks(`${D}/answers`)}; свежие ${marks(`${F}/answers`)}`);
console.log(`Пары хотя бы с одним красным флагом: случайные p1–p30 ${share(randRows)}% (в v8 было 82%), задуманные свежие ${share(freshRows.filter((_, i) => design.has(id(fk[i]))))}%, все свежие ${share(freshRows)}%`);

console.log('\nПодбор силы штрафа на старых (C-index с экспертами):');
const grid = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5];
let best = 1, bestC = -1;
for (const f of grid) {
  const cs = old.map((o, i) => cidx(score(oldRows[i], f), o.E));
  const c = (cs[0] * 120 + cs[1] * 40) / 160;
  if (c > bestC + 1e-9) { bestC = c; best = f; }
  console.log(`  × ${f.toFixed(2)}: 120 комбинаций ${cs[0].toFixed(1)}, пары D ${cs[1].toFixed(1)}, вместе ${c.toFixed(1)}`);
}
console.log(`Лучший на старых: × ${best}`);

const des = fk.map((k) => design.has(id(k)));
const mid = fk.map((k) => design.get(id(k)) === 'средняя');
const only = (mask: boolean[]) => (t: number[], e: number[]) => cidx(t.filter((_, i) => mask[i]), e.filter((_, i) => mask[i]));
console.log('\nПроверка на свежих (60 комбинаций):');
for (const [label, rs, f] of [
  ['v9 без отметок (как будто их нет)', rows(`${F}/answers`, fk, false), 1],
  ['v9 с флагами, без штрафа', freshRows, 1],
  [`v9 со штрафом × ${best} (подобран на старых)`, freshRows, best],
  ['v9 со штрафом × 0.85 (как в черновике)', freshRows, 0.85],
] as [string, Row[], number][]) {
  const t = score(rs, f);
  const [lo, hi] = boot(t, ALL, fk);
  console.log(`  ${label}: E ${cidx(t, E).toFixed(1)} T ${cidx(t, T).toFixed(1)} S ${cidx(t, S).toFixed(1)} ALL ${cidx(t, ALL).toFixed(1)} (ДИ ${lo.toFixed(0)}–${hi.toFixed(0)})`
    + ` | задуманные ${only(des)(t, ALL).toFixed(1)}, средние ${only(mid)(t, ALL).toFixed(1)}`);
}
console.log('\nДля сравнения (v8, research/review/README.md): свежие ALL 74,3 (ДИ 59–86), средние 42.');
