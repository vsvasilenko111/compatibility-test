// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { prioritiesScreen } from '../src/ui/screens/priorities';
import { PRIORITY_SPHERES } from '../src/questions/spheres';

const setup = () => {
  const onDone = vi.fn();
  const onBack = vi.fn();
  const el = prioritiesScreen({ onBack, onDone });
  const chip = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.textContent === label)!;
  const button = (text: string) => [...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent === text);
  const labels = PRIORITY_SPHERES.map((s) => s.label);
  return { el, onDone, onBack, chip, button, labels };
};

describe('экран важных сфер', () => {
  it('показывает все 18 сфер; «Дальше» только при ровно 5 выбранных, шестую выбрать нельзя', () => {
    const s = setup();
    expect(s.el.querySelectorAll('.chip')).toHaveLength(18);
    s.labels.slice(0, 4).forEach((l) => s.chip(l).click());
    expect(s.button('Дальше')).toBeUndefined();
    s.chip(s.labels[4]).click();
    expect(s.button('Дальше')).toBeDefined();
    expect(s.chip(s.labels[5]).disabled).toBe(true);
  });

  it('второй шаг: важные недоступны, после 3 менее важных отдаёт выбор', () => {
    const s = setup();
    s.labels.slice(0, 5).forEach((l) => s.chip(l).click());
    s.button('Дальше')!.click();
    expect(s.chip(s.labels[0]).disabled).toBe(true);
    s.labels.slice(15, 18).forEach((l) => s.chip(l).click());
    s.button('Готово')!.click();
    const ids = PRIORITY_SPHERES.map((x) => x.id);
    expect(s.onDone).toHaveBeenCalledWith({
      ...Object.fromEntries(ids.slice(0, 5).map((id) => [id, 'top'])),
      ...Object.fromEntries(ids.slice(15, 18).map((id) => [id, 'low'])),
    });
  });

  it('«Назад» на втором шаге возвращает к первому с прежним выбором, на первом — к вопросам', () => {
    const s = setup();
    s.labels.slice(0, 5).forEach((l) => s.chip(l).click());
    s.button('Дальше')!.click();
    s.button('Назад')!.click();
    expect(s.chip(s.labels[0]).getAttribute('aria-pressed')).toBe('true');
    s.button('Назад')!.click();
    expect(s.onBack).toHaveBeenCalled();
  });
});
