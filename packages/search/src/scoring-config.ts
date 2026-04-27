/**
 * Centralized scoring configuration — single source of truth for hand-tuned
 * search scoring coefficients.
 *
 * All values default to current production magic numbers (preserves behavior).
 * Override any value via SEEKU_SCORING_* environment variables to A/B without
 * a redeploy — useful before we have telemetry-driven calibration.
 *
 * Once we collect feedback telemetry (see diagnostic 2026-04-26 P2), this
 * module is the natural seam for plugging in a learned weight loader.
 *
 * @module search/scoring-config
 */

function envNumber(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (raw == null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const SCORING_CONFIG = {
  retriever: {
    keywordWeight: envNumber("SEEKU_SCORING_KEYWORD_WEIGHT", 0.4),
    vectorWeight: envNumber("SEEKU_SCORING_VECTOR_WEIGHT", 0.6),
    keywordThreshold: envNumber("SEEKU_SCORING_KEYWORD_THRESHOLD", 0.08),
    boost: {
      role: envNumber("SEEKU_SCORING_BOOST_ROLE", 0.08),
      skill: envNumber("SEEKU_SCORING_BOOST_SKILL", 0.12),
      skillText: envNumber("SEEKU_SCORING_BOOST_SKILL_TEXT", 0.10),
      leadership: envNumber("SEEKU_SCORING_BOOST_LEADERSHIP", 0.08),
      openSource: envNumber("SEEKU_SCORING_BOOST_OPEN_SOURCE", 0.18),
      githubSource: envNumber("SEEKU_SCORING_BOOST_GITHUB_SOURCE", 0.06),
      specializedGithub: envNumber("SEEKU_SCORING_BOOST_SPECIALIZED_GITHUB", 0.12),
      exactName: envNumber("SEEKU_SCORING_BOOST_EXACT_NAME", 0.45),
      prefixName: envNumber("SEEKU_SCORING_BOOST_PREFIX_NAME", 0.18)
    },
    specializedBlend: {
      withoutSourceBias: {
        keyword: envNumber("SEEKU_SCORING_SPECIALIZED_NO_BIAS_KEYWORD", 0.85),
        vector: envNumber("SEEKU_SCORING_SPECIALIZED_NO_BIAS_VECTOR", 0.15)
      },
      withSourceBias: {
        keyword: envNumber("SEEKU_SCORING_SPECIALIZED_BIASED_KEYWORD", 0.58),
        vector: envNumber("SEEKU_SCORING_SPECIALIZED_BIASED_VECTOR", 0.42)
      }
    }
  },
  reranker: {
    projectMatchBoost: envNumber("SEEKU_SCORING_PROJECT_MATCH", 0.08),
    repoMatchBoost: envNumber("SEEKU_SCORING_REPO_MATCH", 0.04),
    followerBoostScale: envNumber("SEEKU_SCORING_FOLLOWER_SCALE", 0.02),
    freshnessDecayDays: envNumber("SEEKU_SCORING_FRESHNESS_DAYS", 365),
    crossEncoderWeight: envNumber("SEEKU_SCORING_CROSS_ENCODER_WEIGHT", 0.3),
    specializedGithubBoost: envNumber("SEEKU_SCORING_SPECIALIZED_GITHUB", 0.12),
    specializedGithubRepoBoost: envNumber("SEEKU_SCORING_SPECIALIZED_GITHUB_REPO", 0.08),
    openSourceGithubBoost: envNumber("SEEKU_SCORING_OPEN_SOURCE_GITHUB", 0.12),
    openSourceTextBoost: envNumber("SEEKU_SCORING_OPEN_SOURCE_TEXT", 0.08),
    techLeadBoost: envNumber("SEEKU_SCORING_TECH_LEAD", 0.08),
    universityFocusBoost: envNumber("SEEKU_SCORING_UNIVERSITY_FOCUS", 0.18),
    universityManualSeedBoost: envNumber("SEEKU_SCORING_UNIVERSITY_MANUAL_SEED", 0.24),
    strongVectorThreshold: envNumber("SEEKU_SCORING_STRONG_VECTOR", 0.75),
    strongKeywordThreshold: envNumber("SEEKU_SCORING_STRONG_KEYWORD", 0.5)
  },
  pipeline: {
    crossEncoderLimit: envNumber("SEEKU_SCORING_CROSS_ENCODER_LIMIT", 15),
    retrievalLimit: envNumber("SEEKU_SCORING_RETRIEVAL_LIMIT", 100)
  }
} as const;

export type ScoringConfig = typeof SCORING_CONFIG;
