import { describe, it, expect } from 'vitest';
import { IMPORTANCE_WEIGHTS } from '../src/types';

describe('types', () => {
  it('веса важности 0/1/10/50', () => {
    expect(IMPORTANCE_WEIGHTS).toEqual([0, 1, 10, 50]);
  });
});
