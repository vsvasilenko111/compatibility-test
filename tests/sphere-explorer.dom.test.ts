// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sphereExplorer } from '../src/ui/sphere-explorer';
import { answerFor } from '../src/answer';
import type { Profile, Question } from '../src/types';
import type { SphereTile } from '../src/ui/result-view';
const q = (id: string, extra: Partial<Question> = {}): Question => ({ id, sphere: 'roles', block: 'relationship', text: `Полный вопрос ${id}`, topic: `Тема ${id}`, left: 'Нет', right: 'Да', optional: false, options: ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый'], ...extra });
const profile = (name: string): Profile => ({ name, bankVersion: 35, responses: { ordinary: answerFor(0), funding: answerFor(7), cross: answerFor(10), habit: answerFor(0) } });
const questions = [q('ordinary'), q('funding', { scored: false, answerKind: 'categorical', options: ['Я', 'Партнёр', 'Оба', 'Роли меняются'] }), q('cross', { cross: { id: 'habit', level: [0, .2, .5, .8, 1] } }), q('habit', { scored: false }), q('missing')];
const tiles: SphereTile[] = [{ id: 'roles', label: 'Роли', percent: 75, items: [{ id: 'ordinary', topic: 'Тема ordinary', match: 1 }, { id: 'cross', topic: 'Тема cross', match: 1 }] }, { id: 'habits', label: 'Привычки', percent: null, items: [] }];
function open(qs = questions, a = profile('Аня'), b = profile('Борис')) {
  const root = sphereExplorer(tiles, qs, a, b);
  document.body.replaceChildren(root);
  root.querySelector<HTMLButtonElement>('.tile')!.click();
  return root;
}
describe('sphere explorer', () => {
  it('activates the selected sphere region so its questions can be reached immediately by keyboard', () => {
    const root = open();
    const panel = root.querySelector<HTMLElement>('.sphere-detail')!;
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe('Роли');
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(panel);
  });
  it('lists every original question, then expands the wording and owned answers', () => {
    const root = open();
    expect(root.querySelector('.detail-head')!.textContent).toContain('5 вопросов');
    const details = root.querySelector<HTMLDetailsElement>('[data-question-id="ordinary"]')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toContain('совпадаете');
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('Полный вопрос ordinary');
    expect(details.querySelector('[data-participant="a"]')!.textContent).toBe('АняПервый');
    expect(details.querySelector('[data-participant="b"]')!.textContent).toBe('БорисПервый');
    expect(root.querySelector<HTMLElement>('.sphere-detail')!.hidden).toBe(false);
  });
  it('keeps four funding categories neutral and displays the chosen category', () => {
    const root = open();
    const details = root.querySelector('[data-question-id="funding"]')!;
    expect(details.querySelector('.lvl')!.textContent).toBe('Без оценки');
    expect(details.className).not.toMatch(/same|opposite|apart/);
    expect(details.textContent).toContain('Роли меняются');
    expect(details.textContent).not.toMatch(/расстояние|совпадаете|противоположно/);
  });
  it('shows the source wording and actual other-person habit for cross comparisons', () => {
    const a = profile('Аня'), b = profile('Борис');
    b.responses.habit = answerFor(10);
    const details = open(questions, a, b).querySelector('[data-question-id="cross"]')!;
    expect(details.querySelector('summary')!.textContent).not.toContain('совпадаете');
    expect(details.textContent).toContain('Полный вопрос habit');
    expect(details.querySelector('.cross-source [data-participant="b"]')!.textContent).toBe('БорисПятый');
  });
  it('does not invent missing or invalid answers and renders user text safely', () => {
    const a = profile('<img src=x onerror=alert(1)>');
    a.responses.ordinary = answerFor(NaN);
    a.responses.funding = 'skipped';
    const root = open(questions, a);
    expect(root.querySelector('[data-question-id="ordinary"] [data-participant="a"]')!.textContent).toContain('Ответ недоступен');
    expect(root.querySelector('[data-question-id="funding"]')!.textContent).toContain('Вопрос пропущен');
    expect(root.querySelector('[data-question-id="missing"]')!.textContent).toContain('Нет ответа');
    expect(root.querySelector('img')).toBeNull();
  });
  it('includes typed cross items from another sphere and uses their actual evaluation labels', () => {
    const cross = q('cross', { sphere: 'attachment', relationshipRule: { kind: 'closeness_cross', sourceId: 'habit', sourceLevels: [0, 0, 0, 0, 1], sphere: 'roles' } });
    const typedTiles: SphereTile[] = [{ ...tiles[0], items: [{ id: 'cross', topic: cross.topic, match: 1, kind: 'interaction' }, { id: 'ordinary', topic: 'Действие', match: 1, kind: 'behavior' }] }];
    const root = sphereExplorer(typedTiles, [cross, q('habit', { sphere: 'habits', scored: false }), q('ordinary')], profile('Аня'), profile('Борис'));
    root.querySelector<HTMLButtonElement>('.tile')!.click();
    expect(root.querySelector('[data-question-id="cross"] summary')!.textContent).toContain('реакции сочетаются');
    expect(root.querySelector('[data-question-id="ordinary"] summary')!.textContent).toContain('конструктивный подход');
    expect(root.querySelector('[data-question-id="cross"]')!.textContent).toContain('Полный вопрос habit');
    expect(root.querySelector('.sphere-detail')!.textContent).not.toContain('совпадаете');
  });
  it('places the panel after a complete grid row and ignores pointer hover', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...tiles[0], id: `tile${i}` }));
    const root = sphereExplorer(many);
    const buttons = root.querySelectorAll<HTMLButtonElement>('.tile');
    buttons[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(root.querySelector<HTMLElement>('.sphere-detail')!.hidden).toBe(true);
    buttons[0].click();
    expect(buttons[3].nextElementSibling).toBe(root.querySelector('.sphere-detail'));
    buttons[4].click();
    expect(buttons[5].nextElementSibling).toBe(root.querySelector('.sphere-detail'));
  });
  it('closes by button or Escape, restores focus and supports repeated selection', () => {
    const root = open();
    const buttons = root.querySelectorAll<HTMLButtonElement>('.tile');
    root.querySelector<HTMLButtonElement>('.sphere-detail-close')!.click();
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].click();
    root.querySelector('summary')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector<HTMLElement>('.sphere-detail')!.hidden).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].click(); buttons[1].click();
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    buttons[1].click();
    expect(root.querySelector<HTMLElement>('.sphere-detail')!.hidden).toBe(true);
  });
});
