import type { Manifest } from '../codec/codec';
import type { Question } from '../types';

/** cyrb53 — короткий хеш строки без зависимостей; для отпечатков выпущенных версий, не для безопасности. */
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Отпечаток манифеста и отметок «не обсуждается» версии — то, по чему ссылка раскладывает ответы. */
export const manifestPrint = (manifest: Manifest, firm: Manifest, v: number) => hash(JSON.stringify({ ids: manifest[v], firm: firm[v] ?? [] }));

/** Отпечаток содержимого вопросов: текст, варианты, сфера, отметки. */
export const bankPrint = (questions: Question[]) =>
  hash(JSON.stringify(questions.map((q) => [q.id, q.block, q.sphere, q.text, q.options, q.optional, q.firm ?? false, q.scored ?? true])));
