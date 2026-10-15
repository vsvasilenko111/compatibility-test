export type Route =
  | { kind: 'start'; quick: boolean }
  | { kind: 'invite'; a: string; quick: boolean }
  | { kind: 'result'; a: string; b: string; quick: boolean };

/** Мессенджеры добавляют к ссылке точки, скобки и переносы — оставляем только алфавит base64url. */
const clean = (s: string | null) => (s ?? '').replace(/[^A-Za-z0-9_-]/g, '');

function decode(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

/**
 * Формат ссылок: `#i.<код>` — приглашение, `#r.<код A>.<код B>` — результат, `#q` — быстрый режим (5 вопросов);
 * приставка `q` у i/r сохраняет быстрый режим. Только [A-Za-z0-9._-]: иначе метка не доходит до страницы Artifact.
 * Старый формат `#a=…&b=…` тоже разбирается.
 */
export function parseHash(hash: string): Route {
  const raw = decode(hash.replace(/^#/, ''));
  if (raw.includes('=')) {
    const params = new URLSearchParams(raw);
    const a = clean(params.get('a'));
    const b = clean(params.get('b'));
    if (a && b) return { kind: 'result', a, b, quick: false };
    if (a) return { kind: 'invite', a, quick: false };
    return { kind: 'start', quick: false };
  }
  const [head = '', ...rest] = raw.split('.');
  const parts = rest.map(clean).filter(Boolean);
  const quick = head.startsWith('q');
  const tag = quick ? head.slice(1) : head;
  if (tag === 'r' && parts.length >= 2) return { kind: 'result', a: parts[0], b: parts[1], quick };
  if ((tag === 'i' || tag === 'r') && parts.length >= 1) return { kind: 'invite', a: parts[0], quick };
  return { kind: 'start', quick: tag === '' && quick };
}

const prefix = (quick: boolean) => (quick ? 'q' : '');
export const inviteHash = (a: string, quick: boolean) => `${prefix(quick)}i.${a}`;
export const resultHash = (a: string, b: string, quick: boolean) => `${prefix(quick)}r.${a}.${b}`;
export const inviteUrl = (base: string, a: string, quick: boolean) => `${base}#${inviteHash(a, quick)}`;
export const resultUrl = (base: string, a: string, b: string, quick: boolean) => `${base}#${resultHash(a, b, quick)}`;

export function classifyInvite(code: string, ownCode: string | null): 'own' | 'foreign' {
  return ownCode !== null && code === ownCode ? 'own' : 'foreign';
}
