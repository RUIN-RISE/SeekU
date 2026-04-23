-- Migration: Work Items
-- Phase B / Wave 4: Work Item Contract
--
-- Work items are the primary user-visible task object.
-- A session is an execution container; a work item is the task.

-- Create enum type with idempotent guard
DO $$ BEGIN
  CREATE TYPE "public"."work_item_status" AS ENUM('active', 'completed', 'abandoned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Work items table
CREATE TABLE IF NOT EXISTS "work_items" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" TEXT NOT NULL,
  "title" TEXT,
  "goal_summary" TEXT,
  "status" "work_item_status" NOT NULL DEFAULT 'active',
  "completed_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_items_user_id" ON "work_items" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_items_status" ON "work_items" ("status");
--> statement-breakpoint

-- Add nullable work_item_id to agent_sessions for gradual migration
ALTER TABLE "agent_sessions"
  ADD COLUMN IF NOT EXISTS "work_item_id" UUID REFERENCES "work_items" ("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_work_item_id" ON "agent_sessions" ("work_item_id");

COMMENT ON TABLE "work_items" IS 'Primary user-visible task object for agent sessions';
