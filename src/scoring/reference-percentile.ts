/**
 * Relative position in a sorted reference, not a probability of success.
 * Observed scores use empirical midranks; gaps interpolate without rounding.
 * The reference is validated even when raw is null. Invalid inputs throw RangeError.
 */
export function referencePercentile(raw: number | null, samples: readonly number[]): number | null {
  if (samples.length < 2) throw new RangeError('Reference needs at least two scores');
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError('Reference scores must be finite and within 0..100');
    }
    if (i > 0 && value < samples[i - 1]) throw new RangeError('Reference must be sorted');
  }
  if (samples[0] === samples[samples.length - 1]) {
    throw new RangeError('Reference needs at least two distinct scores');
  }
  if (raw === null) return null;
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    throw new RangeError('Raw score must be finite and within 0..100');
  }
  if (raw < samples[0]) return 0;
  if (raw > samples[samples.length - 1]) return 100;

  let previousScore = samples[0];
  let previousRank = 0;
  for (let start = 0; start < samples.length;) {
    let end = start + 1;
    while (end < samples.length && samples[end] === samples[start]) end++;
    const score = samples[start];
    const rank = 100 * (start + 0.5 * (end - start)) / samples.length;
    if (raw === score) return rank;
    if (raw < score) {
      return previousRank + (raw - previousScore) / (score - previousScore) * (rank - previousRank);
    }
    previousScore = score;
    previousRank = rank;
    start = end;
  }
  return previousRank;
}
