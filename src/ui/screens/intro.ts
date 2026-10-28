import { h } from '../dom';
import { plural } from '../plural';
import { shareBlock } from '../share';

export interface IntroProps {
  inviterName: string | null; // null — не приглашение; '' — приглашение без имени
  total: number;
  resumeAt: number | null; // номер вопроса, с которого продолжить (с 1)
  storageAvailable: boolean;
  ownUrl: string | null;
  history: { names: string; url: string; at: number; forget(): void }[];
  onStart(name: string): void;
  onResume(): void;
}

export function introScreen(p: IntroProps): HTMLElement {
  const title = p.inviterName === null
    ? 'Тест совместимости'
    : p.inviterName ? `${p.inviterName} приглашает вас проверить совместимость` : 'Вас пригласили проверить совместимость';
  // Около 13 секунд на вопрос: прочитать, подумать, выбрать вариант.
  const minutes = Math.max(1, Math.round((p.total * 13) / 60));
  const input = h('input', { type: 'text', maxlength: '20', placeholder: 'Ваше имя (необязательно)', autocomplete: 'given-name' });

  return h('section', { class: 'screen intro' },
    h('h1', {}, title),
    h('p', {}, `${plural(p.total, ['вопрос', 'вопроса', 'вопросов'])}, около ${plural(minutes, ['минуты', 'минут', 'минут'])}. Вы узнаете совместимость в отношениях и то, насколько вы друзья друг другу.`),
    h('p', {}, 'Отвечайте честно. Если вопрос о том, как вы поступаете, — отвечайте, как обычно бывает на самом деле. Если о том, какой должна быть жизнь вдвоём, — как вам хотелось бы. Если чего-то с вами не было или вы пока не живёте вместе, представьте, что это происходит.'),
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
    p.history.length && p.inviterName === null
      ? h('div', { class: 'block history' },
        h('h3', {}, 'Ваши результаты'),
        h('p', { class: 'hint' }, 'Видны только на этом устройстве.'),
        h('ul', {}, ...p.history.map((r) => {
          const li = h('li', {},
            h('a', { href: r.url }, r.names),
            h('span', { class: 'hint' }, ` · ${new Date(r.at).toLocaleDateString('ru-RU')}`),
            h('button', { type: 'button', class: 'forget', 'aria-label': `Убрать ${r.names}`, onclick: () => { r.forget(); li.remove(); } }, '×'));
          return li;
        })))
      : null,
  );
}
