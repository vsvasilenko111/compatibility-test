// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mountSiteShell } from '../src/ui/site-shell';

afterEach(() => document.body.replaceChildren());

describe('site shell', () => {
  it('surrounds the app once and preserves its screen and listeners', () => {
    const app = document.createElement('main');
    const button = document.createElement('button');
    let clicks = 0;
    button.addEventListener('click', () => clicks++);
    app.append(button);
    document.body.append(app);

    mountSiteShell(app);
    mountSiteShell(app);

    expect(document.querySelectorAll('.site-header')).toHaveLength(1);
    expect(document.querySelectorAll('.site-footer')).toHaveLength(1);
    expect(app.previousElementSibling?.className).toBe('site-header');
    expect(app.nextElementSibling?.className).toBe('site-footer');
    expect(app.firstChild).toBe(button);
    button.click();
    expect(clicks).toBe(1);
  });

  it('provides a named home link and neutral footer copy', () => {
    const app = document.createElement('main');
    document.body.append(app);
    mountSiteShell(app);
    const brand = document.querySelector<HTMLAnchorElement>('.brand')!;
    expect(brand.getAttribute('href')).toBe('#');
    expect(brand.getAttribute('aria-label')).toContain('на главную');
    expect(brand.textContent).toContain('между нами');
    expect(document.querySelector('.site-footer')?.textContent).toContain('Близость начинается с любопытства друг к другу.');
  });
});
