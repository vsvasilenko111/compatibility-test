import type { Profile, Question } from '../types';
import { optionIndex } from '../answer';

/**
 * «Ресурсы пары» — уровень, а не сходство: как вы вдвоём спорите, отходите, миритесь и опираетесь друг на друга.
 * Считается по вопросам об эмоциях (блок maturity, без вопросов о прошлом) и двум вопросам о ссорах. На проценты не влияет.
 * Уровень — среднее двоих: чьё это слабое место, не показывается никогда.
 * На свежих синтетических парах средний уровень согласуется с оценкой терапевта на 70%, с экспертами по биографиям — на 67%
 * (research/review/README.md, раздел «Ресурсы пары»).
 */
export type ResourceLevel = 'strong' | 'ok' | 'grow';
export interface Resource { key: string; title: string; level: ResourceLevel; text: string }

interface Dimension {
  key: string; title: string; ids: string[]; texts: Record<ResourceLevel, string>;
  /** Свои пороги [получается, в целом] — если общие STRONG/OK не дают примерно по четверти пар (банк v14). */
  levels?: [number, number];
}

/** Во всех вопросах 0 — устойчивее, 10 — труднее. */
const DIMENSIONS: Dimension[] = [
  {
    key: 'argue', title: 'Спорить, не обжигая', ids: ['conflicts-02'],
    texts: {
      strong: 'В споре вы оба обычно держите себя в руках — разногласия не превращаются в пожар.',
      ok: 'Обычно вы спорите спокойно, но иногда накал берёт верх. Полезно заранее договориться о слове-паузе.',
      grow: 'В споре вам легко разгореться. Помогают простые правила: сначала выслушать, потом отвечать; если стало горячо — пауза с договорённостью вернуться.',
    },
  },
  {
    // С v16 — один вопрос о ссоре с извинением (conflicts-03); пороги общие, их стоит перепроверить на синтетике.
    key: 'cool', title: 'Отпускать после ссоры', ids: ['conflicts-03'],
    texts: {
      strong: 'Обида после ссоры и извинений у вас обычно проходит быстро — в тот же день.',
      ok: 'Обычно обида после извинений проходит за день-два, но иногда держится дольше. Спросите друг друга, что помогает её отпустить.',
      grow: 'Обида может держаться долго даже после искренних извинений. Обсудите, что каждому нужно, чтобы её отпустить, — и не копите невысказанное.',
    },
  },
  {
    key: 'repair', title: 'Мириться', ids: ['regul-08', 'reflect-01', 'reflect-02'], levels: [0.8, 0.6],
    texts: {
      strong: 'Вы умеете признать свою часть, не принимать резкость на свой счёт и сделать шаг навстречу.',
      ok: 'Мириться получается, хотя признать свою часть или не принять резкость на свой счёт иногда непросто.',
      grow: 'Признать свою часть и сделать первый шаг вам пока непросто. Попробуйте после ссоры по очереди сказать, что каждый сделал бы иначе, — без «но».',
    },
  },
  {
    // С v17 attach-01 — о тревоге, а не о просьбе о поддержке, поэтому в «опираться» не входит.
    key: 'support', title: 'Опираться друг на друга', ids: ['attach-03', 'reflect-03'],
    texts: {
      strong: 'Вам легко просить о поддержке и говорить о чувствах — это сильная опора.',
      ok: 'Опираться друг на друга в целом получается, но о чувствах и о просьбе помочь иногда проще промолчать.',
      grow: 'Просить о поддержке и говорить о чувствах вам пока непросто. Договоритесь о простом сигнале «мне сейчас тяжело» — и о том, какой помощи каждый ждёт.',
    },
  },
];

/**
 * Пороги по уровню пары 0..1 — примерно верхняя и нижняя четверть случайных синтетических пар
 * (банк v14: research/review/scale-eval.txt; у «отпускать» и «мириться» — свои, см. levels).
 */
const STRONG = 0.7;
const OK = 0.5;

/** Уровень человека 0..1 по вопросам измерения; null — не ответил ни на один. */
function personLevel(p: Profile, ids: string[], questions: Map<string, Question>): number | null {
  const xs = ids.flatMap((id) => {
    const r = p.responses[id];
    if (!r || r === 'skipped') return [];
    const levels = questions.get(id)?.behaviorLevels;
    return [levels ? levels[optionIndex(r.value)] : 1 - r.value / 10];
  });
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** null — если хотя бы один не отвечал на эти вопросы (ссылка от версии теста без блока об эмоциях). */
export function resources(questions: Question[], pa: Profile, pb: Profile): Resource[] | null {
  const known = new Set(questions.map((q) => q.id));
  const byId = new Map(questions.map(q => [q.id, q]));
  const maturityIds = questions.filter((q) => q.block === 'maturity').map((q) => q.id);
  if (personLevel(pa, maturityIds, byId) === null || personLevel(pb, maturityIds, byId) === null) return null;
  const out: Resource[] = [];
  for (const original of DIMENSIONS) {
    let d = original;
    if (d.key === 'argue' && known.has('conflict-response-01')) d = { ...d, ids: ['conflict-response-01'] };
    if (d.key === 'cool' && known.has('conflict-repair-01')) d = {
      ...d, ids: ['conflict-repair-01'], title: 'Возвращаться к разговору',
      texts: {
        strong: 'Даже если обида ещё остаётся, вы можете обсудить произошедшее или договориться о паузе и вернуться к разговору.',
        ok: 'Вернуться к общению получается, хотя иногда трудно сделать первый шаг. Помогает договорённость, когда вы продолжите разговор.',
        grow: 'После ссоры общение может надолго прерываться. Обсудите, как просить о времени на паузу и возвращаться к разговору без упрёков и наказания молчанием.',
      },
    };
    if (d.key === 'repair' && known.has('conflict-response-01')) d = {
      ...d, ids: ['regul-08', 'reflect-01'],
      texts: {
        strong: 'Вы умеете признавать свою часть проблемы и извиняться за резкость.',
        ok: 'Признавать свою часть и извиняться получается, хотя иногда это непросто.',
        grow: 'Признать свою часть и извиниться бывает трудно. Попробуйте по очереди сказать, что каждый сделал бы иначе, без встречных обвинений.',
      },
    };
    const ids = d.ids.filter((id) => known.has(id));
    const a = personLevel(pa, ids, byId), b = personLevel(pb, ids, byId);
    if (a === null || b === null) continue;
    const pair = (a + b) / 2;
    const [strong, ok] = d.levels ?? [STRONG, OK];
    const level: ResourceLevel = pair >= strong - 1e-9 ? 'strong' : pair >= ok - 1e-9 ? 'ok' : 'grow';
    out.push({ key: d.key, title: d.title, level, text: d.texts[level] });
  }
  return out.length ? out : null;
}
