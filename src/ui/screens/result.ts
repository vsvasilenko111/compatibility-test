import type { CompareResult } from '../../scoring/compare';
import type { MaturityResult } from '../../scoring/maturity';
import type { Resource } from '../../scoring/resources';
import { semanticRelationship, type SemanticRelationshipResult } from '../../scoring/semantic-relationship';
import { PRIORITY_SPHERES } from '../../questions/spheres';
import type { Priority, Question } from '../../types';
import { bothAnswered, divergences, type AnswerRow } from '../answers-view';
import type { Profile } from '../../types';
import { h } from '../dom';
import { personSummarySection } from '../person-summary-view';
import { flagsLine, sphereTiles, supportTopics } from '../result-view';
import { sphereExplorer } from '../sphere-explorer';
import { answerComparison } from '../answer-comparison';
import { plural } from '../plural';
import { shareBlock } from '../share';
import { level, verdict } from '../verdict';

const num = (p: number | null) => (p === null ? '—' : String(Math.round(p)));

function score(p: number | null, caption: string, cls: string, label = level(p)): HTMLElement {
  return h('div', { class: `score ${cls}${p === null ? ' no-score' : ''}`, ...(p === null ? {} : { style: `--score:${Math.max(0, Math.min(100, p))}%` }) },
    h('div', { class: 'score-visual' },
      h('div', { class: 'num' }, num(p), p === null ? null : h('span', { class: 'unit' }, '%'))),
    h('div', { class: 'cap' }, caption),
    label ? h('div', { class: 'lvl' }, label) : null);
}

/** Display-only rounding: an incomplete or merely near-perfect result cannot claim 100. */
function semanticDisplay(s: SemanticRelationshipResult): number | null {
  return s.percent === null ? null : s.percent === 100 && !s.provisional ? 100 : Math.min(99, Math.round(s.percent));
}

function semanticLabel(p: number | null): string {
  if (p === null) return 'Недостаточно данных для индекса отношений';
  if (p === 100) return 'Ваша судьба';
  if (p >= 80) return 'Отлично подходите по ответам';
  if (p >= 70) return 'Хорошая база';
  if (p >= 50) return 'Не особо друг другу подходите по ответам';
  return 'Слабая база для длительных отношений';
}

const outOf100 = (p: number | null) => `${p === null ? '—' : p.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} / 100`;

function semanticDetails(s: SemanticRelationshipResult): HTMLElement {
  return h('div', { class: 'semantic-details', 'data-scoring-version': s.version },
    h('p', {}, 'Баллы показывают соответствие ваших ответов для длительных отношений.'),
    h('ul', {},
      h('li', {}, `Предпочтения и планы: ${outOf100(s.components.plans)}`),
      h('li', {}, `Действия в трудных ситуациях: ${outOf100(s.components.actions)}`),
      h('li', {}, `Настрой на длительные отношения: ${outOf100(s.components.orientation)}`),
      h('li', {}, `Сочетание реакций: ${outOf100(s.components.reactions)}`)),
    h('p', {}, 'Совпадение повседневных ответов и совместимость в длительных отношениях могут различаться. В общем результате отдельно учитывается, совпадают ли ваши планы и как сочетаются реакции в трудных ситуациях.'),
    h('p', {}, 'Карта сфер и «партнёр как друг» показывают совпадение отдельных ответов. Общий результат отношений рассчитан иначе, поэтому эти числа могут отличаться.'),
    h('p', {}, '100 — максимальное соответствие ответов при известных данных. «Ваша судьба» — игровое название этого результата, не гарантия счастливых отношений. Прочие близкие к максимуму и предварительные результаты отображаются не выше 99.'),
    h('details', { class: 'explain semantic-calculation' },
      h('summary', {}, 'Подробности расчёта'),
      h('p', {}, `Исходный индекс v28: ${outOf100(s.rawPercent)}`),
      h('p', {}, 'Основа — среднее геометрическое предпочтений и действий. Настрой на длительные отношения и сочетание реакций применяются как отдельные множители. Известное расхождение по категории планов ограничивает результат 50; несколько таких расхождений не снижают границу повторно.'),
      h('p', {}, 'Карта сфер и «партнёр как друг» сохраняют исходный расчёт v28. Их числа показывают совпадение ответов на исходной шкале; уровни нового индекса к ним не применяются.')));
}

function planCaps(s: SemanticRelationshipResult | null, questions: Question[] | undefined): HTMLElement | null {
  if (!s?.caps.length) return null;
  return h('section', { class: 'plan-conflict-caps' },
    sectionHeading('О чём договориться', 'Расхождения в текущих планах'),
    h('p', { class: 'hint' }, 'В этих вопросах вы выбрали разные планы. Пока расхождение сохраняется, результат ограничен 50 баллами. Это не означает, что вы не сможете договориться: обсудите, что важно каждому и есть ли приемлемый для обоих вариант.'),
    ...s.caps.map(cap => {
      const q = questions?.find(q => q.id === cap.id);
      const choice = (n: number) => `${n}. ${q?.options?.[n - 1] ?? `Вариант ${n}`}`;
      return h('div', { class: 'note talk' },
        h('div', { class: 'note-label' }, cap.topic),
        h('p', {}, cap.reason === 'formats' ? 'Среди указанных вариантов нет подходящего вам обоим.' : 'Ваши ответы предполагают разные решения.'),
        h('p', {}, `Ответы: «${choice(cap.optionA)}» и «${choice(cap.optionB)}».`));
    }));
}

function note(kind: string, label: string, topics: string[]): HTMLElement | null {
  if (!topics.length) return null;
  const chips = (items: string[]) => h('div', { class: 'topic-chips' }, ...items.map(topic => h('span', { class: 'topic-chip' }, topic)));
  return h('div', { class: `note ${kind}` },
    h('div', { class: 'note-heading' },
      h('span', { class: 'note-symbol', 'aria-hidden': 'true' }, kind === 'support' ? '✳' : kind === 'red' ? '!' : '↗'),
      h('div', { class: 'note-label' }, label), h('span', { class: 'note-count' }, String(topics.length))),
    chips(topics.slice(0, 5)),
    topics.length > 5 ? h('details', { class: 'more-topics' },
      h('summary', {}, `Ещё ${plural(topics.length - 5, ['тема', 'темы', 'тем'])}`), chips(topics.slice(5))) : null);
}

function sectionHeading(kicker: string, title: string): HTMLElement {
  return h('div', { class: 'section-heading' },
    h('p', { class: 'eyebrow' }, kicker), h('h2', {}, title));
}

const LEVEL_LABEL: Record<Resource['level'], string> = { strong: 'получается', ok: 'в целом получается', grow: 'зона роста' };

/**
 * Ресурсы пары: уровень навыков обоих (как спорите, отходите, миритесь, опираетесь друг на друга) и опасные сочетания.
 * «Можно обсудить» из блока зрелости не показываем — его вопросы уже вошли в уровни. Чьи это ответы — не показываем никогда.
 */
function resourcesSection(rs: Resource[] | null, m: MaturityResult | null): HTMLElement | null {
  const talks = m?.talks ?? [];
  if (!rs && !talks.length) return null;
  return h('section', { class: 'resources' },
    sectionHeading('Забота о вашем «мы»', 'Ресурсы пары'),
    h('p', { class: 'hint' }, 'Как вы вдвоём справляетесь с трудным. Действия в конфликте и сочетание тревоги с дистанцией учитываются и в общем индексе; здесь ваши реакции объяснены подробнее, без указания, чьи это ответы.'),
    rs ? h('ul', { class: 'res-list' }, ...rs.map((r) =>
      h('li', { class: `res lvl-${r.level}` },
        h('div', { class: 'res-head' }, h('b', {}, r.title), h('span', { class: 'res-lvl' }, LEVEL_LABEL[r.level])),
        h('p', {}, r.text)))) : null,
    h('div', { class: 'notes' },
      ...talks.map((t) => h('div', { class: 'note talk' }, h('div', { class: 'note-label' }, t.title), h('p', {}, t.text)))),
    h('p', { class: 'hint' }, 'Это подсказки для разговора, а не диагноз. Если какая-то тема отзывается сильно, с этим можно прийти к психологу — вдвоём или по отдельности.'));
}

function answerItem(r: AnswerRow, a: Profile, b: Profile, question?: Question): HTMLElement {
  if (question?.options) return h('li', { class: 'answer', 'data-question-id': question.id },
    h('details', { class: 'answer-details' },
      h('summary', {}, h('span', { class: 'answer-q' }, r.text)),
      answerComparison(question, a, b)));
  const na = a.name || 'Первый', nb = b.name || 'Второй';
  return h('li', { class: r.opposite && r.diff >= 6 ? 'answer far' : 'answer' },
    h('div', { class: 'answer-q' }, r.text),
    h('div', { class: 'answer-vals' },
      h('span', {}, `${na}: `, h('b', {}, r.labelA)),
      h('span', {}, `${nb}: `, h('b', {}, r.labelB))));
}

/** Ответы друг друга: расхождения по группам и все ответы. Пропущенные не показываются. */
function answersSection(a: Profile, b: Profile, questions: Question[] | undefined): HTMLElement | null {
  if (!questions) return null;
  const byId = new Map(questions.map(q => [q.id, q]));
  const groups = divergences(questions, a, b);
  const all = bothAnswered(questions, a, b);
  return h('section', { class: 'answers' },
    sectionHeading('Больше понимания', 'Ответы друг друга'),
    ...groups.map((g) => h('details', { class: 'answer-group explain' },
      h('summary', {}, h('h4', {}, `${g.title} — ${g.rows.length}`)),
      h('ul', {}, ...g.rows.map((r) => answerItem(r, a, b, byId.get(r.id)))))),
    groups.length ? null : h('p', {}, 'Заметных расхождений нет.'),
    h('details', { class: 'explain' },
      h('summary', {}, `Все ответы — ${all.length}`),
      h('ul', {}, ...all.map((r) => answerItem(r, a, b, byId.get(r.id))))));
}

/** Кто прошёл прежнюю версию теста и может ответить только на новые вопросы и (или) выбрать важные сферы. */
export interface FillOffer { name: string; count: number; priorities?: boolean; onFill(): void }

function fillLabel(f: FillOffer): string {
  const parts = [
    f.count ? `ответить на ${plural(f.count, ['новый вопрос', 'новых вопроса', 'новых вопросов'])}` : null,
    f.priorities ? 'выбрать важные для себя сферы' : null,
  ].filter(Boolean);
  return `${f.name}: ${parts.join(' и ')}`;
}

function fillBlock(fill: FillOffer[]): HTMLElement | null {
  if (!fill.length) return null;
  return h('div', { class: 'block fill' },
    h('h3', {}, 'В тесте появилось новое'),
    h('p', { class: 'hint' }, 'Прежние ответы сохранятся — нужно только дополнить, и результат пересчитается.'),
    ...fill.map((f) => h('button', { type: 'button', class: 'secondary', onclick: () => f.onFill() }, fillLabel(f))));
}

const sphereLabels = (pr: Record<string, Priority>, kind: Priority) =>
  PRIORITY_SPHERES.filter((s) => pr[s.id] === kind).map((s) => s.label);

/** Что важнее каждому: личный выбор сфер и общее в нём. Сам выбор — тоже тема для разговора. */
function prioritiesSection(a: Profile, b: Profile): HTMLElement | null {
  if (!a.priorities && !b.priorities) return null;
  const na = a.name || 'Первый', nb = b.name || 'Второй';
  const both = a.priorities && b.priorities
    ? PRIORITY_SPHERES.filter((s) => a.priorities![s.id] === 'top' && b.priorities![s.id] === 'top').map((s) => s.label)
    : [];
  const person = (name: string, pr: Record<string, Priority> | undefined) => pr
    ? h('div', { class: 'note soft' },
      h('div', { class: 'note-label' }, name),
      h('p', {}, sphereLabels(pr, 'top').join(' · ')))
    : h('div', { class: 'note soft' }, h('div', { class: 'note-label' }, name), h('p', {}, 'Пока не выбрано — проценты считаются по обычным весам.'));
  return h('section', { class: 'priorities-result' },
    sectionHeading('Личные ориентиры', 'Что важнее каждому'),
    h('p', { class: 'hint' }, 'Каждый выбрал 5 самых важных для себя сфер — совпадение в них весит для него втрое больше.'),
    h('div', { class: 'notes' },
      both.length ? note('support', 'Важно обоим', both) : null,
      person(na, a.priorities),
      person(nb, b.priorities)));
}

function foldout(label: string, content: HTMLElement | null): HTMLElement | null {
  return content ? h('details', { class: 'result-foldout' }, h('summary', {}, label), content) : null;
}

export function resultScreen(a: Profile, b: Profile, result: CompareResult, shareUrl: string, questions?: Question[], fill: FillOffer[] = [], personalUrls?: [string, string]): HTMLElement {
  const rel = result.relationship;
  const semantic = questions ? semanticRelationship(questions, a, b) : null;
  const mainPercent = semantic ? semanticDisplay(semantic) : rel.percent;
  const shown = {
    relationship: rel,
    friendship: result.friendship,
  };
  const flags = flagsLine(rel);
  const reds = rel.redFlags.map((i) => i.topic);

  return h('section', { class: 'screen result' },
    h('div', { class: 'result-intro' },
      h('p', { class: 'eyebrow' }, 'Ваш результат · только для двоих'),
      h('h1', {}, 'Ваше «мы» — в деталях.'),
      h('p', {}, 'Посмотрите, что вас объединяет и о чём хочется поговорить.')),
    h('div', { class: `poster${semantic ? ' semantic-poster' : ''}` },
      h('div', { class: 'poster-top' },
        h('p', { class: 'poster-names' }, h('span', {}, a.name || 'Первый'), h('span', { class: 'names-plus', 'aria-hidden': 'true' }, '+'), h('span', {}, b.name || 'Второй')),
        h('span', { class: 'poster-caption' }, 'У каждой пары свой ритм')),
      h('div', { class: 'poster-scores' },
        score(mainPercent, semantic ? 'совместимость в длительных отношениях' : 'совпадение ответов об отношениях', 'main', semantic ? semanticLabel(mainPercent) : level(mainPercent)),
        h('div', { class: 'poster-story' },
          h('p', { class: 'eyebrow' }, 'О вас двоих'),
          h('h2', { class: 'poster-verdict' }, semantic ? semanticLabel(mainPercent) : verdict(shown)),
          flags ? h('p', { class: 'poster-flags' }, flags) : null,
          score(shown.friendship.percent, 'партнёр как друг', 'second'))),
      h('p', { class: 'poster-footnote' }, 'Совпадение ответов — только часть вашей истории. Важнее то, как вы слышите друг друга.')),
    fillBlock(fill),
    semantic?.provisional ? h('p', { class: 'hint semantic-provisional' }, 'Это предварительный результат: для части вопросов пока нет определённого ответа. Пропуски и неопределённость не считаются плохими ответами — они не заменяются нулём и не подтверждают максимальное совпадение.') : null,
    sphereExplorer(sphereTiles(rel.spheres), questions, a, b),
    personSummarySection(questions, a, b, personalUrls),
    h('details', { class: 'explain' },
      h('summary', {}, 'Что значат проценты?'),
      semantic ? semanticDetails(semantic) : h('p', {}, 'Здесь показано совпадение ответов. Подробный разбор отношений для этого результата недоступен.'),
      h('p', {}, 'Партнёр как друг — каково вам друг с другом каждый день: юмор, досуг, увлечения, доверие, ссоры, ценности, быт, ревность, родные. Насколько вам легко вместе.'),
      h('p', {}, 'Совместимость в длительных отношениях — ваши взгляды на совместную жизнь, приемлемые предпочтения и действия в конфликте. Настрой на длительные отношения — отдельная часть индекса: это контекст планов, не оценка человека или его выбора.'),
      h('p', {}, 'Одно сочетание реакций тоже входит в общий индекс: тревога одного при дистанции другого. Сама тревожность не считается недостатком. Остальные вопросы об эмоциях и прошлом опыте не оцениваются в процентах; все они сохраняются в ресурсах пары.'),
      h('p', {}, 'Спорт учитывается через приемлемость привычки партнёра, без отдельного балла за сходство увлечения спортом. Важные для каждого сферы влияют сильнее. Неопределённые цели не считаются подтверждённым совпадением. Отдельные существенные расхождения могут сохраняться — смотрите темы для обсуждения ниже.'),
      h('p', {}, 'Это подсказка для обсуждения отношений, а не вероятность того, что они будут счастливыми или сохранятся.'),
      semantic ? null : h('p', {}, 'Если «партнёр как друг» заметно выше отношений — вам легко вместе, но во взглядах на совместную жизнь есть что обсудить.')),
    planCaps(semantic, questions),
    foldout('Совпадение планов', h('section', { class: 'plans' },
      sectionHeading('Общая картина', 'Совпадение планов'),
      h('p', { class: 'hint' }, 'Ваши взгляды на общую жизнь: дети, деньги, где жить, быт, вера, родные. Настрой на длительные отношения учитывается отдельно: даже общий выбор коротких отношений означает другой ориентир, а не спор между вами.'),
      h('div', { class: 'notes plan-notes' },
        note('red', reds.length > 1 ? 'Красные флаги' : 'Красный флаг', reds),
        note('talk', 'Пока не определились', (rel.uncertain ?? []).map(i => i.topic)),
        note('talk', 'Стоит обсудить', rel.talkZones.map((i) => i.topic)),
        note('support', 'Ваша опора', supportTopics(rel))))),
    foldout('Что важнее каждому', prioritiesSection(a, b)),
    foldout('Ресурсы пары', resourcesSection(result.resources, result.maturity)),
    foldout('Ответы друг друга', answersSection(a, b, questions)),
    h('section', { class: 'result-share' },
      h('span', { class: 'share-flower', 'aria-hidden': 'true' }, '✳'),
      h('h2', {}, 'Отправить результат партнёру'),
      h('p', { class: 'hint' }, 'По этой ссылке результат откроется в любой момент и на любом устройстве — сохраните её. На этом устройстве он есть и на главной в «Ваших результатах».'),
      shareBlock(shareUrl, 'Наш результат совместимости')),
  );
}
