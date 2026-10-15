import { h } from '../dom';
import { shareBlock } from '../share';

export interface MessageAction {
  label: string;
  primary?: boolean;
  onClick(): void;
}

export function messageScreen(title: string, text: string, url: string | null = null, actions: MessageAction[] = []): HTMLElement {
  return h('section', { class: 'screen' },
    h('h1', {}, title),
    h('p', {}, text),
    url ? shareBlock(url, 'Тест совместимости') : null,
    ...actions.map((a) => h('button', { type: 'button', class: a.primary ? 'primary' : 'secondary', onclick: () => a.onClick() }, a.label)),
    actions.length > 0 ? null : h('button', { type: 'button', class: 'secondary', onclick: () => { location.hash = ''; } }, 'На главную'),
  );
}
