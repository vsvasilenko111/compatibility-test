import { PRIORITY_SPHERES, PRIORITY_TOP } from '../../questions/spheres';
import type { Priority, Question } from '../../types';
import { h } from '../dom';

export interface PrioritiesScreenProps {
  /** Вопросы теста — у каждой сферы видно, о чём она. */
  questions: Question[];
  /** Прежний выбор — при возврате на экран. */
  initial?: Record<string, Priority>;
  onBack: (() => void) | null;
  onDone(priorities: Record<string, Priority>): void;
}

/** После вопросов: 5 самых важных сфер. Под каждой сферой раскрываются её вопросы. */
export function prioritiesScreen(p: PrioritiesScreenProps): HTMLElement {
  const root = h('section', { class: 'screen priorities' });
  const picked = new Set(Object.keys(p.initial ?? {}).filter((s) => p.initial![s] === 'top'));
  const bySphere = new Map(PRIORITY_SPHERES.map((s) => [s.id, p.questions.filter((q) => q.sphere === s.id)]));
  // Раскрытые списки вопросов переживают перерисовку.
  const opened = new Set<string>();

  function draw() {
    const full = picked.size >= PRIORITY_TOP;
    root.replaceChildren(
      h('h2', {}, 'Что для вас важнее всего в отношениях?'),
      h('p', { class: 'hint' }, `Выберите ${PRIORITY_TOP} сфер — совпадение в них будет весить для вас втрое больше. Нажмите «вопросы», чтобы увидеть, что входит в сферу.`),
      h('div', { class: 'sphere-pick', role: 'group' },
        ...PRIORITY_SPHERES.map((s) => {
          const on = picked.has(s.id);
          const qs = bySphere.get(s.id) ?? [];
          const details = h('details', { class: 'sphere-questions' },
            h('summary', {}, `вопросы · ${qs.length}`),
            h('ul', {}, ...qs.map((q) => h('li', {}, q.text))));
          details.open = opened.has(s.id);
          details.addEventListener('toggle', () => { if (details.open) opened.add(s.id); else opened.delete(s.id); });
          return h('div', { class: `sphere-card${on ? ' on' : ''}` },
            h('button', {
              type: 'button',
              class: `chip${on ? ' on' : ''}`,
              'aria-pressed': on ? 'true' : 'false',
              disabled: !on && full,
              onclick: () => {
                if (on) picked.delete(s.id);
                else picked.add(s.id);
                draw();
              },
            }, s.label),
            details);
        })),
      h('p', { class: 'hint' }, `Выбрано ${picked.size} из ${PRIORITY_TOP}`),
      h('div', { class: 'nav' },
        p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        picked.size === PRIORITY_TOP
          ? h('button', { type: 'button', class: 'primary', onclick: () => p.onDone(Object.fromEntries([...picked].map((s) => [s, 'top' as Priority]))) }, 'Готово')
          : null),
    );
  }

  draw();
  return root;
}
