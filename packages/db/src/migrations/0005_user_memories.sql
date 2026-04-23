-- Migration: User Memories
-- Phase A / Wave 1: Memory Contract
--
-- This table stores user-level, cross-session memory for the agent product.
-- Memory is user-scoped and augments context without overwriting task truth.

-- Create enum types with idempotent guards
DO $$ BEGIN
  CREATE TYPE "public"."user_memory_kind" AS ENUM('preference', 'feedback', 'hiring_context');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."user_memory_scope_kind" AS ENUM('global', 'role', 'location', 'work_item');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."user_memory_source" AS ENUM('explicit', 'inferred');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- User memories table
CREATE TABLE IF NOT EXISTS "user_memories" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" TEXT NOT NULL,
  "kind" "user_memory_kind" NOT NULL,
  "scope_kind" "user_memory_scope_kind" NOT NULL,
  "scope_value" TEXT,
  "content" JSONB NOT NULL,
  "source" "user_memory_source" NOT NULL,
  "confidence" numeric(3,2) DEFAULT '1.0' NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "expires_at" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "user_memories_global_scope_has_null_value" CHECK (
    "scope_kind" <> 'global' OR "scope_value" IS NULL
  ),
  CONSTRAINT "user_memories_scoped_has_value" CHECK (
    "scope_kind" = 'global' OR "scope_value" IS NOT NULL
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_user_id_idx" ON "user_memories" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_kind_idx" ON "user_memories" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_scope_idx" ON "user_memories" ("scope_kind", "scope_value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_source_idx" ON "user_memories" ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_expires_at_idx" ON "user_memories" ("expires_at") WHERE "expires_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_updated_at_idx" ON "user_memories" ("updated_at" DESC);

-- User preferences table for persisted settings like memory pause
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" TEXT PRIMARY KEY,
  "memory_paused" BOOLEAN DEFAULT FALSE NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE "user_memories" IS 'User-level cross-session memory for agent context augmentation';
COMMENT ON TABLE "user_preferences" IS 'User-level persisted preferences for agent behavior';
