import { calibrate, FRIENDSHIP_TABLE, RELATIONSHIP_TABLE } from '../../scoring/calibration';
import type { CompareResult } from '../../scoring/compare';
import type { MaturityResult } from '../../scoring/maturity';
import type { Resource } from '../../scoring/resources';
import type { Question } from '../../types';
import { bothAnswered, divergences, type AnswerRow } from '../answers-view';
import type { Profile } from '../../types';
import { h } from '../dom';
import { flagsLine, sphereDetail, sphereTiles, supportTopics, tileTone, type SphereTile } from '../result-view';
import { plural } from '../plural';
import { shareBlock } from '../share';
import { level, verdict } from '../verdict';

const num = (p: number | null) => (p === null ? '—' : String(Math.round(p)));

function score(p: number | null, caption: string, cls: string): HTMLElement {
  return h('div', { class: `score ${cls}` },
    h('div', { class: 'num' }, num(p), p === null ? null : h('span', { class: 'unit' }, '%')),
    h('div', { class: 'cap' }, caption),
    level(p) ? h('div', { class: 'lvl' }, level(p)) : null);
}

function note(kind: string, label: string, topics: string[]): HTMLElement | null {
  if (!topics.length) return null;
  return h('div', { class: `note ${kind}` }, h('div', { class: 'note-label' }, label), h('div', {}, topics.join(' · ')));
}

/** Карта сфер: нажатие (или наведение мышью) раскрывает под картой темы вопросов сферы со степенью совпадения. */
function sphereMap(tiles: SphereTile[]): HTMLElement {
  const panel = h('div', { class: 'sphere-detail', 'aria-live': 'polite', onclick: () => { pinned = null; open(null); } });
  panel.hidden = true;
  const buttons: HTMLButtonElement[] = [];
  let pinned: string | null = null;
  const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

  function open(t: SphereTile | null, anchor?: HTMLElement) {
    buttons.forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.id === t?.id)));
    if (!t) {
      panel.hidden = true;
      return;
    }
    const rows = sphereDetail(t.items);
    panel.replaceChildren(
      h('div', { class: 'detail-head' },
        h('b', {}, t.label),
        h('span', {}, plural(rows.length, ['вопрос', 'вопроса', 'вопросов']))),
      h('ul', {}, ...rows.map((r) =>
        h('li', { class: `lvl-${r.level}` }, h('span', { class: 'dot' }), h('span', { class: 'topic' }, r.topic), h('span', { class: 'lvl' }, r.label)))),
    );
    panel.hidden = false;
    // Панель всплывает прямо под плиткой, поверх нижних плиток — без сдвига раскладки и всегда в поле зрения.
    if (anchor) panel.style.top = `${anchor.offsetTop + anchor.offsetHeight + 8}px`;
  }

  const grid = h('div', { class: 'tiles' },
    ...tiles.map((t) => {
      const b = h('button', {
        type: 'button',
        class: `tile tone-${tileTone(t.percent)}`,
        'aria-expanded': 'false',
        title: t.percent === null ? 'Для вас обоих не принципиально' : '',
        onclick: () => {
          pinned = pinned === t.id ? null : t.id;
          open(pinned ? t : null, b);
        },
        onmouseenter: () => { if (canHover && !pinned) open(t, b); },
      }, h('b', {}, num(t.percent)), h('span', {}, t.label));
      b.dataset.id = t.id;
      buttons.push(b);
      return b;
    }));

  return h('section', {
    class: 'map',
    onmouseleave: () => { if (canHover && !pinned) open(null); },
  },
    h('h3', { class: 'eyebrow' }, 'Карта сфер'),
    h('p', { class: 'hint' }, canHover ? 'Наведите или нажмите на сферу, чтобы увидеть темы вопросов' : 'Нажмите на сферу, чтобы увидеть темы вопросов'),
    grid,
    panel);
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
    h('h3', { class: 'eyebrow' }, 'Ресурсы пары'),
    h('p', { class: 'hint' }, 'Не сходство, а то, как вы вдвоём справляетесь с трудным. На проценты не влияет; чьи это ответы, не показываем.'),
    rs ? h('ul', { class: 'res-list' }, ...rs.map((r) =>
      h('li', { class: `res lvl-${r.level}` },
        h('div', { class: 'res-head' }, h('b', {}, r.title), h('span', { class: 'res-lvl' }, LEVEL_LABEL[r.level])),
        h('p', {}, r.text)))) : null,
    h('div', { class: 'notes' },
      ...talks.map((t) => h('div', { class: 'note talk' }, h('div', { class: 'note-label' }, t.title), h('p', {}, t.text)))),
    h('p', { class: 'hint' }, 'Это подсказки для разговора, а не диагноз. Если какая-то тема отзывается сильно, с этим можно прийти к психологу — вдвоём или по отдельности.'));
}

function answerItem(r: AnswerRow, na: string, nb: string): HTMLElement {
  return h('li', { class: r.opposite && r.diff >= 6 ? 'answer far' : 'answer' },
    h('div', { class: 'answer-q' }, r.text),
    h('div', { class: 'answer-poles' }, `0 — ${r.left} · 10 — ${r.right}`),
    h('div', { class: 'answer-vals' },
      h('span', {}, `${na}: `, h('b', {}, String(r.a)), r.firmA ? ' · не обсуждается' : null),
      h('span', {}, `${nb}: `, h('b', {}, String(r.b)), r.firmB ? ' · не обсуждается' : null)));
}

/** Ответы друг друга: расхождения по группам и все ответы. Пропущенные не показываются. */
function answersSection(a: Profile, b: Profile, questions: Question[] | undefined): HTMLElement | null {
  if (!questions) return null;
  const na = a.name || 'Первый', nb = b.name || 'Второй';
  const groups = divergences(questions, a, b);
  const all = bothAnswered(questions, a, b);
  return h('section', { class: 'answers' },
    h('h3', { class: 'eyebrow' }, 'Ответы друг друга'),
    ...groups.map((g) => h('div', { class: 'answer-group' },
      h('h4', {}, `${g.title} — ${g.rows.length}`),
      h('ul', {}, ...g.rows.map((r) => answerItem(r, na, nb))))),
    groups.length ? null : h('p', {}, 'Расхождений на 3 деления и больше нет.'),
    h('details', { class: 'explain' },
      h('summary', {}, `Все ответы — ${all.length}`),
      h('ul', {}, ...all.map((r) => answerItem(r, na, nb)))));
}

/** Кто прошёл прежнюю версию теста и может ответить только на новые вопросы. */
export interface FillOffer { name: string; count: number; onFill(): void }

function fillBlock(fill: FillOffer[]): HTMLElement | null {
  if (!fill.length) return null;
  return h('div', { class: 'block fill' },
    h('h3', {}, 'В тесте появились новые вопросы'),
    h('p', { class: 'hint' }, 'Ответьте только на них — прежние ответы сохранятся, и результат пересчитается с новыми темами.'),
    ...fill.map((f) => h('button', { type: 'button', class: 'secondary', onclick: () => f.onFill() },
      `${f.name}: ответить на ${plural(f.count, ['новый вопрос', 'новых вопроса', 'новых вопросов'])}`)));
}

export function resultScreen(a: Profile, b: Profile, result: CompareResult, shareUrl: string, questions?: Question[], fill: FillOffer[] = []): HTMLElement {
  const rel = result.relationship;
  // На постере и в вердикте — откалиброванные проценты (50% — типичная случайная пара); карта сфер — по сырым.
  const shown = {
    relationship: { ...rel, percent: calibrate(rel.percent, RELATIONSHIP_TABLE) },
    friendship: { ...result.friendship, percent: calibrate(result.friendship.percent, FRIENDSHIP_TABLE) },
  };
  const flags = flagsLine(rel);
  const reds = rel.redFlags.map((i) => i.topic);

  return h('section', { class: 'screen result' },
    h('div', { class: 'poster' },
      h('p', { class: 'poster-names' }, `${a.name || 'Первый'} × ${b.name || 'Второй'}`),
      h('div', { class: 'poster-scores' },
        score(shown.relationship.percent, 'совместимость в отношениях', 'main'),
        score(shown.friendship.percent, 'партнёр как друг', 'second')),
      h('p', { class: 'poster-verdict' }, verdict(shown)),
      flags ? h('p', { class: 'poster-flags' }, flags) : null),
    fillBlock(fill),
    h('details', { class: 'explain' },
      h('summary', {}, 'Что значат проценты?'),
      h('p', {}, 'Партнёр как друг — каково вам друг с другом каждый день: юмор, досуг, увлечения, доверие, ссоры, ценности, быт, ревность, родные. Насколько вам легко вместе.'),
      h('p', {}, 'Совместимость в отношениях — по всем вопросам, кроме эмоций и прошлого опыта: к этому добавляются дети, быт, деньги, близость, родные. Получится ли общая жизнь.'),
      h('p', {}, 'Вопросы об эмоциях и прошлом опыте на проценты не влияют — по ним считаются ресурсы пары: как вы спорите, отходите, миритесь и поддерживаете друг друга.'),
      h('p', {}, 'Процент — насколько вы совпадаете по сравнению с двумя случайными людьми: 50% — как у случайной пары незнакомцев. У крепких пар обычно 75–90%.'),
      h('ul', {},
        h('li', {}, '80–100% — очень высокая: как у типичной крепкой пары.'),
        h('li', {}, '70–79% — высокая: с этого уровня начинаются крепкие пары, расхождения решаемы.'),
        h('li', {}, '55–69% — средняя: многое зависит от того, договоритесь ли вы по темам из «Стоит обсудить».'),
        h('li', {}, '40–54% — ниже средней: расхождений больше, обычно в одной-двух важных сферах.'),
        h('li', {}, 'до 40% — низкая: расходятся жизненные планы — дети, где жить, деньги.')),
      h('p', {}, 'Если «партнёр как друг» заметно выше отношений — вам легко вместе, но во взглядах на совместную жизнь есть что обсудить.')),
    h('section', { class: 'plans' },
      h('h3', { class: 'eyebrow' }, 'Совпадение планов'),
      h('p', { class: 'hint' }, 'Насколько совпадают ваши взгляды на общую жизнь: дети, деньги, где жить, быт, вера, родные.'),
      h('div', { class: 'notes' },
        note('red', reds.length > 1 ? 'Красные флаги' : 'Красный флаг', reds),
        note('talk', 'Стоит обсудить', rel.talkZones.map((i) => i.topic)),
        note('support', 'Ваша опора', supportTopics(rel)))),
    resourcesSection(result.resources, result.maturity),
    answersSection(a, b, questions),
    sphereMap(sphereTiles(rel.spheres)),
    h('h3', {}, 'Отправить результат партнёру'),
    h('p', { class: 'hint' }, 'По этой ссылке результат откроется в любой момент и на любом устройстве — сохраните её. На этом устройстве он есть и на главной в «Ваших результатах».'),
    shareBlock(shareUrl, 'Наш результат совместимости'),
  );
}
