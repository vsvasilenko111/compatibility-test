import { h } from '../dom';
import { shareBlock } from '../share';

export function finishScreen(url: string): HTMLElement {
  return h('section', { class: 'screen' },
    h('h1', {}, 'Готово!'),
    h('p', {}, 'Отправьте ссылку партнёру. Он пройдёт тест, сразу увидит результат и сможет отправить его вам. Если партнёр уже прошёл тест сам, пусть просто откроет вашу ссылку на том же устройстве — результат покажется без повторного прохождения.'),
    shareBlock(url, 'Тест совместимости'),
  );
}
