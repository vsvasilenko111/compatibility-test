import { h } from '../dom';
import { plural } from '../plural';
import { shareBlock } from '../share';

export interface IntroProps {
  inviterName: string | null; // null — не приглашение; '' — приглашение без имени
  total: number;
  resumeAt: number | null; // номер вопроса, с которого продолжить (с 1)
  storageAvailable: boolean;
  ownUrl: string | null;
  onStart(name: string): void;
  onResume(): void;
}

export function introScreen(p: IntroProps): HTMLElement {
  const title = p.inviterName === null
    ? 'Тест совместимости'
    : p.inviterName ? `${p.inviterName} приглашает вас проверить совместимость` : 'Вас пригласили проверить совместимость';
  const minutes = Math.max(1, Math.round((p.total * 8) / 60));
  const input = h('input', { type: 'text', maxlength: '20', placeholder: 'Ваше имя (необязательно)', autocomplete: 'given-name' });

  return h('section', { class: 'screen intro' },
    h('h1', {}, title),
    h('p', {}, `${plural(p.total, ['вопрос', 'вопроса', 'вопросов'])}, около ${plural(minutes, ['минуты', 'минут', 'минут'])}. Вы узнаете совместимость в отношениях и в дружбе.`),
    h('p', {}, 'Конкретные ответы партнёр не увидит — только общий результат, если вы оба сами не решите открыть ответы друг другу. Отвечайте честно, а не «как правильно».'),
    p.storageAvailable ? null : h('p', { class: 'warn' }, 'Браузер не сохраняет прогресс — пройдите тест за один раз.'),
    p.resumeAt !== null
      ? h('button', { type: 'button', class: 'primary', onclick: () => p.onResume() }, `Продолжить с вопроса ${p.resumeAt}`)
      : null,
    input,
    h('button', { type: 'button', class: p.resumeAt !== null ? 'secondary' : 'primary', onclick: () => p.onStart(input.value.trim()) },
      p.resumeAt !== null ? 'Начать заново' : 'Начать'),
    p.ownUrl && p.inviterName === null
      ? h('div', { class: 'block' }, h('h3', {}, 'Ваша ссылка для партнёра'), shareBlock(p.ownUrl, 'Тест совместимости'))
      : null,
  );
}
