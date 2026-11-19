import { h } from './dom';

/** Mount shared branding outside the app so screen transitions leave it intact. */
export function mountSiteShell(app: HTMLElement): void {
  if (!app.parentElement) return;
  if (!app.previousElementSibling?.classList.contains('site-header')) {
    app.before(h('header', { class: 'site-header' },
      h('a', { class: 'brand', href: '#', 'aria-label': 'Тест совместимости — на главную' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h('span', {}, 'между нами', h('small', {}, 'тест совместимости'))),
      h('span', { class: 'header-note' }, 'Чуть лучше понять друг друга'),
    ));
  }
  if (!app.nextElementSibling?.classList.contains('site-footer')) {
    app.after(h('footer', { class: 'site-footer' },
      h('span', { class: 'footer-mark', 'aria-hidden': 'true' }, '✳'),
      h('p', {}, 'Близость начинается с любопытства друг к другу.'),
      h('span', {}, 'между нами · тест совместимости'),
    ));
  }
}
