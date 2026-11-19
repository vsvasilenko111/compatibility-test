/**
 * Калибровка процентов совместимости: сырой балл compare() переводится в место среди случайных сочетаний.
 * 50% — середина синтетической выборки, 90% — выше примерно 9 из 10 сочетаний.
 * Таблицы — сырые баллы на процентилях 0, 5, …, 100: банк v18, партия 2,
 * 50 персонажей, ответы gpt-6.1-sol medium; все 25 × 25 = 625 равновероятных сочетаний.
 * Важные сферы выбраны персонажами. Сочетания используют общих людей и зависимы.
 * Исходы пар для шкалы не использованы. Источник: research/blind/metric/codex-v18-b2-calibration.json.
 * При появлении реальных данных пересчитать.
 */
export const RELATIONSHIP_TABLE: readonly number[] = [56.8,66.1,67.8,69.2,69.9,70.7,71.4,71.9,72.5,73.2,73.8,74.5,75.2,75.8,76.6,77.3,78.1,78.7,79.6,81.4,87.4];
export const FRIENDSHIP_TABLE: readonly number[] = [56.4,63.5,65.3,66.7,68.2,69.6,70.3,71.3,72.1,72.9,73.7,74.4,75.1,75.9,76.9,77.5,78.4,79.1,80.3,82.4,85.2];

/** Сырой процент → откалиброванный 0..100 (линейная интерполяция между процентилями таблицы). */
export function calibrate(raw: number | null, table: readonly number[]): number | null {
  if (raw === null) return null;
  const last = table.length - 1;
  if (raw <= table[0]) return 0;
  if (raw >= table[last]) return 100;
  for (let i = 1; i <= last; i++) {
    if (raw <= table[i]) {
      const span = table[i] - table[i - 1];
      const t = span > 0 ? (raw - table[i - 1]) / span : 1;
      return ((i - 1 + t) / last) * 100;
    }
  }
  return 100;
}
