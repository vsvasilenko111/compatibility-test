// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { questionScreen } from '../src/ui/screens/question';
import { answerFor } from '../src/answer';
import type { Question, Response } from '../src/types';

const base: Question = { id: 'k', block: 'relationship', sphere: 'kids', text: 't', left: 'l', right: 'r', topic: 'дети', optional: false };
const screen = (question: Question, response?: Response) => {
  const onSubmit = vi.fn();
  const el = questionScreen({ question, index: 0, total: 1, response, onBack: null, onSubmit });
  const cell = (i: number) => el.querySelectorAll<HTMLButtonElement>('.scale .cell')[i];
  const next = () => [...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent === 'Дальше');
  return { el, onSubmit, cell, next };
};

describe('экран вопроса — отметка «Для меня это не обсуждается»', () => {
  it('у обычного вопроса отметки нет, тап по числу сразу отправляет ответ', () => {
    vi.useFakeTimers();
    const s = screen(base);
    expect(s.el.querySelector('.firm')).toBeNull();
    s.cell(8).click();
    vi.runAllTimers();
    expect(s.onSubmit).toHaveBeenCalledWith(answerFor(8));
    vi.useRealTimers();
  });

  it('у вопроса с firm тап не переходит дальше; отметка уходит вместе с ответом', () => {
    const s = screen({ ...base, firm: true });
    s.cell(9).click();
    expect(s.onSubmit).not.toHaveBeenCalled();
    const box = s.el.querySelector<HTMLInputElement>('.firm input')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    s.next()!.click();
    expect(s.onSubmit).toHaveBeenCalledWith({ ...answerFor(9), firm: true });
  });

  it('при возврате отметка показана и сохраняется', () => {
    const s = screen({ ...base, firm: true }, { ...answerFor(1), firm: true });
    expect(s.el.querySelector<HTMLInputElement>('.firm input')!.checked).toBe(true);
    s.next()!.click();
    expect(s.onSubmit).toHaveBeenCalledWith({ ...answerFor(1), firm: true });
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
