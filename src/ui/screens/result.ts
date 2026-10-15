import { SPHERES } from '../../questions/spheres';
import type { CompareResult, ItemRef, ModeResult } from '../../scoring/compare';
import type { Profile } from '../../types';
import { h } from '../dom';
import { shareBlock } from '../share';
import { verdict } from '../verdict';

const fmt = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`);

function list(title: string, items: ItemRef[], cls: string): HTMLElement | null {
  if (!items.length) return null;
  return h('div', { class: `block ${cls}` }, h('h3', {}, title), h('ul', {}, ...items.map((i) => h('li', {}, i.topic))));
}

function modeSection(title: string, m: ModeResult): HTMLElement {
  const rows = SPHERES.flatMap((s) => {
    const sc = m.spheres.find((x) => x.sphere === s.id);
    if (!sc) return [];
    return [h('li', { class: 'sphere' },
      h('span', {}, s.label),
      h('span', { class: 'pct' }, sc.percent === null ? 'не принципиально' : fmt(sc.percent)))];
  });

  return h('section', { class: 'mode' },
    h('h2', {}, title, ' ', h('span', { class: 'big' }, m.percent === null ? 'не принципиально' : fmt(m.percent))),
    m.superCount ? h('p', { class: 'badge' }, `🌟 Супер-совпадений: ${m.superCount}`) : null,
    list('🔴 Красные флаги', m.redFlags, 'red'),
    list('🌟 Супер-совпадения', m.superMatches, 'super'),
    list('🟢 Сильные совпадения', m.strongMatches, 'strong'),
    list('🟠 Стоит обсудить', m.talkZones, 'talk'),
    m.flexibleCount ? h('p', { class: 'hint' }, `⚪ Вопросов, где вы оба гибкие: ${m.flexibleCount}`) : null,
    h('h3', {}, 'По сферам'),
    h('ul', { class: 'spheres' }, ...rows),
  );
}

export function resultScreen(a: Profile, b: Profile, result: CompareResult, shareUrl: string): HTMLElement {
  return h('section', { class: 'screen result' },
    h('p', { class: 'names' }, `${a.name || 'Первый'} и ${b.name || 'Второй'}`),
    h('p', { class: 'verdict' }, verdict(result)),
    modeSection('💞 Отношения', result.relationship),
    modeSection('👯 Дружба', result.friendship),
    h('h3', {}, 'Отправить результат партнёру'),
    shareBlock(shareUrl, 'Наш результат совместимости'),
  );
}
