-- Performance optimization: Add index on expires_at for cache lookup
-- This avoids full table scan when checking expired caches

CREATE INDEX IF NOT EXISTS idx_profile_cache_expires_at
ON profile_cache (expires_at);

-- Optional: Add index on overall_score for ranking queries
CREATE INDEX IF NOT EXISTS idx_profile_cache_score
ON profile_cache (overall_score DESC);