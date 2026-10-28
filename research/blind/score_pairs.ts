// Балл теста для слепой выборки (design.md, 7, 16.10, 17; отчёт — reviews/06-metric.md).
// Тем же кодом, что в приложении: compare() из src/scoring/compare.ts, веса сфер relationshipWeight, текущий банк (v16).
// Профиль человека — ответы D (research/blind/answers/<id>.json): вариант 1..5 → OPTION_VALUES, отметка «не обсуждается»
// только у вопросов с firm, 5 важных сфер — priorities (×3, PRIORITY_FACTOR). private/ и sealed/ не читаются.
// Считается для всех мужчин × всех женщин (пары и части скрипт не знает; отбор рабочей части — metric_eval.py).
// Выход: research/blind/metric/scores.json — сырой процент «совместимости в отношениях» (relationship.percent, до
// calibrate(): калибровка монотонна, на ранги не влияет, кроме обрезки краёв) с важными сферами и без них, процент по
// каждой сфере и процент без каждой сферы (вклад сфер, 06-metric.md).
// Запуск из корня проекта:  npx vite-node research/blind/score_pairs.ts
// Вторая партия (design.md 18.6, отчёт 07):  npx vite-node research/blind/score_pairs.ts -- --batch 2
//   читает b2-people.json, пишет metric/b2-scores.json (все 25 × 25 пар второй партии; пары партий не пересекаются).
// Версия теста — банк v16 и src/scoring/ коммита 035f4c0 (18.6); на другом банке скрипт падает (ответы D — на v16).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { QUESTIONS, BANK_VERSION } from '../../src/questions';
import { compare } from '../../src/scoring/compare';
import { calibrate, RELATIONSHIP_TABLE } from '../../src/scoring/calibration';
import { relationshipWeight } from '../../src/questions/spheres';
import { answerFor, OPTION_VALUES } from '../../src/answer';
import type { Priority, Profile } from '../../src/types';

const ROOT = 'research/blind';
// строгий разбор аргументов (критик 07, п. 8): незнакомый аргумент — ошибка, а не тихая перезапись scores.json
const ARGS = process.argv.slice(2).filter((a) => a !== '--');
if (!(ARGS.length === 0 || (ARGS.length === 2 && ARGS[0] === '--batch' && ARGS[1] === '2')))
  throw new Error(`аргументы: ничего (первая партия) или «--batch 2»; получено: ${ARGS.join(' ')}`);
const BATCH2 = ARGS.length === 2;
const PEOPLE_FILE = BATCH2 ? 'b2-people.json' : 'people.json';
const OUT_FILE = BATCH2 ? 'b2-scores.json' : 'scores.json';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const people = (read(`${ROOT}/${PEOPLE_FILE}`).people as any[]).map((p) => ({ id: p.id as string, sex: p.sex as string }));

function profile(id: string, withPrio: boolean): Profile {
  const rec = read(`${ROOT}/answers/${id}.json`);
  if (String(rec.bank_version) !== String(BANK_VERSION)) throw new Error(`${id}: банк ${rec.bank_version}, а не ${BANK_VERSION}`);
  const responses: Profile['responses'] = {};
  for (const q of QUESTIONS) {
    const r = rec.responses[q.id];
    if (!r) { if (q.optional) { responses[q.id] = 'skipped'; continue; } throw new Error(`${id}: нет ответа на ${q.id}`); }
    const a = answerFor(OPTION_VALUES[r.option - 1]);
    responses[q.id] = q.firm && r.firm === true ? { ...a, firm: true } : a;
  }
  const pr = rec.priorities as string[];
  if (pr.length !== 5) throw new Error(`${id}: важных сфер ${pr.length}`);
  const priorities = Object.fromEntries(pr.map((s) => [s, 'top' as Priority]));
  return { name: id, bankVersion: BANK_VERSION, responses, ...(withPrio ? { priorities } : {}) };
}

const scored = QUESTIONS.filter((q) => q.block !== 'maturity' && q.scored !== false);
const spheres = [...new Set(scored.map((q) => q.sphere))].sort();
const men = people.filter((p) => p.sex === 'm' || p.sex === 'M' || p.sex === 'male' || p.sex === 'м').map((p) => p.id);
const women = people.filter((p) => !men.includes(p.id)).map((p) => p.id);
if (men.length + women.length !== people.length || men.length === 0) throw new Error('пол не распознан');

const P = new Map(people.map((p) => [p.id, profile(p.id, true)]));
const P0 = new Map(people.map((p) => [p.id, profile(p.id, false)]));
const rel = (a: Profile, b: Profile, w = relationshipWeight) => compare(QUESTIONS, a, b, w).relationship;

const out: Record<string, unknown>[] = [];
for (const m of men) for (const w of women) {
  const r = rel(P.get(m)!, P.get(w)!);
  const r0 = rel(P0.get(m)!, P0.get(w)!);
  const bySphere = Object.fromEntries(r.spheres.map((s) => [s.sphere, s.percent]));
  const drop: Record<string, number | null> = {};
  const drop0: Record<string, number | null> = {};
  for (const s of spheres) {
    const k = (x: string) => (x === s ? 0 : relationshipWeight(x));
    drop[s] = rel(P.get(m)!, P.get(w)!, k).percent;
    drop0[s] = rel(P0.get(m)!, P0.get(w)!, k).percent;
  }
  const r4 = (x: number | null) => (x === null ? null : Math.round(x * 1e4) / 1e4);
  for (const d of [drop, drop0]) for (const s of spheres) d[s] = r4(d[s]);
  for (const s of Object.keys(bySphere)) bySphere[s] = r4(bySphere[s]);
  out.push({
    man: m, woman: w,
    score: r4(r.percent), score_calibrated: r4(calibrate(r.percent, RELATIONSHIP_TABLE)),
    score_no_prio: r4(r0.percent),
    sphere: bySphere, drop_sphere: drop, drop_sphere_no_prio: drop0,
  });
}

const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// хеш всего дерева src/ (критик 07, п. 2): в балл входят и calibration.ts, answer.ts, types.ts; пишется только во второй
// партии, чтобы файл первой партии (отчёт 06) оставался воспроизводимым побайтно
function treeSha(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = `${d}/${e.name}`;
      if (e.isDirectory()) walk(f); else h.update(`${f} ${sha(f)}\n`);
    }
  };
  walk(dir);
  return h.digest('hex');
}
const answersHash = createHash('sha256');
for (const p of [...people].sort((a, b) => a.id.localeCompare(b.id))) answersHash.update(`${p.id} ${sha(`${ROOT}/answers/${p.id}.json`)}\n`);
fs.mkdirSync(`${ROOT}/metric`, { recursive: true });
fs.writeFileSync(`${ROOT}/metric/${OUT_FILE}`, JSON.stringify({
  meta: {
    generator: 'research/blind/score_pairs.ts', ...(BATCH2 ? { batch: 2, people_file: PEOPLE_FILE, src_tree_sha256: treeSha('src') } : {}), bank_version: BANK_VERSION, bank_sha256: sha('src/questions/bank.json'),
    compare_sha256: sha('src/scoring/compare.ts'), spheres_sha256: sha('src/questions/spheres.ts'),
    answers_sha256: answersHash.digest('hex'), scored_questions: scored.length, spheres,
    note: 'score — relationship.percent (сырой, до calibrate()), с 5 важными сферами ×3; score_no_prio — все сферы ×1 (16.10). '
      + 'drop_sphere — тот же процент без сферы (вес 0). Числа округлены до 1e-4. Блок «зрелость» (в том числе trauma-06) в процент не входит.',
  },
  pairs: out,
}, null, 0) + '\n');
console.log(`мужчин ${men.length}, женщин ${women.length}, пар ${out.length}, вопросов в проценте ${scored.length}, сфер ${spheres.length}`);
