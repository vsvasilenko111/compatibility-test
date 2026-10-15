import { calibrate, FRIENDSHIP_TABLE, RELATIONSHIP_TABLE } from '../../scoring/calibration';
import type { CompareResult } from '../../scoring/compare';
import type { MaturityResult } from '../../scoring/maturity';
import type { Profile } from '../../types';
import { h } from '../dom';
import { flagsLine, sphereDetail, sphereTiles, supportTopics, tileTone, type SphereTile } from '../result-view';
import { plural } from '../plural';
import { shareBlock } from '../share';
import { verdict } from '../verdict';

const num = (p: number | null) => (p === null ? '—' : String(Math.round(p)));

function score(p: number | null, caption: string, cls: string): HTMLElement {
  return h('div', { class: `score ${cls}` },
    h('div', { class: 'num' }, num(p), p === null ? null : h('span', { class: 'unit' }, '%')),
    h('div', { class: 'cap' }, caption));
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

/** Эмоции и прошлый опыт: опоры и бережные темы для разговора. Чьи это ответы — не показываем никогда. */
function maturitySection(m: MaturityResult | null): HTMLElement | null {
  if (!m || (!m.strengths.length && !m.talks.length && !m.softTopics.length)) return null;
  return h('section', { class: 'maturity' },
    h('h3', { class: 'eyebrow' }, 'Эмоции и близость'),
    h('p', { class: 'hint' }, 'На проценты не влияет — это подсказки, о чём поговорить.'),
    h('div', { class: 'notes' },
      note('support', 'Опоры пары', m.strengths),
      ...m.talks.map((t) => h('div', { class: 'note talk' }, h('div', { class: 'note-label' }, t.title), h('p', {}, t.text))),
      note('soft', 'Можно обсудить', m.softTopics)),
    h('p', { class: 'hint' }, 'Если какая-то тема отзывается сильно, с этим можно прийти к психологу — вдвоём или по отдельности.'));
}

export function resultScreen(a: Profile, b: Profile, result: CompareResult, shareUrl: string): HTMLElement {
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
        score(shown.friendship.percent, 'совместимость в дружбе', 'second')),
      h('p', { class: 'poster-verdict' }, verdict(shown)),
      flags ? h('p', { class: 'poster-flags' }, flags) : null),
    h('details', { class: 'explain' },
      h('summary', {}, 'Что значат проценты?'),
      h('p', {}, 'Совместимость в дружбе — по 60 вопросам об общении: юмор, досуг, доверие, ссоры. Насколько вам легко вместе.'),
      h('p', {}, 'Совместимость в отношениях — по всем 118 вопросам: к дружбе добавляются дети, быт, деньги, близость, родные. Получится ли общая жизнь.'),
      h('p', {}, 'Вопросы об эмоциях и прошлом опыте на проценты не влияют — по ним видны опоры пары и темы для разговора.'),
      h('p', {}, '50% — как у двух случайных людей, 75% и выше — заметно лучше большинства пар. Если дружба заметно выше отношений — вам легко вместе, но во взглядах на совместную жизнь есть что обсудить.')),
    h('div', { class: 'notes' },
      note('red', reds.length > 1 ? 'Красные флаги' : 'Красный флаг', reds),
      note('talk', 'Стоит обсудить', rel.talkZones.map((i) => i.topic)),
      note('support', 'Ваша опора', supportTopics(rel))),
    maturitySection(result.maturity),
    sphereMap(sphereTiles(rel.spheres)),
    h('h3', {}, 'Отправить результат партнёру'),
    shareBlock(shareUrl, 'Наш результат совместимости'),
  );
}
