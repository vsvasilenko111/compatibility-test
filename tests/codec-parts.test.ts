import { describe, it, expect } from 'vitest';
import { BitReader, BitWriter } from '../src/codec/bits';
import { crc16 } from '../src/codec/crc16';
import { fromBase64Url, toBase64Url } from '../src/codec/base64url';

describe('bits', () => {
  it('записывает и читает поля произвольной ширины', () => {
    const w = new BitWriter();
    w.write(10, 4); w.write(3, 2); w.write(255, 8); w.write(1, 1);
    const r = new BitReader(w.finish());
    expect([r.read(4), r.read(2), r.read(8), r.read(1)]).toEqual([10, 3, 255, 1]);
  });
  it('чтение за пределами данных бросает RangeError', () => {
    expect(() => new BitReader(new Uint8Array([1])).read(9)).toThrow(RangeError);
  });
});

describe('crc16', () => {
  it('CCITT-FALSE: "123456789" → 0x29B1', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });
});

describe('base64url', () => {
  it('прямой и обратный проход без + / =', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const s = toBase64Url(bytes);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(s)).toEqual(bytes);
  });
  it('недопустимые символы → ошибка', () => {
    expect(() => fromBase64Url('ab+c')).toThrow();
  });
});
