export function normalizePercentScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  const percent = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, percent));
}

export function formatPercentScore(score: number, digits = 0): string {
  return `${normalizePercentScore(score).toFixed(digits)}%`;
}
