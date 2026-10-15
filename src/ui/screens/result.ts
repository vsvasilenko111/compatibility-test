import type { CompareResult } from '../../scoring/compare';
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
  const panel = h('div', { class: 'sphere-detail', 'aria-live': 'polite' });
  panel.hidden = true;
  const buttons: HTMLButtonElement[] = [];
  let pinned: string | null = null;
  const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

  function open(t: SphereTile | null) {
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
          open(pinned ? t : null);
        },
        onmouseenter: () => { if (canHover && !pinned) open(t); },
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

export function resultScreen(a: Profile, b: Profile, result: CompareResult, shareUrl: string): HTMLElement {
  const rel = result.relationship;
  const flags = flagsLine(rel);
  const reds = rel.redFlags.map((i) => i.topic);

  return h('section', { class: 'screen result' },
    h('div', { class: 'poster' },
      h('p', { class: 'poster-names' }, `${a.name || 'Первый'} × ${b.name || 'Второй'}`),
      h('div', { class: 'poster-scores' },
        score(rel.percent, 'как пара', 'main'),
        score(result.friendship.percent, 'как друзья', 'second')),
      h('p', { class: 'poster-verdict' }, verdict(result)),
      flags ? h('p', { class: 'poster-flags' }, flags) : null),
    h('div', { class: 'notes' },
      note('red', reds.length > 1 ? 'Красные флаги' : 'Красный флаг', reds),
      note('talk', 'Стоит обсудить', rel.talkZones.map((i) => i.topic)),
      note('support', 'Ваша опора', supportTopics(rel))),
    sphereMap(sphereTiles(rel.spheres)),
    h('h3', {}, 'Отправить результат партнёру'),
    shareBlock(shareUrl, 'Наш результат совместимости'),
  );
}
