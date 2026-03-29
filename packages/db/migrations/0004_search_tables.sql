-- Phase 3: Search tables for hybrid search (keyword + vector)
--
-- Vector dimension: 4096 (Qwen3-Embedding-8B from SiliconFlow)
--
-- IMPORTANT: HNSW index is NOT created because pgvector's HNSW
-- implementation has a maximum dimension limit of 2000. With 4096
-- dimensions, we use sequential scan for MVP. Future optimization
-- options:
--   1. Reduce dimensions to 1536 or less (loses embedding quality)
--   2. Use IVFFlat index (requires training data, good for larger datasets)
--   3. Wait for pgvector HNSW dimension limit increase
--
-- For MVP with small datasets (<10k documents), sequential scan is acceptable.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create search_documents table for keyword search
CREATE TABLE IF NOT EXISTS search_documents (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  doc_text TEXT NOT NULL,
  facet_role TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_location TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_source TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  rank_features JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create search_embeddings table for vector similarity search
-- Using 4096 dimensions for Qwen3-Embedding-8B
CREATE TABLE IF NOT EXISTS search_embeddings (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  embedding VECTOR(4096) NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension NUMERIC NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN index for pg_trgm keyword search on doc_text
CREATE INDEX IF NOT EXISTS idx_search_documents_doc_trgm
  ON search_documents USING GIN (doc_text gin_trgm_ops);

-- GIN indexes for array facets (role, location, source, tags)
CREATE INDEX IF NOT EXISTS idx_search_documents_facet_role
  ON search_documents USING GIN (facet_role);
CREATE INDEX IF NOT EXISTS idx_search_documents_facet_location
  ON search_documents USING GIN (facet_location);
CREATE INDEX IF NOT EXISTS idx_search_documents_facet_source
  ON search_documents USING GIN (facet_source);
CREATE INDEX IF NOT EXISTS idx_search_documents_facet_tags
  ON search_documents USING GIN (facet_tags);

-- Index on updated_at for freshness-based queries
CREATE INDEX IF NOT EXISTS idx_search_documents_updated_at
  ON search_documents (updated_at DESC);

-- Note: No ANN index (HNSW/IVFFlat) for search_embeddings due to 4096 dimension limit.
-- Vector similarity queries will use sequential scan with cosine distance.
-- Example query: SELECT * FROM search_embeddings ORDER BY embedding <=> '[...]'::vector LIMIT 10;