import { answerFor } from '../answer';
import type { Answer, ImportanceLevel, Profile } from '../types';
import { fromBase64Url, toBase64Url } from './base64url';
import { BitReader, BitWriter } from './bits';
import { crc16 } from './crc16';

/** v2 — только ответ, 4 бита на вопрос (диапазон и важность выводятся из ответа). v1 — ответ, диапазон и важность; читается для старых ссылок. */
export const FORMAT_VERSION = 2;
const LEGACY_FORMAT = 1;
export const TEST_TYPE_RELATIONSHIP = 0;
export const MAX_NAME_BYTES = 40;
const SKIPPED = 15;

export type Manifest = Record<number, string[]>;
export type CodecErrorKind = 'corrupt' | 'unsupported-format' | 'unknown-bank';

export class CodecError extends Error {
  constructor(public readonly kind: CodecErrorKind) {
    super(kind);
    this.name = 'CodecError';
  }
}

const encoder = new TextEncoder();

/** Обрезает имя до MAX_NAME_BYTES байт UTF-8, не разрывая символы. */
export function truncateName(name: string): string {
  let out = '';
  for (const ch of Array.from(name.trim())) {
    if (encoder.encode(out + ch).length > MAX_NAME_BYTES) break;
    out += ch;
  }
  return out;
}

/** Фиксированная гамма xorshift32: скрывает содержимое, но не защищает его. */
function xorStream(bytes: Uint8Array): Uint8Array {
  let x = 0x9e3779b9;
  return bytes.map((b) => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return b ^ (x & 0xff);
  });
}

export function seal(body: Uint8Array): string {
  const crc = crc16(body);
  const full = new Uint8Array(body.length + 2);
  full.set(body);
  full[body.length] = crc >> 8;
  full[body.length + 1] = crc & 0xff;
  return toBase64Url(xorStream(full));
}

export function encode(profile: Profile, ids: string[]): string {
  const name = encoder.encode(truncateName(profile.name));
  const w = new BitWriter();
  w.write(FORMAT_VERSION, 8);
  w.write(profile.bankVersion, 8);
  w.write(TEST_TYPE_RELATIONSHIP, 8);
  w.write(name.length, 8);
  w.writeBytes(name);
  for (const id of ids) {
    const r = profile.responses[id];
    w.write(!r || r === 'skipped' ? SKIPPED : r.value, 4);
  }
  return seal(w.finish());
}

export function decode(code: string, manifest: Manifest): Profile {
  let full: Uint8Array;
  try {
    full = xorStream(fromBase64Url(code));
  } catch {
    throw new CodecError('corrupt');
  }
  if (full.length < 6) throw new CodecError('corrupt');
  const body = full.subarray(0, full.length - 2);
  const crc = (full[full.length - 2] << 8) | full[full.length - 1];
  if (crc16(body) !== crc) throw new CodecError('corrupt');

  try {
    const r = new BitReader(body);
    const format = r.read(8);
    if (format !== FORMAT_VERSION && format !== LEGACY_FORMAT) throw new CodecError('unsupported-format');
    const bankVersion = r.read(8);
    r.read(8); // тип теста — зарезервирован под «Друзья»
    const name = new TextDecoder().decode(r.readBytes(r.read(8)));
    const ids = manifest[bankVersion];
    if (!ids) throw new CodecError('unknown-bank');

    const responses: Profile['responses'] = {};
    for (const id of ids) {
      if (format === LEGACY_FORMAT) {
        const value = r.read(4), lo = r.read(4), hi = r.read(4), importance = r.read(2);
        if (value === SKIPPED) { responses[id] = 'skipped'; continue; }
        if (value > 10 || lo > 10 || hi > 10 || lo > hi) throw new CodecError('corrupt');
        const answer: Answer = { value, lo, hi, importance: importance as ImportanceLevel };
        responses[id] = answer;
      } else {
        const value = r.read(4);
        if (value === SKIPPED) { responses[id] = 'skipped'; continue; }
        if (value > 10) throw new CodecError('corrupt');
        responses[id] = answerFor(value);
      }
    }
    return { name, bankVersion, responses };
  } catch (e) {
    if (e instanceof CodecError) throw e;
    throw new CodecError('corrupt');
  }
}
