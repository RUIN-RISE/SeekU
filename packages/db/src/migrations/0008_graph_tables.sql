-- Migration: Graph Tables
-- Phase 1: Graph Facts Layer
--
-- Stores explicit friend/friended relationships from Bonjour crawl data
-- and computed node-level graph statistics.

-- Create enum type for edge direction
DO $$ BEGIN
  CREATE TYPE "public"."graph_edge_type" AS ENUM('friend', 'friended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Graph edges table
CREATE TABLE IF NOT EXISTS "graph_edges" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "source_person_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
  "target_person_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
  "edge_type" "graph_edge_type" NOT NULL,
  "source_profile_id" UUID REFERENCES "source_profiles"("id") ON DELETE SET NULL,
  "imported_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT "graph_edges_source_target_type_unique" UNIQUE ("source_person_id", "target_person_id", "edge_type")
);
--> statement-breakpoint

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS "graph_edges_source_person_id_idx" ON "graph_edges" ("source_person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edges_target_person_id_idx" ON "graph_edges" ("target_person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edges_edge_type_idx" ON "graph_edges" ("edge_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edges_source_profile_id_idx" ON "graph_edges" ("source_profile_id") WHERE "source_profile_id" IS NOT NULL;
--> statement-breakpoint

-- Graph node features table
CREATE TABLE IF NOT EXISTS "graph_node_features" (
  "person_id" UUID PRIMARY KEY REFERENCES "persons"("id") ON DELETE CASCADE,
  "out_degree" NUMERIC(10) DEFAULT '0' NOT NULL,
  "in_degree" NUMERIC(10) DEFAULT '0' NOT NULL,
  "undirected_degree" NUMERIC(10) DEFAULT '0' NOT NULL,
  "component_id" TEXT,
  "component_size" NUMERIC(10),
  "computed_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
--> statement-breakpoint

-- Index for component lookups
CREATE INDEX IF NOT EXISTS "graph_node_features_component_id_idx" ON "graph_node_features" ("component_id") WHERE "component_id" IS NOT NULL;
--> statement-breakpoint

COMMENT ON TABLE "graph_edges" IS 'Explicit friend/friended relationships from Bonjour crawl data';
COMMENT ON TABLE "graph_node_features" IS 'Computed node-level graph statistics for persons';
COMMENT ON COLUMN "graph_edges"."edge_type" IS 'friend: source follows target; friended: target follows source';
COMMENT ON COLUMN "graph_node_features"."component_id" IS 'Identifier for connected component (computed via Union-Find)';
COMMENT ON COLUMN "graph_node_features"."component_size" IS 'Size of the connected component this node belongs to';
