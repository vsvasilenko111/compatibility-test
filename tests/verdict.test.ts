import { describe, it, expect } from 'vitest';
import { level, verdict } from '../src/ui/verdict';
import type { CompareResult, ModeResult } from '../src/scoring/compare';

const mode = (percent: number | null, reds = 0): ModeResult => ({
  percent, spheres: [], superMatches: [], strongMatches: [], talkZones: [], superCount: 0, flexibleCount: 0,
  redFlags: Array.from({ length: reds }, (_, i) => ({ id: `r${i}`, topic: 't', sphere: 's' })),
});
const r = (rel: number | null, fr: number | null, reds = 0): Pick<CompareResult, 'relationship' | 'friendship'> => ({
  relationship: mode(rel, reds), friendship: mode(fr),
});

describe('verdict', () => {
  it('красные флаги важнее процентов', () => {
    expect(verdict(r(90, 90, 1))).toMatch(/красных флагов/);
  });
  it('высоко и там и там', () => {
    expect(verdict(r(80, 85))).toBe('В ваших ответах много совпадений — и об отношениях, и о дружбе.');
  });
  it('дружба заметно выше отношений', () => {
    expect(verdict(r(55, 85))).toMatch(/повседневных вопросах/);
  });
  it('средний результат', () => {
    expect(verdict(r(65, 70))).toMatch(/В ответах есть совпадения/);
  });
  it('низкий результат', () => {
    expect(verdict(r(40, 45))).toMatch(/во многом разные/);
  });
  it('один null трактуется как «не мешает»', () => {
    expect(verdict(r(null, 90))).toBe('В ваших ответах много совпадений — и об отношениях, и о дружбе.');
  });
  it('оба null — темы не принципиальны', () => {
    expect(verdict(r(null, null))).toBe('Для вас обоих эти темы не принципиальны.');
  });
});

describe('level', () => {
  it('границы уровней', () => {
    expect([null, 0, 39.9, 40, 54.9, 55, 69.9, 70, 79.9, 80, 100].map(level)).toEqual(
      [null, 'сильные различия', 'сильные различия', 'много различий', 'много различий', 'частичное совпадение', 'частичное совпадение', 'заметное совпадение', 'заметное совпадение', 'много совпадений', 'много совпадений']);
  });
});
