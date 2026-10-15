import { h } from '../dom';
import { shareBlock } from '../share';

export function finishScreen(url: string): HTMLElement {
  return h('section', { class: 'screen' },
    h('h1', {}, 'Готово!'),
    h('p', {}, 'Отправьте ссылку партнёру. Он пройдёт тест, сразу увидит результат и сможет отправить его вам.'),
    shareBlock(url, 'Тест совместимости'),
  );
}
