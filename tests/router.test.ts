import { describe, it, expect } from 'vitest';
import { classifyInvite, inviteUrl, parseHash, resultUrl } from '../src/router';

describe('router', () => {
  it.each([
    ['', { kind: 'start' }],
    ['#', { kind: 'start' }],
    ['#b=xyz', { kind: 'start' }],
    ['#a=abc', { kind: 'invite', a: 'abc' }],
    ['#a=abc&b=d_e-f', { kind: 'result', a: 'abc', b: 'd_e-f' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('отбрасывает мусор от мессенджеров: точку, скобку, перенос строки', () => {
    expect(parseHash('#a=abc).')).toEqual({ kind: 'invite', a: 'abc' });
    expect(parseHash('#a=ab%0Acd')).toEqual({ kind: 'invite', a: 'abcd' });
    expect(parseHash('#a=abc&b=def%20')).toEqual({ kind: 'result', a: 'abc', b: 'def' });
  });

  it('строит ссылки, которые парсятся обратно', () => {
    const base = 'https://example.github.io/compat/';
    expect(parseHash(new URL(inviteUrl(base, 'A1')).hash)).toEqual({ kind: 'invite', a: 'A1' });
    expect(parseHash(new URL(resultUrl(base, 'A1', 'B2')).hash)).toEqual({ kind: 'result', a: 'A1', b: 'B2' });
  });

  it('своя ссылка распознаётся', () => {
    expect(classifyInvite('abc', 'abc')).toBe('own');
    expect(classifyInvite('abc', 'xyz')).toBe('foreign');
    expect(classifyInvite('abc', null)).toBe('foreign');
  });
});
