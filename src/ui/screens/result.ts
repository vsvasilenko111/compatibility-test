import type { CompareResult } from '../../scoring/compare';
import type { Profile } from '../../types';
import { h } from '../dom';
import { flagsLine, sphereTiles, supportTopics, tileTone } from '../result-view';
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
    h('section', { class: 'map' },
      h('h3', { class: 'eyebrow' }, 'Карта сфер'),
      h('div', { class: 'tiles' },
        ...sphereTiles(rel.spheres).map((t) =>
          h('div', { class: `tile tone-${tileTone(t.percent)}`, title: t.percent === null ? 'Для вас обоих не принципиально' : '' },
            h('b', {}, num(t.percent)),
            h('span', {}, t.label))))),
    h('h3', {}, 'Отправить результат партнёру'),
    shareBlock(shareUrl, 'Наш результат совместимости'),
  );
}
