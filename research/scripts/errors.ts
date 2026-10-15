import fs from 'node:fs';
import { QUESTIONS } from '/Users/arkady.vasilenko/projects/compatibility-test/src/questions';
import { compare } from '/Users/arkady.vasilenko/projects/compatibility-test/src/scoring/compare';
import { answerFor, importanceFor } from '/Users/arkady.vasilenko/projects/compatibility-test/src/answer';
const D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic';
const judge = JSON.parse(fs.readFileSync(`${D}/judge30.json`, 'utf8')).ratings as any[];
const { pairs } = JSON.parse(fs.readFileSync(`${D}/personas30.json`, 'utf8'));
const typeOf = new Map(pairs.map((p: any) => [`${p.man.id}|${p.woman.id}`, p.type]));
const raw: Record<string, Record<string, number>> = {};
const prof = (id: string) => { const r = raw[id] ??= JSON.parse(fs.readFileSync(`${D}/answers/${id}.json`, 'utf8')); return { name: id, bankVersion: 3, responses: Object.fromEntries(QUESTIONS.map((q) => [q.id, answerFor(r[q.id])])) }; };
const x = judge.map((j) => { const r = compare(QUESTIONS, prof(j.man), prof(j.woman)); return { j, t: r.relationship.percent!, flags: r.relationship.redFlags.map((f) => f.id) }; });
const rk = (v: number[]) => { const s = v.map((a, i) => [a, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); s.forEach(([, i], k) => (r[i] = k / (v.length - 1))); return r as number[]; };
const rt = rk(x.map((a) => a.t)), re = rk(x.map((a) => a.j.couple));
const res = x.map((a, i) => ({ ...a, d: rt[i] - re[i], kind: typeOf.get(`${a.j.man}|${a.j.woman}`) ?? 'случ' })).sort((a, b) => b.d - a.d);
console.log('ТЕСТ ЗАВЫШАЕТ:'); res.slice(0, 6).forEach((a) => console.log(` ${a.j.man}×${a.j.woman} (${a.kind}) тест ${Math.round(a.t)}%, эксперт ${a.j.couple}, флаги: ${a.flags.join(' ') || '—'}`));
console.log('ТЕСТ ЗАНИЖАЕТ:'); res.slice(-6).reverse().forEach((a) => console.log(` ${a.j.man}×${a.j.woman} (${a.kind}) тест ${Math.round(a.t)}%, эксперт ${a.j.couple}, флаги: ${a.flags.join(' ') || '—'}`));
// по сферам: связь совпадения с экспертом и текущая доля веса в итоговом подсчёте
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let s = 0, p = 0, q = 0; a.forEach((v, i) => { s += (v - ma) * (b[i] - mb); p += (v - ma) ** 2; q += (b[i] - mb) ** 2; }); return p && q ? s / Math.sqrt(p * q) : 0; };
const W = [0, 1, 10, 50]; const spheres = [...new Set(QUESTIONS.map((q) => q.sphere))];
let totalW = 0; const sw: Record<string, number> = {};
for (const a of x) for (const q of QUESTIONS) { const w = W[importanceFor(raw[a.j.man][q.id])] + W[importanceFor(raw[a.j.woman][q.id])]; sw[q.sphere] = (sw[q.sphere] ?? 0) + w; totalW += w; }
const out = spheres.map((s) => { const qs = QUESTIONS.filter((q) => q.sphere === s); const close = x.map((a) => mean(qs.map((q) => -Math.abs(raw[a.j.man][q.id] - raw[a.j.woman][q.id])))); return { s, r: corr(close, x.map((a) => a.j.couple)), share: (100 * sw[s]) / totalW }; }).sort((a, b) => b.r - a.r);
console.log('СФЕРЫ: связь совпадения с экспертом (r) | доля в нынешнем подсчёте');
out.forEach((o) => console.log(` ${o.s.padEnd(10)} r=${o.r.toFixed(2)} | ${o.share.toFixed(1)}%`));
