import { h } from './dom';

export function shareBlock(url: string, title: string): HTMLElement {
  const input = h('input', { type: 'text', readonly: true, value: url, class: 'link', 'aria-label': 'Ссылка' });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Скопировано';
    } catch {
      input.select();
      status.textContent = 'Выделите ссылку и скопируйте вручную';
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // меню закрыли — ничего не делаем
    }
  };

  return h('div', { class: 'share' },
    input,
    h('div', { class: 'nav' },
      'share' in navigator ? h('button', { type: 'button', class: 'primary', onclick: share }, 'Поделиться') : null,
      h('button', { type: 'button', class: 'secondary', onclick: copy }, 'Скопировать'),
    ),
    status,
  );
}
