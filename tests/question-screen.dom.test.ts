// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { questionScreen } from '../src/ui/screens/question';
import { answerFor } from '../src/answer';
import type { Question, Response } from '../src/types';

const base: Question = { id: 'k', block: 'relationship', sphere: 'kids', text: 't', left: 'l', right: 'r', topic: 'дети', optional: false };
afterEach(() => vi.useRealTimers());
const screen = (question: Question, response?: Response) => {
  const onSubmit = vi.fn();
  const el = questionScreen({ question, index: 0, total: 1, response, onBack: null, onSubmit });
  const cell = (i: number) => el.querySelectorAll<HTMLButtonElement>('.scale .cell')[i];
  const next = () => [...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent === 'Дальше');
  return { el, onSubmit, cell, next };
};

describe('экран вопроса — обязательный ответ без дополнительных отметок', () => {
  it('при изменении ответа навигация ждёт отправки нового значения и не отправляет старое', () => {
    vi.useFakeTimers();
    const s = screen(base, answerFor(1));
    s.cell(9).click();
    expect(s.next()!.disabled).toBe(true);
    s.next()!.click();
    expect(s.onSubmit).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(s.onSubmit).toHaveBeenCalledTimes(1);
    expect(s.onSubmit).toHaveBeenCalledWith(answerFor(9));
  });
  it('у обычного вопроса отметки нет, тап по числу сразу отправляет ответ', () => {
    vi.useFakeTimers();
    const s = screen(base);
    expect(s.el.querySelector('.firm')).toBeNull();
    s.cell(8).click();
    vi.runAllTimers();
    expect(s.onSubmit).toHaveBeenCalledWith(answerFor(8));
    vi.useRealTimers();
  });

  it('старое поле firm не показывает отметку и не задерживает отправку выбранного ответа', () => {
    vi.useFakeTimers();
    const s = screen({ ...base, firm: true });
    expect(s.el.querySelector('input[type="checkbox"]')).toBeNull();
    s.cell(9).click();
    vi.runAllTimers();
    expect(s.onSubmit).toHaveBeenCalledWith(answerFor(9));
    vi.useRealTimers();
  });

  it('при возврате к старому ответу сохраняется значение без отметки firm', () => {
    const s = screen({ ...base, firm: true }, { ...answerFor(1), firm: true });
    expect(s.el.querySelector('input[type="checkbox"]')).toBeNull();
    s.next()!.click();
    expect(s.onSubmit).toHaveBeenCalledWith(answerFor(1));
  });

  it('даже старый optional-вопрос нельзя пропустить или отправить без выбранного варианта', () => {
    const s = screen({ ...base, optional: true }, 'skipped');
    expect(s.el.textContent).not.toContain('Пропустить');
    expect(s.next()).toBeUndefined();
    expect(s.onSubmit).not.toHaveBeenCalled();
  });
});

describe('экран вопроса — 5 вариантов словами', () => {
  const opts: Question = { ...base, options: ['А', 'Скорее А', 'Середина', 'Скорее Б', 'Б'] };

  it('показывает варианты вместо шкалы; выбор отдаёт значение 0/3/5/7/10', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const el = questionScreen({ question: opts, index: 0, total: 1, response: undefined, onBack: null, onSubmit });
    expect(el.querySelector('.scale')).toBeNull();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.options .option')];
    expect(buttons.map((b) => b.textContent)).toEqual(opts.options);
    buttons[3].click();
    vi.runAllTimers();
    expect(onSubmit).toHaveBeenCalledWith(answerFor(7));
    vi.useRealTimers();
  });

  it('при возврате выбранный вариант подсвечен', () => {
    const el = questionScreen({ question: opts, index: 0, total: 1, response: answerFor(3), onBack: null, onSubmit: vi.fn() });
    expect(el.querySelector('.option.on')?.textContent).toBe('Скорее А');
  });
});
