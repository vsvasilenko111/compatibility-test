import { toBase64Url } from './codec/base64url';
import { crc16 } from './codec/crc16';

/**
 * Согласие показать свои ответы партнёру — метка в ссылке результата (`#r.<A>.<B>.<метка>…`).
 * Метку ставит только тот, кто проходил тест на этом устройстве (его код совпадает с одним из кодов результата).
 * Защиты от подделки нет, как и у самих кодов: это знак согласия, а не шифрование.
 */
export function openToken(code: string): string {
  const crc = crc16(new TextEncoder().encode(`open:${code}`));
  return `o${toBase64Url(new Uint8Array([crc >> 8, crc & 0xff]))}`;
}

export const hasOpened = (code: string, tokens: readonly string[]): boolean => tokens.includes(openToken(code));
