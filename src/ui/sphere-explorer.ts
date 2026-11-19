import type { Profile, Question } from '../types';
import type { SphereItem } from '../scoring/compare';
import { h } from './dom';
import { plural } from './plural';
import { sphereDetail, tileTone, type SphereTile } from './result-view';
import { answerComparison, answerSelection } from './answer-comparison';

function questionRow(q: Question, item: SphereItem | undefined, questions: Question[], a: Profile, b: Profile): HTMLElement {
  const sourceId = q.relationshipRule?.kind === 'closeness_cross' ? q.relationshipRule.sourceId : q.cross?.id;
  const source = questions.find(other => other.id === sourceId);
  const known = answerSelection(q, a).known && answerSelection(q, b).known;
  const sourceKnown = !sourceId || !!source && answerSelection(source, a).known && answerSelection(source, b).known;
  const scored = q.scored !== false && q.answerKind !== 'categorical' && q.relationshipRule?.kind !== 'input_only';
  const detail = item && scored && known && sourceKnown ? sphereDetail([item])[0] : null;
  // Cross questions measure expectation against the other person's actual response, never equal choices.
  const label = !known || !sourceKnown ? 'Недостаточно данных' : !scored ? 'Без оценки'
    : sourceId && item?.kind !== 'interaction' ? 'Приемлемость привычки партнёра'
      : detail?.label ?? 'Без отдельной оценки';
  const cls = detail && !sourceId ? ` lvl-${detail.level}` : ' neutral';
  const usedAsSource = questions.some(other => other.cross?.id === q.id ||
    other.relationshipRule?.kind === 'closeness_cross' && other.relationshipRule.sourceId === q.id);
  return h('details', { class: `sphere-question${cls}`, 'data-question-id': q.id },
    h('summary', {}, h('span', { class: 'topic' }, q.topic), h('span', { class: 'lvl' }, label)),
    h('div', { class: 'sphere-question-body' },
      h('p', { class: 'sphere-question-wording' }, q.text),
      answerComparison(q, a, b),
      !scored ? h('p', { class: 'hint sphere-question-explanation' }, usedAsSource
        ? 'Этот ответ учитывается при сравнении с ожиданиями партнёра.'
        : 'Этот ответ оставлен для обсуждения и не меняет процент.') : null,
      sourceId ? h('div', { class: 'cross-source' },
        h('p', { class: 'hint' }, q.relationshipRule?.kind === 'closeness_cross'
          ? 'Сочетание реакций: ответ каждого рассматривается вместе с реакцией другого.'
          : 'Приемлемость: ожидание каждого сопоставляется с привычкой другого. Одинаковые ожидания сами по себе не означают совпадение.'),
        source ? h('div', {}, h('p', { class: 'sphere-question-wording' }, source.text), answerComparison(source, a, b))
          : h('p', {}, 'Связанный вопрос недоступен.')) : null));
}

let explorerId = 0;
/** Click-only disclosure: sphere → question topics → complete wording and individual responses. */
export function sphereExplorer(tiles: SphereTile[], questions?: Question[], a?: Profile, b?: Profile): HTMLElement {
  const panelId = `sphere-detail-${++explorerId}`;
  const panel = h('div', { class: 'sphere-detail', id: panelId, role: 'region', tabindex: '-1' });
  panel.hidden = true;
  const buttons: HTMLButtonElement[] = [];
  let selected: SphereTile | null = null;
  const grid = h('div', { class: 'tiles' });
  function placePanel() {
    if (!selected) return;
    const index = tiles.indexOf(selected);
    const tracks = getComputedStyle(grid).gridTemplateColumns.trim();
    // Computed pixel tracks reflect the current responsive grid, even when the old panel interrupts a row.
    const columns = tracks && !tracks.startsWith('repeat(') && tracks !== 'none'
      ? tracks.split(/\s+/).length
      : window.innerWidth <= 760 ? 2 : 4;
    const last = Math.min(buttons.length - 1, Math.floor(index / columns) * columns + columns - 1);
    buttons[last].after(panel);
  }
  function close(restoreFocus = true) {
    const index = selected ? tiles.indexOf(selected) : -1;
    selected = null;
    panel.hidden = true;
    buttons.forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (restoreFocus && index >= 0) buttons[index].focus();
  }
  function select(tile: SphereTile) {
    if (selected?.id === tile.id) { close(); return; }
    selected = tile;
    panel.setAttribute('aria-label', tile.label);
    buttons.forEach(button => button.setAttribute('aria-expanded', String(button.dataset.id === tile.id)));
    const qs = questions?.filter(q => q.sphere === tile.id || tile.items.some(item => item.id === q.id));
    const unmapped = tile.items.filter(item => !questions?.some(q => q.id === item.id));
    const rows = sphereDetail(tile.items);
    panel.replaceChildren(
      h('div', { class: 'detail-head' }, h('div', {}, h('b', {}, tile.label), h('span', { class: 'sphere-question-count' }, plural(qs ? qs.length + unmapped.length : rows.length, ['вопрос', 'вопроса', 'вопросов']))),
        h('button', { type: 'button', class: 'sphere-detail-close', onclick: () => close(), 'aria-label': `Закрыть сферу «${tile.label}»` }, 'Закрыть ×')),
      qs && a && b ? h('div', { class: 'sphere-questions' },
        ...qs.map(q => questionRow(q, tile.items.find(item => item.id === q.id), questions!, a, b)),
        ...unmapped.map(item => h('details', { class: 'sphere-question', 'data-question-id': item.id },
          h('summary', {}, h('span', { class: 'topic' }, item.topic), h('span', { class: 'lvl' }, sphereDetail([item])[0].label)),
          h('p', { class: 'hint sphere-question-body' }, 'Формулировка вопроса недоступна в этой версии.'))))
        : h('ul', {}, ...rows.map(row => h('li', { class: `lvl-${row.level}` }, h('span', { class: 'dot' }), h('span', { class: 'topic' }, row.topic), h('span', { class: 'lvl' }, row.label)))));
    panel.hidden = false;
    placePanel();
    panel.scrollIntoView?.({ block: 'start' });
    panel.focus({ preventScroll: true });
  }
  tiles.forEach(tile => {
    const button = h('button', { type: 'button', class: `tile tone-${tileTone(tile.percent)}`, 'aria-expanded': 'false', 'aria-controls': panelId,
      onclick: () => select(tile) }, h('b', {}, tile.percent === null ? '—' : String(Math.round(tile.percent))), h('span', {}, tile.label));
    button.dataset.id = tile.id;
    buttons.push(button);
    grid.append(button);
  });
  grid.append(panel);
  const root = h('section', { class: 'map sphere-explorer', onkeydown: event => {
    if ((event as KeyboardEvent).key === 'Escape' && selected) { event.preventDefault(); close(); }
  } },
    h('div', { class: 'section-heading' }, h('p', { class: 'eyebrow' }, 'В деталях'), h('h2', {}, 'Карта сфер')),
    h('p', { class: 'hint' }, 'Нажмите на сферу, затем на вопрос — увидите полную формулировку и ответы каждого.'), grid);
  if (typeof ResizeObserver !== 'undefined') {
    // Observe only column-width changes: expanding questions changes height, not the selected row.
    let width = 0;
    new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next !== width) { width = next; placePanel(); }
    }).observe(grid);
  }
  return root;
}
