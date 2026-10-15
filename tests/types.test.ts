import { describe, it, expect } from 'vitest';
import { IMPORTANCE_WEIGHTS, IMPORTANCE_LABELS, MAX_CRITICAL } from '../src/types';

describe('types', () => {
  it('веса важности 0/1/10/50 и 4 подписи', () => {
    expect(IMPORTANCE_WEIGHTS).toEqual([0, 1, 10, 50]);
    expect(IMPORTANCE_LABELS).toHaveLength(4);
    expect(MAX_CRITICAL).toBe(12);
  });
});
