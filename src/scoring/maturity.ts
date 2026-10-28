import type { Profile, Question } from '../types';

/**
 * Блок «Эмоциональная зрелость» (docs/maturity-draft.md). На проценты совместимости не влияет: на синтетике
 * добавка к проценту согласие с экспертами не подняла. Даёт только опоры пары и бережные темы для разговора —
 * без ярлыков, без чьих-либо баллов и без указания, к кому из двоих относится тема.
 */
export interface MaturityTopic { key: string; title: string; text: string }
export interface MaturityResult {
  /** Где у обоих устойчиво — темы вопросов. */
  strengths: string[];
  /** Опасные сочетания и большие различия — с текстом для разговора, самое важное первым. */
  talks: MaturityTopic[];
  /** Где хотя бы одному непросто, но опасного сочетания нет — только темы. */
  softTopics: string[];
}

type Values = Record<string, number>;

/** Чем ниже ответ, тем устойчивее. Вопросы о прошлом сюда не входят: высокий балл там сам по себе не риск. */
const LEVEL = ['attach-01', 'attach-03', 'regul-08', 'reflect-01', 'reflect-02', 'reflect-03'];
const PAST = ['trauma-01', 'trauma-02', 'trauma-03', 'trauma-05', 'trauma-06'];
/** Вопросы других блоков, нужные для сочетаний: как отвечаете, когда задели (conflicts-02), сколько вечеров нужно для себя (space-06). */
const EXTRA = ['conflicts-02', 'space-06'];
/** Проработанность прошлого опыта: умение объяснить, что задело, готовность делиться тем, что ранит, реакция, когда задели больное. */
const WORKED_THROUGH = ['trauma-02', 'trauma-03', 'trauma-05'];
const HIGH = 7;
const STRONG = 3;
const SOFT = 8;
const MAX_STRENGTHS = 4;
const MAX_SOFT = 3;

const TEXTS: Record<string, Omit<MaturityTopic, 'key'>> = {
  closeness: {
    title: 'Близость и пространство',
    text: 'Когда между вами появляется дистанция, одному из вас, скорее всего, важно поскорее восстановить контакт, а другому — сначала немного побыть с собой. Обе потребности нормальные. Договоритесь, как один может попросить близости, а другой — паузы, чтобы никто не почувствовал себя брошенным или зажатым.',
  },
  silence: {
    title: 'Внезапная тишина',
    text: 'Похоже, для одного из вас внезапная тишина может отзываться сильнее, чем выглядит со стороны, а другому иногда нужно побыть в тишине. Договоритесь о простом сигнале — «я на связи, просто занят» или «мне нужен вечер для себя» — это бережёт обоих.',
  },
  escalation: {
    title: 'Когда задели больное',
    text: 'Похоже, у одного из вас есть темы, которые отзываются сильнее, чем видно со стороны, а другой в моменте отвечает сразу, как чувствует. Так разговор легко разгоняется. Договоритесь о слове-паузе: если задело больное, можно остановиться и вернуться к разговору, когда оба остынут.',
  },
  stress: {
    title: 'Тяжёлые периоды',
    text: 'В стрессе вы переживаете по-разному: одному помогает разговор, другому — тишина. Обсудите, какая поддержка нужна каждому, когда трудно, и как понять, что сейчас лучше: спросить или просто быть рядом.',
  },
  help: {
    title: 'Помощь со стороны',
    text: 'У вас разное отношение к тому, чтобы звать на помощь специалиста. Удобнее договориться об этом заранее, в спокойный момент: в какой ситуации вы оба были бы готовы попробовать и какой формат подошёл бы каждому.',
  },
  feelings: {
    title: 'Слова для чувств',
    text: 'Одному из вас легко сказать «мне обидно», другому привычнее показать делом или промолчать. Это разные языки, а не равнодушие. Обсудите, по каким знакам каждый понимает, что другому плохо, и как удобнее об этом сообщать.',
  },
  dosage: {
    title: 'Мера близости',
    text: 'Вам нужна разная мера близости: одному хочется быть рядом и делиться всем, другому иногда нужно больше пространства. Договоритесь, как один может позвать побыть вместе, а другой — попросить время для себя, чтобы ни то ни другое не звучало как упрёк.',
  },
};

/** Вопросы, тема которых уже раскрыта в тексте «стоит обсудить». */
const COVERS: Record<string, string[]> = { closeness: ['attach-01', 'attach-03'], feelings: ['reflect-03'] };

/** Ответы человека на вопросы блока; пропуски не попадают. */
function values(p: Profile, ids: string[]): Values {
  const out: Values = {};
  for (const id of ids) {
    const r = p.responses[id];
    if (r && r !== 'skipped') out[id] = r.value;
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const high = (v: Values, id: string, t = HIGH) => id in v && v[id] >= t;
const avoidance = (v: Values) => {
  return 'attach-03' in v ? v['attach-03'] : 0;
};
/** Вопросы о прошлом учитываются, только если человек ответил хотя бы на половину из них. */
const pastUsable = (v: Values) => PAST.filter((id) => id in v).length >= PAST.length / 2;

/** Опасные сочетания: у одного — x, у другого — y; проверяются в обе стороны. */
function riskyPairs(x: Values, y: Values, xPast: boolean): string[] {
  const out: string[] = [];
  if (high(x, 'attach-01') && avoidance(y) >= HIGH) out.push('closeness');
  if (xPast && high(x, 'trauma-06') && (high(y, 'attach-03') || high(y, 'space-06'))) out.push('silence');
  if (xPast && high(x, 'trauma-05') && high(y, 'conflicts-02', SOFT)) out.push('escalation');
  return out;
}

const apart = (a: Values, b: Values, id: string) => id in a && id in b && Math.abs(a[id] - b[id]) >= 6;
const polar = (a: Values, b: Values, id: string, lo: number, hi: number) =>
  id in a && id in b && ((a[id] <= lo && b[id] >= hi) || (b[id] <= lo && a[id] >= hi));

/** null — если хотя бы один не отвечал на блок (ссылка от прошлой версии теста). */
export function maturity(questions: Question[], pa: Profile, pb: Profile): MaturityResult | null {
  const qs = questions.filter((q) => q.block === 'maturity');
  const ids = qs.map((q) => q.id);
  const a = values(pa, [...ids, ...EXTRA]), b = values(pb, [...ids, ...EXTRA]);
  const core = ids.filter((id) => !PAST.includes(id));
  if (!core.some((id) => id in a) || !core.some((id) => id in b)) return null;
  const topic = new Map(qs.map((q) => [q.id, q.topic]));
  const aPast = pastUsable(a), bPast = pastUsable(b);

  const keys = new Set([...riskyPairs(a, b, aPast), ...riskyPairs(b, a, bPast)]);
  if (apart(a, b, 'attach-03')) keys.add('stress');
  if (apart(a, b, 'reflect-04')) keys.add('help');
  if (polar(a, b, 'reflect-03', 2, 8)) keys.add('feelings');
  if (!keys.has('closeness') && polar(a, b, 'space-06', 3, 8)) keys.add('dosage');
  // Порядок TEXTS — порядок важности.
  const talks = Object.keys(TEXTS).filter((k) => keys.has(k)).map((key) => ({ key, ...TEXTS[key] }));

  // Темы, уже раскрытые в «стоит обсудить», не повторяем.
  const covered = new Set(talks.flatMap((t) => COVERS[t.key] ?? []));
  const both = LEVEL.filter((id) => id in a && id in b);
  const strengths = both.filter((id) => a[id] <= STRONG && b[id] <= STRONG).map((id) => topic.get(id)!);
  const worked = (v: Values) => {
    const xs = WORKED_THROUGH.filter((id) => id in v).map((id) => v[id]);
    return xs.length > 0 && mean(xs) <= 4;
  };
  const pastTalk = talks.some((t) => t.key === 'silence' || t.key === 'escalation');
  if (aPast && bPast && !pastTalk && worked(a) && worked(b)) strengths.push('разговор о том, что ранит');
  const softTopics = both
    .filter((id) => !covered.has(id) && Math.max(a[id], b[id]) >= SOFT)
    .map((id) => topic.get(id)!);

  return { strengths: strengths.slice(0, MAX_STRENGTHS), talks, softTopics: softTopics.slice(0, MAX_SOFT) };
}
