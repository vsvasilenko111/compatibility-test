import { describe, it, expect } from 'vitest';
import { calibrate, FRIENDSHIP_TABLE, RELATIONSHIP_TABLE } from '../src/scoring/calibration';

describe('calibrate', () => {
  it('медиана случайных пар → 50%, края → 0 и 100', () => {
    expect(calibrate(RELATIONSHIP_TABLE[10], RELATIONSHIP_TABLE)).toBeCloseTo(50, 5);
    expect(calibrate(0, RELATIONSHIP_TABLE)).toBe(0);
    expect(calibrate(100, RELATIONSHIP_TABLE)).toBe(100);
    expect(calibrate(null, RELATIONSHIP_TABLE)).toBeNull();
  });
  it('монотонно: больше сырой процент — не меньше откалиброванный', () => {
    for (const table of [RELATIONSHIP_TABLE, FRIENDSHIP_TABLE]) {
      let prev = -1;
      for (let raw = 0; raw <= 100; raw += 0.5) {
        const c = calibrate(raw, table)!;
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });
  it('таблицы по возрастанию, по 21 точке', () => {
    for (const t of [RELATIONSHIP_TABLE, FRIENDSHIP_TABLE]) {
      expect(t).toHaveLength(21);
      expect([...t].sort((a, b) => a - b)).toEqual([...t]);
    }
  });
});
