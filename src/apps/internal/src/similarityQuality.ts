export const SIMILARITY_QUALITY_THRESHOLDS = {
  strong: 0.85,
  fair: 0.78,
} as const;

export type SimilarityQuality = 'strong' | 'fair' | 'weak' | 'unrated';

export interface SimilarityQualityBand {
  key: SimilarityQuality;
  label: string;
}

export function getSimilarityQuality(score: number | null): SimilarityQualityBand {
  if (score == null) return { key: 'unrated', label: 'Not rated' };
  if (score >= SIMILARITY_QUALITY_THRESHOLDS.strong) {
    return { key: 'strong', label: 'Strong match' };
  }
  if (score >= SIMILARITY_QUALITY_THRESHOLDS.fair) {
    return { key: 'fair', label: 'Fair match' };
  }
  return { key: 'weak', label: 'Weak match' };
}
