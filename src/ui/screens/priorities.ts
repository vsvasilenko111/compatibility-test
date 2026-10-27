import { PRIORITY_LOW, PRIORITY_SPHERES, PRIORITY_TOP } from '../../questions/spheres';
import type { Priority } from '../../types';
import { h } from '../dom';

export interface PrioritiesScreenProps {
  /** Прежний выбор — при возврате на экран. */
  initial?: Record<string, Priority>;
  onBack: (() => void) | null;
  onDone(priorities: Record<string, Priority>): void;
}

const STEPS = {
  top: {
    title: 'Что для вас важнее всего в отношениях?',
    hint: `Выберите ${PRIORITY_TOP} сфер — совпадение в них будет весить для вас вдвое больше.`,
    need: PRIORITY_TOP,
  },
  low: {
    title: 'А что для вас менее важно?',
    hint: `Выберите ${PRIORITY_LOW} сферы — расхождение в них будет весить для вас вдвое меньше.`,
    need: PRIORITY_LOW,
  },
} as const;

/** Два шага после вопросов: 5 самых важных сфер, затем 3 наименее важных из оставшихся. */
export function prioritiesScreen(p: PrioritiesScreenProps): HTMLElement {
  const root = h('section', { class: 'screen priorities' });
  const picked: Record<Priority, Set<string>> = {
    top: new Set(Object.keys(p.initial ?? {}).filter((s) => p.initial![s] === 'top')),
    low: new Set(Object.keys(p.initial ?? {}).filter((s) => p.initial![s] === 'low')),
  };
  let step: Priority = 'top';

  function draw() {
    const cfg = STEPS[step];
    const mine = picked[step];
    const full = mine.size >= cfg.need;
    root.replaceChildren(
      h('h2', {}, cfg.title),
      h('p', { class: 'hint' }, cfg.hint),
      h('div', { class: 'chips', role: 'group' },
        ...PRIORITY_SPHERES.map((s) => {
          const on = mine.has(s.id);
          // На втором шаге уже выбранные важными сферы видны, но недоступны.
          const taken = step === 'low' && picked.top.has(s.id);
          return h('button', {
            type: 'button',
            class: `chip${on ? ' on' : ''}${taken ? ' taken' : ''}`,
            'aria-pressed': on ? 'true' : 'false',
            disabled: taken || (!on && full),
            onclick: () => {
              if (on) mine.delete(s.id);
              else mine.add(s.id);
              draw();
            },
          }, s.label);
        })),
      h('p', { class: 'hint' }, `Выбрано ${mine.size} из ${cfg.need}`),
      h('div', { class: 'nav' },
        step === 'low'
          ? h('button', { type: 'button', class: 'secondary', onclick: () => { step = 'top'; draw(); } }, 'Назад')
          : p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        mine.size === cfg.need
          ? h('button', { type: 'button', class: 'primary', onclick: next }, step === 'top' ? 'Дальше' : 'Готово')
          : null),
    );
  }

  function next() {
    if (step === 'top') {
      // Сфера могла попасть в «менее важные» раньше, а теперь стала важной.
      for (const s of picked.top) picked.low.delete(s);
      step = 'low';
      return draw();
    }
    const out: Record<string, Priority> = {};
    for (const s of picked.top) out[s] = 'top';
    for (const s of picked.low) out[s] = 'low';
    p.onDone(out);
  }

  draw();
  return root;
}
