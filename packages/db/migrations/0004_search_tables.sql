-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS search_embeddings CASCADE;
DROP TABLE IF EXISTS search_documents CASCADE;

-- Create search_documents table
CREATE TABLE search_documents (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  doc_text TEXT NOT NULL,
  facet_role TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_location TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_source TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  rank_features JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create search_embeddings table with vector column
-- Using 4096 dimensions for Qwen3-Embedding-8B
CREATE TABLE search_embeddings (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  embedding VECTOR(4096) NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension NUMERIC NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN index for pg_trgm keyword search on doc_text
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_search_documents_doc_trgm ON search_documents USING GIN (doc_text gin_trgm_ops);

-- GIN indexes for array facets
CREATE INDEX idx_search_documents_facet_role ON search_documents USING GIN (facet_role);
CREATE INDEX idx_search_documents_facet_location ON search_documents USING GIN (facet_location);
CREATE INDEX idx_search_documents_facet_source ON search_documents USING GIN (facet_source);
CREATE INDEX idx_search_documents_facet_tags ON search_documents USING GIN (facet_tags);

-- HNSW index for vector cosine similarity search
CREATE INDEX idx_search_embeddings_hnsw ON search_embeddings USING hnsw (embedding vector_cosine_ops);

-- Index on updated_at for freshness queries
CREATE INDEX idx_search_documents_updated_at ON search_documents (updated_at DESC);