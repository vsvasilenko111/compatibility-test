import type { Profile, Question } from '../types';

/**
 * «Ресурсы пары» — уровень, а не сходство: как вы вдвоём спорите, отходите, миритесь и опираетесь друг на друга.
 * Считается по вопросам об эмоциях (блок maturity, без вопросов о прошлом) и одному вопросу о ссорах. На проценты не влияет.
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
    key: 'argue', title: 'Спорить, не обжигая', ids: ['regul-01', 'regul-07', 'conflicts-02'],
    texts: {
      strong: 'В споре вы оба обычно держите себя в руках — разногласия не превращаются в пожар.',
      ok: 'Обычно вы спорите спокойно, но иногда накал берёт верх. Полезно заранее договориться о слове-паузе.',
      grow: 'В споре вам легко разгореться. Помогают простые правила: сначала выслушать, потом отвечать; если стало горячо — пауза с договорённостью вернуться.',
    },
  },
  {
    // Оба вопроса — о мягких поводах (спор о счёте, опоздание на 10 минут): отпускает почти всех, поэтому пороги выше.
    key: 'cool', title: 'Отпускать после ссоры', ids: ['regul-02', 'regul-06'], levels: [0.85, 0.65],
    texts: {
      strong: 'Вы быстро отходите после неприятного, и мелочи не портят вам вечер.',
      ok: 'Обычно вы отходите довольно быстро, но иногда неприятное держит дольше. Спросите друг друга, что помогает отпустить.',
      grow: 'Неприятное может держать вас долго, а мелочи — портить настроение. Обсудите, что каждому помогает отойти, и не копите невысказанное.',
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
    key: 'support', title: 'Опираться друг на друга', ids: ['attach-01', 'attach-03', 'reflect-03'],
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
function personLevel(p: Profile, ids: string[]): number | null {
  const xs = ids.flatMap((id) => {
    const r = p.responses[id];
    return r && r !== 'skipped' ? [r.value] : [];
  });
  return xs.length ? 1 - xs.reduce((s, x) => s + x, 0) / xs.length / 10 : null;
}

/** null — если хотя бы один не отвечал на эти вопросы (ссылка от версии теста без блока об эмоциях). */
export function resources(questions: Question[], pa: Profile, pb: Profile): Resource[] | null {
  const known = new Set(questions.map((q) => q.id));
  const maturityIds = questions.filter((q) => q.block === 'maturity').map((q) => q.id);
  if (personLevel(pa, maturityIds) === null || personLevel(pb, maturityIds) === null) return null;
  const out: Resource[] = [];
  for (const d of DIMENSIONS) {
    const ids = d.ids.filter((id) => known.has(id));
    const a = personLevel(pa, ids), b = personLevel(pb, ids);
    if (a === null || b === null) continue;
    const pair = (a + b) / 2;
    const [strong, ok] = d.levels ?? [STRONG, OK];
    const level: ResourceLevel = pair >= strong - 1e-9 ? 'strong' : pair >= ok - 1e-9 ? 'ok' : 'grow';
    out.push({ key: d.key, title: d.title, level, text: d.texts[level] });
  }
  return out.length ? out : null;
}
