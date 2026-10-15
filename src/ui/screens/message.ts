import { h } from '../dom';
import { shareBlock } from '../share';

export function messageScreen(title: string, text: string, url: string | null = null): HTMLElement {
  return h('section', { class: 'screen' },
    h('h1', {}, title),
    h('p', {}, text),
    url ? shareBlock(url, 'Тест совместимости') : null,
    h('button', { type: 'button', class: 'secondary', onclick: () => { location.hash = ''; } }, 'На главную'),
  );
}
