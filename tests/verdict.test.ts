import { describe, it, expect } from 'vitest';
import { verdict } from '../src/ui/verdict';
import type { CompareResult, ModeResult } from '../src/scoring/compare';

const mode = (percent: number | null, reds = 0): ModeResult => ({
  percent, spheres: [], superMatches: [], strongMatches: [], talkZones: [], superCount: 0, flexibleCount: 0,
  redFlags: Array.from({ length: reds }, (_, i) => ({ id: `r${i}`, topic: 't', sphere: 's' })),
});
const r = (rel: number | null, fr: number | null, reds = 0): CompareResult => ({
  relationship: mode(rel, reds), friendship: mode(fr),
});

describe('verdict', () => {
  it('красные флаги важнее процентов', () => {
    expect(verdict(r(90, 90, 1))).toMatch(/красных флагов/);
  });
  it('высоко и там и там', () => {
    expect(verdict(r(80, 85))).toBe('Вы совпадаете и как пара, и как друзья.');
  });
  it('дружба заметно выше отношений', () => {
    expect(verdict(r(55, 85))).toMatch(/легко вместе/);
  });
  it('средний результат', () => {
    expect(verdict(r(65, 70))).toMatch(/Хорошая основа/);
  });
  it('низкий результат', () => {
    expect(verdict(r(40, 45))).toMatch(/во многом разные/);
  });
  it('null трактуется как «не мешает»', () => {
    expect(verdict(r(null, null))).toBe('Вы совпадаете и как пара, и как друзья.');
  });
});
