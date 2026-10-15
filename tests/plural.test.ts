import { describe, it, expect } from 'vitest';
import { plural } from '../src/ui/plural';

const MIN: [string, string, string] = ['минута', 'минуты', 'минут'];

describe('plural', () => {
  it.each([
    [1, '1 минута'], [2, '2 минуты'], [5, '5 минут'], [11, '11 минут'], [14, '14 минут'],
    [21, '21 минута'], [22, '22 минуты'], [45, '45 минут'], [111, '111 минут'],
  ])('%i', (n, expected) => {
    expect(plural(n, MIN)).toBe(expected);
  });
});
