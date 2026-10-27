// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { prioritiesScreen } from '../src/ui/screens/priorities';
import { PRIORITY_SPHERES } from '../src/questions/spheres';
import { QUESTIONS } from '../src/questions';

const setup = () => {
  const onDone = vi.fn();
  const onBack = vi.fn();
  const el = prioritiesScreen({ questions: QUESTIONS, onBack, onDone });
  const chip = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.textContent === label)!;
  const button = (text: string) => [...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent === text);
  const labels = PRIORITY_SPHERES.map((s) => s.label);
  return { el, onDone, onBack, chip, button, labels };
};

describe('экран важных сфер', () => {
  it('показывает все 18 сфер; «Готово» только при ровно 5 выбранных, шестую выбрать нельзя', () => {
    const s = setup();
    expect(s.el.querySelectorAll('.chip')).toHaveLength(18);
    s.labels.slice(0, 4).forEach((l) => s.chip(l).click());
    expect(s.button('Готово')).toBeUndefined();
    s.chip(s.labels[4]).click();
    expect(s.button('Готово')).toBeDefined();
    expect(s.chip(s.labels[5]).disabled).toBe(true);
  });

  it('под каждой сферой — её вопросы', () => {
    const s = setup();
    const cards = [...s.el.querySelectorAll('.sphere-card')];
    PRIORITY_SPHERES.forEach((sp, i) => {
      const texts = [...cards[i].querySelectorAll('.sphere-questions li')].map((li) => li.textContent);
      expect(texts).toEqual(QUESTIONS.filter((q) => q.sphere === sp.id).map((q) => q.text));
    });
  });

  it('«Готово» отдаёт 5 важных сфер; «Назад» — к вопросам', () => {
    const s = setup();
    s.labels.slice(0, 5).forEach((l) => s.chip(l).click());
    s.button('Готово')!.click();
    expect(s.onDone).toHaveBeenCalledWith(Object.fromEntries(PRIORITY_SPHERES.slice(0, 5).map((x) => [x.id, 'top'])));
    s.button('Назад')!.click();
    expect(s.onBack).toHaveBeenCalled();
  });
});
