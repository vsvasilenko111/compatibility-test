import { SPHERES } from '../questions/spheres';
import type { ModeResult, SphereScore } from '../scoring/compare';
import { plural } from './plural';

export interface SphereTile { id: string; label: string; percent: number | null }

export const SUPPORT_LIMIT = 5;

/** Плитки карты сфер: от лучшей к худшей, «не принципиально» (null) — в конце. */
export function sphereTiles(spheres: SphereScore[]): SphereTile[] {
  const labels = new Map(SPHERES.map((s) => [s.id, s.label]));
  return spheres
    .filter((s) => labels.has(s.sphere))
    .map((s) => ({ id: s.sphere, label: labels.get(s.sphere)!, percent: s.percent }))
    .sort((x, y) => (y.percent ?? -1) - (x.percent ?? -1));
}

/** Оттенок плитки: 5 — сильное совпадение … 0 — расхождение, −1 — «не принципиально». */
export function tileTone(percent: number | null): number {
  if (percent === null) return -1;
  for (const [min, tone] of [[90, 5], [75, 4], [60, 3], [45, 2], [30, 1]] as const) {
    if (percent >= min) return tone;
  }
  return 0;
}

/** «Ваша опора»: супер-совпадения, затем сильные, без повторов. */
export function supportTopics(m: ModeResult): string[] {
  const topics = [...m.superMatches, ...m.strongMatches].map((i) => i.topic);
  return [...new Set(topics)].slice(0, SUPPORT_LIMIT);
}

/** Строка на постере: «🌟 4 супер-совпадения · 🔴 1 красный флаг»; null, если показать нечего. */
export function flagsLine(m: ModeResult): string | null {
  const parts = [
    m.superCount ? `🌟 ${plural(m.superCount, ['супер-совпадение', 'супер-совпадения', 'супер-совпадений'])}` : '',
    m.redFlags.length ? `🔴 ${plural(m.redFlags.length, ['красный флаг', 'красных флага', 'красных флагов'])}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
