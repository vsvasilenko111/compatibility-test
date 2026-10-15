import { describe, it, expect } from 'vitest';
import { classifyInvite, inviteUrl, parseHash, resultHash, resultUrl } from '../src/router';

describe('router', () => {
  it.each([
    ['', { kind: 'start', quick: false }],
    ['#', { kind: 'start', quick: false }],
    ['#q', { kind: 'start', quick: true }],
    ['#i.abc', { kind: 'invite', a: 'abc', quick: false }],
    ['#qi.abc', { kind: 'invite', a: 'abc', quick: true }],
    ['#r.abc.d_e-f', { kind: 'result', a: 'abc', b: 'd_e-f', quick: false }],
    ['#qr.abc.def', { kind: 'result', a: 'abc', b: 'def', quick: true }],
    ['#r.abc', { kind: 'invite', a: 'abc', quick: false }],
    ['#x.abc', { kind: 'start', quick: false }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('старый формат #a=…&b=… тоже открывается', () => {
    expect(parseHash('#a=abc')).toEqual({ kind: 'invite', a: 'abc', quick: false });
    expect(parseHash('#a=abc&b=def')).toEqual({ kind: 'result', a: 'abc', b: 'def', quick: false });
    expect(parseHash('#b=xyz')).toEqual({ kind: 'start', quick: false });
  });

  it('отбрасывает мусор от мессенджеров: точку, скобку, перенос строки', () => {
    expect(parseHash('#i.abc).')).toEqual({ kind: 'invite', a: 'abc', quick: false });
    expect(parseHash('#i.ab%0Acd')).toEqual({ kind: 'invite', a: 'abcd', quick: false });
    expect(parseHash('#r.abc.def%20')).toEqual({ kind: 'result', a: 'abc', b: 'def', quick: false });
  });

  it('в ссылках только символы, которые доходят до страницы из ссылки на Artifact', () => {
    const base = 'https://claude.ai/code/artifact/x';
    for (const url of [inviteUrl(base, 'A1-_z', true), resultUrl(base, 'A1', 'B2', false)]) {
      expect(new URL(url).hash).toMatch(/^#[A-Za-z0-9._~-]+$/);
    }
  });

  it('строит ссылки, которые парсятся обратно', () => {
    const base = 'https://example.github.io/compat/';
    expect(parseHash(new URL(inviteUrl(base, 'A1', false)).hash)).toEqual({ kind: 'invite', a: 'A1', quick: false });
    expect(parseHash(new URL(resultUrl(base, 'A1', 'B2', true)).hash)).toEqual({ kind: 'result', a: 'A1', b: 'B2', quick: true });
    expect(parseHash('#' + resultHash('A1', 'B2', false))).toEqual({ kind: 'result', a: 'A1', b: 'B2', quick: false });
  });

  it('своя ссылка распознаётся', () => {
    expect(classifyInvite('abc', 'abc')).toBe('own');
    expect(classifyInvite('abc', 'xyz')).toBe('foreign');
    expect(classifyInvite('abc', null)).toBe('foreign');
  });
});
