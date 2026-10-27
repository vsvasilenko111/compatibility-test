import { describe, it, expect } from 'vitest';
import { BANK_VERSION, FIRM, MANIFEST, QUESTIONS } from '../src/questions';
import { bankPrint, manifestPrint } from '../src/questions/fingerprint';
import released from '../src/questions/released.json';

/**
 * Выпущенные версии банка неизменны: ссылка хранит ответы по порядку вопросов своей версии, поэтому любая правка
 * манифеста, отметок «не обсуждается» или самих вопросов под прежним номером молча переставляет чужие ответы.
 * Как выпустить правку банка: поднять version в bank.json, добавить манифест и отметки новой версии, а если поменялся
 * смысл вопросов при прежних id — поднять COMPATIBLE_SINCE. Затем записать отпечатки: npx vite-node scripts/release-bank.ts.
 */

describe('выпущенные версии банка не меняются', () => {
  const r = released as { manifests: Record<string, string>; bank: Record<string, string> };

  it.each(Object.keys(r.manifests))('манифест и отметки v%s — как при выпуске', (v) => {
    expect(manifestPrint(MANIFEST, FIRM, Number(v)), `v${v} изменена после выпуска — заведите новую версию`).toBe(r.manifests[v]);
  });

  it('текущая версия выпущена, и её вопросы не правились после выпуска', () => {
    expect(r.manifests[BANK_VERSION], `v${BANK_VERSION} не записана в released.json — npx vite-node scripts/release-bank.ts`).toBeDefined();
    expect(bankPrint(QUESTIONS), `вопросы v${BANK_VERSION} изменены без новой версии — поднимите version в bank.json`).toBe(r.bank[BANK_VERSION]);
  });
});
