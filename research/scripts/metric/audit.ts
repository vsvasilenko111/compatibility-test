// Аудит метрики: балл теста (c-index) с 95% бутстрэп-интервалами, согласие оценщиков (сравнение «одинаковое с одинаковым»),
// замороженное разбиение свежих пар на рабочую/проверочную части, парное сравнение с прежней версией (банк v13).
// Профили собираются как в research/scripts/review/scale-eval.ts, подсчёт — compare() приложения.
//
// Запуск (по умолчанию — только рабочая часть свежих пар и старые пары; проверочная часть не печатается):
//   npx vite-node research/scripts/metric/audit.ts | tee research/metric/audit.txt
// Проверка решения на проверочной части — один раз на решение, каждый запуск дописывается в research/metric/holdout-runs.log
// и обязан попасть в journal.md:
//   npx vite-node research/scripts/metric/audit.ts -- --holdout "<какое решение проверяется>"
// Разбиение создаётся только явной командой и только если файла нет (потом не меняется, сверяется по SHA-256):
//   npx vite-node research/scripts/metric/audit.ts -- --create-split
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { BANK_VERSION, QUESTIONS } from '../../../src/questions';
import { compare } from '../../../src/scoring/compare';
import { friendshipWeight, relationshipWeight } from '../../../src/questions/spheres';
import { answerFor } from '../../../src/answer';
import type { Priority, Profile, Question } from '../../../src/types';

const D = 'research/synthetic';
const F = `${D}/fresh`;
const M = 'research/metric';
const SPLIT = `${M}/split.json`;
const B = 4000; // повторов бутстрэпа
const BOOT_SEED = 20261027;
const SPLIT_SEED = 14153;
// Отпечаток замороженного split.json (создан 2026-10-27). Несовпадение — остановка: разбиение не меняется.
const SPLIT_SHA256 = '99b4cee326b26e9cd840f21510983019bf58c07f22fcd2231536a7b3428cd025';
const HOLDOUT_LOG = 'research/metric/holdout-runs.log';
const argv = process.argv.slice(2);
const HOLDOUT = argv.includes('--holdout');
const CREATE_SPLIT = argv.includes('--create-split');
const holdoutReason = HOLDOUT ? argv[argv.indexOf('--holdout') + 1] : undefined;
if (HOLDOUT && (!holdoutReason || holdoutReason.startsWith('--')))
  throw new Error('--holdout требует описания решения: --holdout "<какое решение проверяется>"');
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
type Key = [string, string];
const id = (k: Key) => k.join('|');

// ---------- генератор и статистика ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// c-index как в scale-eval.ts: пары с равным критерием пропускаются, ничья теста = 0,5.
// idx — набор индексов (бутстрэп-выборка); одинаковые индексы дают равный критерий и пропускаются.
function cidx(t: number[], e: number[], idx: number[]): number {
  let num = 0, den = 0;
  for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const i = idx[a], j = idx[b];
    if (e[i] === e[j]) continue;
    den++;
    const st = Math.sign(t[i] - t[j]), se = Math.sign(e[i] - e[j]);
    num += st === se ? 1 : st === 0 ? 0.5 : 0;
  }
  return (100 * num) / den;
}
// Вариант без ничьих с обеих сторон (concordant / (concordant + discordant)) — верхняя оценка для грубых шкал.
function cidxNoTies(t: number[], e: number[], idx: number[]): number {
  let c = 0, d = 0;
  for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const i = idx[a], j = idx[b];
    const s = Math.sign(t[i] - t[j]) * Math.sign(e[i] - e[j]);
    if (s > 0) c++; else if (s < 0) d++;
  }
  return (100 * c) / (c + d);
}
const rankOf = (v: number[]) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length - 1) / 2 + 1);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// Одни и те же бутстрэп-выборки для всех метрик одного набора пар — интервалы разниц парные.
function bootSets(idx: number[], seed: number): number[][] {
  const r = mulberry32(seed);
  return Array.from({ length: B }, () => idx.map(() => idx[Math.floor(r() * idx.length)]));
}
function ci(stat: (idx: number[]) => number, idx: number[], sets: number[][]) {
  const point = stat(idx);
  const xs = sets.map(stat).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))];
  return { point, lo: q(0.025), hi: q(0.975), pPos: xs.filter((x) => x > 0).length / xs.length };
}
const fd = (d: number) => (x: number) => x.toFixed(d).replace('.', ',');
const f1 = fd(1);
const fmt = (c: { point: number; lo: number; hi: number }, d = 1) => `${fd(d)(c.point).padStart(5)} [${fd(d)(c.lo)}; ${fd(d)(c.hi)}]`;
// Бутстрэп «по персонажам» (pigeonhole, Owen 2007): мужчины и женщины пересэмплируются независимо,
// пара входит в выборку (кратность мужчины × кратность женщины) раз. Учитывает, что один персонаж — в нескольких парах.
function personaSets(keys: Key[], idx: number[], seed: number): number[][] {
  const r = mulberry32(seed);
  const men = [...new Set(idx.map((i) => keys[i][0]))], women = [...new Set(idx.map((i) => keys[i][1]))];
  return Array.from({ length: B }, () => {
    const cm = new Map<string, number>(), cw = new Map<string, number>();
    for (const _ of men) { const m = men[Math.floor(r() * men.length)]; cm.set(m, (cm.get(m) ?? 0) + 1); }
    for (const _ of women) { const w = women[Math.floor(r() * women.length)]; cw.set(w, (cw.get(w) ?? 0) + 1); }
    const set: number[] = [];
    for (const i of idx) { const k = (cm.get(keys[i][0]) ?? 0) * (cw.get(keys[i][1]) ?? 0); for (let c = 0; c < k; c++) set.push(i); }
    return set;
  });
}
const out: string[] = [];
const log = (s = '') => { out.push(s); console.log(s); };

// ---------- профили (как в scale-eval.ts) ----------
const VALUES = [0, 3, 5, 7, 10];
function v14(dir: string, pid: string, withPrio: boolean): Profile {
  const raw = read(`${dir}/${pid}.json`) as Record<string, number | string>;
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const v = raw[q.id] as number;
    if (v === undefined) throw new Error(`${pid}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = answerFor(VALUES[v - 1]);
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  const priorities = Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith('prio:')).map(([k, v]) => [k.slice(5), v as Priority]));
  if (withPrio && Object.keys(priorities).length === 0) throw new Error(`${pid}: нет личной важности сфер`);
  return { name: pid, bankVersion: BANK_VERSION, responses, ...(withPrio ? { priorities } : {}) };
}

// ---------- критерии ----------
const judge = (f: string) => new Map((read(f).ratings as any[]).map((r) => [`${r.man}|${r.woman}`, r]));
const must = <T>(m: Map<string, T>, k: string, f: string): T => { const v = m.get(k); if (!v) throw new Error(`${f}: нет оценки ${k}`); return v; };
const ja30 = judge(`${D}/judge30.json`), jb30 = judge(`${D}/judge30b.json`);
if (ja30.size !== jb30.size) throw new Error('judge30 и judge30b: разное число пар');
const ok: Key[] = [...ja30.keys()].map((k) => k.split('|') as Key);
const oA = ok.map((k) => ja30.get(id(k)).couple), oB = ok.map((k) => must(jb30, id(k), 'judge30b').couple);
const oAf = ok.map((k) => ja30.get(id(k)).friends), oBf = ok.map((k) => must(jb30, id(k), 'judge30b').friends);
const oE = ok.map((_, i) => (oA[i] + oB[i]) / 2), oF = ok.map((_, i) => (oAf[i] + oBf[i]) / 2);

const fk: Key[] = (read(`${F}/combos.json`) as any[]).map((c) => [c.man, c.woman]);
if (new Set(fk.map(id)).size !== fk.length) throw new Error('combos.json: повторы пар');
const ja = judge(`${F}/judge-a.json`), jb = judge(`${F}/judge-b.json`), jt = judge(`${F}/judge-t.json`);
const js = new Map([...judge(`${F}/sim-1.json`), ...judge(`${F}/sim-2.json`)]);
for (const [m, f] of [[ja, 'judge-a'], [jb, 'judge-b'], [jt, 'judge-t'], [js, 'sim-1/2']] as const)
  if (m.size !== fk.length) throw new Error(`${f}: ${m.size} оценок при ${fk.length} парах`);
const fA = fk.map((k) => must(ja, id(k), 'judge-a').couple), fB = fk.map((k) => must(jb, id(k), 'judge-b').couple);
const E = fk.map((_, i) => (fA[i] + fB[i]) / 2);
const T = fk.map((k) => must(jt, id(k), 'judge-t').couple);
const S = fk.map((k) => { const s = must(js, id(k), 'sim'); return (s.together / 100) * (s.satM + s.satW) / 20; });
const [rE, rT, rS] = [E, T, S].map(rankOf);
const ALL = fk.map((_, i) => (rE[i] + rT[i] + rS[i]) / 3);
const ET = fk.map((_, i) => (rE[i] + rT[i]) / 2), ES = fk.map((_, i) => (rE[i] + rS[i]) / 2), TS = fk.map((_, i) => (rT[i] + rS[i]) / 2);

// ---------- баллы теста ----------
const score = (qs: Question[], a: Profile, b: Profile) => {
  const r = compare(qs, a, b, relationshipWeight, friendshipWeight);
  return [r.relationship.percent!, r.friendship.percent!];
};
const testOld = (withPrio: boolean) => ok.map(([m, w]) => score(QUESTIONS, v14(`${D}/answers-v14`, m, withPrio), v14(`${D}/answers-v14`, w, withPrio)));
const testFresh = (withPrio: boolean) => fk.map(([m, w]) => score(QUESTIONS, v14(`${F}/answers-v14`, m, withPrio), v14(`${F}/answers-v14`, w, withPrio))[0]);
const oP = testOld(true), oN = testOld(false);
const tP = testFresh(true), tN = testFresh(false);

// ---------- прежняя версия: банк v13, шкала 0–10, формула коммита 2d2b317 (до таблицы MATCH) ----------
const OLD_REV = '2d2b317';
const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-v13-'));
execSync(`git archive ${OLD_REV} src | tar -x -C ${oldDir}`);
const oldCompare = (await import(path.join(oldDir, 'src/scoring/compare.ts'))).compare;
const oldSph = await import(path.join(oldDir, 'src/questions/spheres.ts'));
const oldAnswerFor = (await import(path.join(oldDir, 'src/answer.ts'))).answerFor;
const V13: Question[] = read(path.join(oldDir, 'src/questions/bank.json')).questions;
function v13(dir: string, pid: string): Profile {
  const raw = read(`${dir}/${pid}.json`) as Record<string, number>;
  const alias: Record<string, string> = { 'humor-12': 'humor-01', 'conflicts-10': 'conflicts-05' };
  const responses: Profile['responses'] = {};
  for (const q of V13) {
    const v = raw[q.id] ?? raw[alias[q.id]];
    if (v === undefined) throw new Error(`${pid}: нет ответа на ${q.id}`);
    if (v < 0) { responses[q.id] = 'skipped'; continue; }
    const a = oldAnswerFor(Math.max(0, Math.min(10, Math.round(v))));
    responses[q.id] = q.firm && raw[`firm:${q.id}`] === 1 ? { ...a, firm: true } : a;
  }
  return { name: pid, bankVersion: 13, responses };
}
const oldScore = (a: Profile, b: Profile) => {
  const r = oldCompare(V13, a, b, oldSph.relationshipWeight, oldSph.friendshipWeight);
  return [r.relationship.percent!, r.friendship.percent!];
};
const o13 = ok.map(([m, w]) => oldScore(v13(`${D}/answers`, m), v13(`${D}/answers`, w)));
const t13 = fk.map(([m, w]) => oldScore(v13(`${F}/answers`, m), v13(`${F}/answers`, w))[0]);
fs.rmSync(oldDir, { recursive: true, force: true });


// ---------- разбиение свежих пар (заморожено; создаётся только явной командой --create-split) ----------
// Стратификация: «задуманные» пары (pNm–pNw) и перекрёстные; внутри страты — по ALL, тройками, одна из тройки в проверку.
type Split = { seed: number; created: string; method: string; work: string[]; holdout: string[] };
if (CREATE_SPLIT) {
  if (fs.existsSync(SPLIT)) throw new Error(`${SPLIT} уже есть — разбиение заморожено и не пересоздаётся`);
  const r = mulberry32(SPLIT_SEED);
  const holdout: string[] = [];
  const designed = (k: Key) => k[0].slice(0, -1) === k[1].slice(0, -1);
  for (const stratum of [true, false]) {
    const ix = range(fk.length).filter((i) => designed(fk[i]) === stratum).sort((a, b) => ALL[a] - ALL[b] || id(fk[a]).localeCompare(id(fk[b])));
    for (let s = 0; s < ix.length; s += 3) {
      const chunk = ix.slice(s, s + 3);
      if (chunk.length === 3 || r() < chunk.length / 3) holdout.push(id(fk[chunk[Math.floor(r() * chunk.length)]]));
    }
  }
  const hs = new Set(holdout);
  const created: Split = {
    seed: SPLIT_SEED,
    created: new Date().toISOString().slice(0, 10),
    method: 'страты: задуманные пары pNm–pNw / перекрёстные; внутри — сортировка по ALL, тройками, одна пара из тройки в проверку (mulberry32)',
    work: fk.map(id).filter((k) => !hs.has(k)),
    holdout: fk.map(id).filter((k) => hs.has(k)),
  };
  fs.mkdirSync(M, { recursive: true });
  fs.writeFileSync(SPLIT, JSON.stringify(created, null, 2) + '\n');
  console.log(`Создано ${SPLIT}. SHA-256: ${createHash('sha256').update(fs.readFileSync(SPLIT)).digest('hex')} — впишите в SPLIT_SHA256 и закоммитьте файл.`);
  process.exit(0);
}
if (!fs.existsSync(SPLIT)) throw new Error(`${SPLIT} не найден. Разбиение заморожено: восстановите файл из git, а не создавайте заново`);
const splitHash = createHash('sha256').update(fs.readFileSync(SPLIT)).digest('hex');
if (splitHash !== SPLIT_SHA256) throw new Error(`${SPLIT} изменён (SHA-256 ${splitHash} ≠ ${SPLIT_SHA256}). Разбиение не меняется`);
const split: Split = read(SPLIT);
const pos = new Map(fk.map((k, i) => [id(k), i]));
const workIx = split.work.map((k) => { const i = pos.get(k); if (i === undefined) throw new Error(`split: нет пары ${k}`); return i; });
const holdIx = split.holdout.map((k) => { const i = pos.get(k); if (i === undefined) throw new Error(`split: нет пары ${k}`); return i; });
if (workIx.length + holdIx.length !== fk.length || new Set([...workIx, ...holdIx]).size !== fk.length) throw new Error('split не покрывает combos.json');

// ---------- вывод ----------
const fAll = range(fk.length), oAll = range(ok.length);
const fSets = bootSets(fAll, BOOT_SEED), oSets = bootSets(oAll, BOOT_SEED + 1);
const wSets = bootSets(workIx, BOOT_SEED + 2), hSets = bootSets(holdIx, BOOT_SEED + 3);
const wPSets = personaSets(fk, workIx, BOOT_SEED + 6);
const sh = (c: string) => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const head = sh('git rev-parse --short HEAD');
const bankRev = sh('git log -1 --format=%h -- src/questions');
const dirty = sh('git status --porcelain -- src/questions src/scoring src/answer.ts') !== '' ? ', src ИЗМЕНЁН относительно коммита' : '';
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const pp = (x: number) => x.toFixed(3).replace('.', ',');
const diff = (a: number[], b: number[], c: number[]) => (ix: number[]) => cidx(a, c, ix) - cidx(b, c, ix);

log(`Аудит метрики — банк v${BANK_VERSION} (${QUESTIONS.length} вопросов, последний коммит src/questions ${bankRev}), HEAD ${head}${dirty}, compare() приложения, ${today}`);
log(`c-index ×100 (50 — угадывание, 100 — полное согласие); 95% перцентильный бутстрэп по парам, ${B} повторов, зерно ${BOOT_SEED}.`);
log(`Свежие пары: ${fk.length} (20 мужчин × 20 женщин, каждый в 1–7 парах); разбиение ${SPLIT} (создано ${split.created}, зерно ${split.seed}, SHA-256 сверен):`);
log(`  рабочая ${workIx.length} пар, проверочная ${holdIx.length} пар. Старые пары: ${ok.length}.`);
log(HOLDOUT
  ? `РЕЖИМ ПРОВЕРКИ (--holdout): «${holdoutReason}». Запуск дописан в ${HOLDOUT_LOG}; занести в journal.md.`
  : 'Режим по умолчанию: свежие пары — только рабочая часть; проверочная часть и «все 60» не считаются.');
log('Персонажи, ответы, эксперты, терапевт и симуляция созданы одним семейством моделей — это синтетика, не реальные пары.');

log('\n1. Балл теста (с личной важностью сфер — как в приложении)');
const fresh = (n: string, ix: number[], sets: number[][]) => {
  for (const [c, cn] of [[E, 'E (эксперты)'], [T, 'T (терапевт)'], [S, 'S (симуляция)'], [ALL, 'ALL']] as const)
    log(`  ${`${n} vs ${cn}`.padEnd(34)} ${fmt(ci((x) => cidx(tP, c, x), ix, sets))}`);
};
fresh('рабочая', workIx, wSets);
log(`  ${'рабочая vs ALL, по персонажам'.padEnd(34)} ${fmt(ci((x) => cidx(tP, ALL, x), workIx, wPSets))}`);
if (HOLDOUT) { fresh('все 60', fAll, fSets); fresh('проверочная', holdIx, hSets); }
log(`  ${'старые vs «пара»'.padEnd(34)} ${fmt(ci((x) => cidx(oP.map((y) => y[0]), oE, x), oAll, oSets))}`);
log(`  ${'старые vs «друзья»'.padEnd(34)} ${fmt(ci((x) => cidx(oP.map((y) => y[1]), oF, x), oAll, oSets))}`);

log('\n2. Согласие оценщиков и тест — одинаковое с одинаковым');
log('  Все оценщики созданы той же моделью по тем же биографиям: их согласие — не верхняя граница точности, а согласие');
log('  одного взгляда модели с собой. Тест против составного ALL с этими числами напрямую не сравнивается.');
log('  (C — первый как «предсказатель» второго, ничьи первого = 0,5, как у теста; разница — парный бутстрэп)');
const agree = (ix: number[], sets: number[][], tag: string) => {
  for (const [n, X, Y] of [['E', E, TS], ['T', T, ES], ['S', S, ET]] as const) {
    const yn = n === 'E' ? 'ранг(T,S)' : n === 'T' ? 'ранг(E,S)' : 'ранг(E,T)';
    const d = ci((x) => cidx(X, Y, x) - cidx(tP, Y, x), ix, sets);
    log(`  ${tag}: ${`${n} vs ${yn}`.padEnd(16)} ${fmt(ci((x) => cidx(X, Y, x), ix, sets))}   тест vs ${yn} ${fmt(ci((x) => cidx(tP, Y, x), ix, sets))}   разрыв ${fmt(d, 2)}`);
  }
  const d = ci((x) => cidx(fA, fB, x) - cidx(tP, fB, x), ix, sets);
  log(`  ${tag}: ${'judge-a vs judge-b'.padEnd(16)} ${fmt(ci((x) => cidx(fA, fB, x), ix, sets))}   тест vs judge-b   ${fmt(ci((x) => cidx(tP, fB, x), ix, sets))}   разрыв ${fmt(d, 2)}`);
  const ab = ci((x) => cidx(tP, fA, x) - cidx(tP, fB, x), ix, sets);
  log(`  ${tag}: тест vs judge-a ${fmt(ci((x) => cidx(tP, fA, x), ix, sets))}; разница «vs judge-a − vs judge-b» ${fmt(ab, 2)}  P(>0)=${pp(ab.pPos)}`);
};
agree(workIx, wSets, 'рабочая');
if (HOLDOUT) agree(fAll, fSets, 'все 60');
{
  const tO = oP.map((y) => y[0]);
  const d = ci((x) => cidx(oA, oB, x) - cidx(tO, oB, x), oAll, oSets);
  log(`  старые «пара»: judge30 vs judge30b ${fmt(ci((x) => cidx(oA, oB, x), oAll, oSets))}   тест vs judge30b ${fmt(ci((x) => cidx(tO, oB, x), oAll, oSets))}   разрыв ${fmt(d, 2)}`);
  const tF = oP.map((y) => y[1]);
  const df = ci((x) => cidx(oAf, oBf, x) - cidx(tF, oBf, x), oAll, oSets);
  log(`  старые «друзья»: judge30 vs judge30b ${fmt(ci((x) => cidx(oAf, oBf, x), oAll, oSets))}   тест vs judge30b ${fmt(ci((x) => cidx(tF, oBf, x), oAll, oSets))}   разрыв ${fmt(df, 2)}`);
}

log('\n3. Справка: без личной важности сфер (разница «с − без», парный бутстрэп)');
log('  Внимание: ×3 выбран лучшим из 7 вариантов на всех 60 свежих парах (research/review/priorities-eval-v14.txt) —');
log('  разница ниже оптимистична (отбор на тех же данных, без поправки на множественность).');
for (const [n, c] of [['E', E], ['T', T], ['S', S], ['ALL', ALL]] as const)
  log(`  рабочая vs ${n.padEnd(4)} без ${fmt(ci((x) => cidx(tN, c, x), workIx, wSets))}   разница ${fmt(ci(diff(tP, tN, c), workIx, wSets), 2)}`);
{
  const d = ci(diff(tP, tN, ALL), workIx, wPSets);
  log(`  рабочая vs ALL, по персонажам   разница ${fmt(d, 2)}  P(>0)=${pp(d.pPos)}`);
}
if (HOLDOUT) log(`  все 60 vs ALL  без ${fmt(ci((x) => cidx(tN, ALL, x), fAll, fSets))}   разница ${fmt(ci(diff(tP, tN, ALL), fAll, fSets), 2)}`);
log(`  старые «пара»     без ${fmt(ci((x) => cidx(oN.map((y) => y[0]), oE, x), oAll, oSets))}   разница ${fmt(ci(diff(oP.map((y) => y[0]), oN.map((y) => y[0]), oE), oAll, oSets), 2)}`);
log(`  старые «друзья»   без ${fmt(ci((x) => cidx(oN.map((y) => y[1]), oF, x), oAll, oSets))}   разница ${fmt(ci(diff(oP.map((y) => y[1]), oN.map((y) => y[1]), oF), oAll, oSets), 2)}`);

log(`\n4. Прежняя версия (банк v13, шкала 0–10, формула ${OLD_REV}) и суммарная разница v${BANK_VERSION} − v13, парный бутстрэп`);
log(`  Разница складывает ВСЕ правки разом: новые/переписанные вопросы, шкала из 5 вариантов, таблица MATCH, важность ×3`);
log('  и заново сгенерированные ответы персонажей. Шум повторной генерации ответов в интервал не входит.');
log('  (P(>0) — доля бутстрэп-повторов с разницей > 0; это не поправленное p-значение)');
for (const [n, c] of [['E', E], ['T', T], ['S', S], ['ALL', ALL]] as const) {
  const d = ci(diff(tP, t13, c), workIx, wSets);
  log(`  рабочая vs ${n.padEnd(4)} v13 ${fmt(ci((x) => cidx(t13, c, x), workIx, wSets))}   разница ${fmt(d, 2)}  P(>0)=${pp(d.pPos)}`);
}
{
  const d = ci(diff(tP, t13, ALL), workIx, wPSets);
  log(`  рабочая vs ALL, по персонажам   разница ${fmt(d, 2)}  P(>0)=${pp(d.pPos)}`);
}
if (HOLDOUT) {
  const d = ci(diff(tP, t13, ALL), fAll, fSets), dp = ci(diff(tP, t13, ALL), fAll, personaSets(fk, fAll, BOOT_SEED + 4));
  log(`  все 60 vs ALL, по парам          разница ${fmt(d, 2)}  P(>0)=${pp(d.pPos)}`);
  log(`  все 60 vs ALL, по персонажам     разница ${fmt(dp, 2)}  P(>0)=${pp(dp.pPos)}`);
  const dh = ci(diff(tP, t13, ALL), holdIx, hSets);
  log(`  проверочная vs ALL               разница ${fmt(dh, 2)}  P(>0)=${pp(dh.pPos)}`);
}
for (const [n, k, c] of [['«пара»', 0, oE], ['«друзья»', 1, oF]] as const) {
  const d = ci(diff(oP.map((y) => y[k]), o13.map((y) => y[k]), c), oAll, oSets);
  log(`  старые ${n.padEnd(9)} v13 ${fmt(ci((x) => cidx(o13.map((y) => y[k]), c, x), oAll, oSets))}   разница ${fmt(d, 2)}  P(>0)=${pp(d.pPos)}`);
}

log('\n5. Чувствительность: бутстрэп по персонажам (один персонаж — в нескольких парах, интервалы по парам занижены)');
{
  const poSets = personaSets(ok, oAll, BOOT_SEED + 5);
  log(`  рабочая vs ALL                 ${fmt(ci((x) => cidx(tP, ALL, x), workIx, wPSets))}`);
  log(`  рабочая: judge-a vs judge-b    ${fmt(ci((x) => cidx(fA, fB, x), workIx, wPSets))}`);
  log(`  старые vs «пара»               ${fmt(ci((x) => cidx(oP.map((y) => y[0]), oE, x), oAll, poSets))}`);
}

if (HOLDOUT) {
  const h = ci((x) => cidx(tP, ALL, x), holdIx, hSets);
  fs.appendFileSync(HOLDOUT_LOG, `${new Date().toISOString()}\tHEAD ${head}${dirty}\tбанк v${BANK_VERSION}/${bankRev}\tпроверочная vs ALL ${fmt(h)}\t${holdoutReason}\n`);
}
