import { describe, it, expect } from 'vitest';
import {
  canChooseCritical, criticalCount, draftFrom, emptyDraft, setImportance, setValue, tapRange, toAnswer,
} from '../src/ui/answer-logic';
import type { Response } from '../src/types';

describe('answer-logic', () => {
  it('выбор ответа ставит диапазон ±2 с обрезкой', () => {
    expect(setValue(emptyDraft(), 5)).toMatchObject({ value: 5, lo: 3, hi: 7 });
    expect(setValue(emptyDraft(), 1)).toMatchObject({ value: 1, lo: 0, hi: 3 });
    expect(setValue(emptyDraft(), 10)).toMatchObject({ value: 10, lo: 8, hi: 10 });
  });

  it('тап левее ответа двигает lo, правее — hi, по ответу — сжимает до точки', () => {
    const d = setValue(emptyDraft(), 5);
    expect(tapRange(d, 1)).toMatchObject({ lo: 1, hi: 7 });
    expect(tapRange(d, 9)).toMatchObject({ lo: 3, hi: 9 });
    expect(tapRange(d, 5)).toMatchObject({ lo: 5, hi: 5 });
  });

  it('тап по диапазону без ответа ничего не меняет', () => {
    expect(tapRange(emptyDraft(), 3)).toEqual(emptyDraft());
  });

  it('ответ готов только при выбранных значении и важности', () => {
    const d = setValue(emptyDraft(), 7);
    expect(toAnswer(d)).toBeNull();
    expect(toAnswer(setImportance(emptyDraft(), 2))).toBeNull();
    expect(toAnswer(setImportance(d, 2))).toEqual({ value: 7, lo: 5, hi: 9, importance: 2 });
  });

  it('черновик восстанавливается из сохранённого ответа; skipped → пустой', () => {
    expect(draftFrom({ value: 2, lo: 0, hi: 4, importance: 1 })).toEqual({ value: 2, lo: 0, hi: 4, importance: 1 });
    expect(draftFrom('skipped')).toEqual(emptyDraft());
    expect(draftFrom(undefined)).toEqual(emptyDraft());
  });

  it('считает «критично» без текущего вопроса и держит лимит 12', () => {
    const responses: Record<string, Response> = {
      a: { value: 1, lo: 0, hi: 2, importance: 3 },
      b: { value: 1, lo: 0, hi: 2, importance: 3 },
      c: { value: 1, lo: 0, hi: 2, importance: 2 },
      d: 'skipped',
    };
    expect(criticalCount(responses, 'x')).toBe(2);
    expect(criticalCount(responses, 'a')).toBe(1);
    expect(canChooseCritical(11)).toBe(true);
    expect(canChooseCritical(12)).toBe(false);
  });
});
