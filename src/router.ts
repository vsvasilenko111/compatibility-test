export type Route =
  | { kind: 'start' }
  | { kind: 'invite'; a: string }
  | { kind: 'result'; a: string; b: string };

/** Мессенджеры добавляют к ссылке точки, скобки и переносы — оставляем только алфавит base64url. */
const clean = (s: string | null) => (s ?? '').replace(/[^A-Za-z0-9_-]/g, '');

export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const a = clean(params.get('a'));
  const b = clean(params.get('b'));
  if (a && b) return { kind: 'result', a, b };
  if (a) return { kind: 'invite', a };
  return { kind: 'start' };
}

export const inviteUrl = (base: string, a: string) => `${base}#a=${a}`;
export const resultUrl = (base: string, a: string, b: string) => `${base}#a=${a}&b=${b}`;

export function classifyInvite(code: string, ownCode: string | null): 'own' | 'foreign' {
  return ownCode !== null && code === ownCode ? 'own' : 'foreign';
}
