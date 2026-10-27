import { describe, it, expect } from 'vitest';
import { flagsLine, matchLevel, sphereDetail, sphereTiles, supportTopics, tileTone } from '../src/ui/result-view';
import type { ItemRef, ModeResult } from '../src/scoring/compare';

const ref = (id: string): ItemRef => ({ id, topic: `тема ${id}`, sphere: 's' });
const mode = (over: Partial<ModeResult> = {}): ModeResult => ({
  percent: 80, spheres: [], redFlags: [], superMatches: [], strongMatches: [], talkZones: [],
  superCount: 0, flexibleCount: 0, ...over,
});

describe('sphereTiles', () => {
  it('сортирует от лучшей сферы к худшей, «не принципиально» — в конце, неизвестные сферы пропускает', () => {
    const tiles = sphereTiles([
      { sphere: 'budget', percent: 40, items: [] }, { sphere: 'kids', percent: null, items: [] },
      { sphere: 'humor', percent: 95, items: [] }, { sphere: 'nope', percent: 50, items: [] },
    ]);
    expect(tiles.map((t) => t.id)).toEqual(['humor', 'budget', 'kids']);
    expect(tiles[0]).toEqual({ id: 'humor', label: 'Юмор', percent: 95, items: [] });
  });
});

describe('tileTone', () => {
  it.each([[100, 5], [90, 5], [89.9, 4], [75, 4], [60, 3], [45, 2], [30, 1], [29, 0], [0, 0], [null, -1]])(
    '%s → %i', (p, tone) => expect(tileTone(p as number | null)).toBe(tone),
  );
});

describe('supportTopics', () => {
  it('сначала супер-, потом сильные совпадения, без повторов, все', () => {
    const m = mode({ superMatches: [ref('a'), ref('b')], strongMatches: [ref('b'), ref('c'), ref('d'), ref('e'), ref('f')] });
    expect(supportTopics(m)).toEqual(['тема a', 'тема b', 'тема c', 'тема d', 'тема e', 'тема f']);
  });
});

describe('flagsLine', () => {
  it('склоняет и пропускает нули', () => {
    expect(flagsLine(mode({ superCount: 4, redFlags: [ref('x')] }))).toBe('🌟 4 супер-совпадения · 🔴 1 красный флаг');
    expect(flagsLine(mode({ superCount: 1 }))).toBe('🌟 1 супер-совпадение');
    expect(flagsLine(mode({ redFlags: [ref('x'), ref('y'), ref('z'), ref('w'), ref('v')] }))).toBe('🔴 5 красных флагов');
    expect(flagsLine(mode())).toBeNull();
  });
});

describe('matchLevel', () => {
  it.each([[1, 'same'], [0.95, 'same'], [0.9, 'same'], [0.75, 'close'], [0.35, 'apart'], [0.1, 'apart'], [0, 'opposite']])(
    '%f → %s', (m, level) => expect(matchLevel(m as number)).toBe(level),
  );
});

describe('sphereDetail', () => {
  it('сначала расхождения, совпадения в конце; подписи по-русски', () => {
    const d = sphereDetail([
      { id: 'a', topic: 'А', match: 1 }, { id: 'b', topic: 'Б', match: 0 }, { id: 'c', topic: 'В', match: 0.5 },
    ]);
    expect(d.map((x) => x.topic)).toEqual(['Б', 'В', 'А']);
    expect(d.map((x) => x.label)).toEqual(['противоположно', 'по-разному', 'совпадаете']);
  });
});
