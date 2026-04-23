-- Migration: Candidate Feedback Memories
-- Phase A / Wave 2: Feedback Memory
--
-- Stores user feedback on specific candidates (positive/negative/neutral).
-- This is the raw event log. Inferred preferences derived from repeated
-- patterns are written to user_memories with source='inferred'.

DO $$ BEGIN
  CREATE TYPE "public"."feedback_sentiment" AS ENUM('positive', 'negative', 'neutral');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "candidate_feedback_memories" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" TEXT NOT NULL,
  "person_id" UUID NOT NULL,
  "sentiment" "feedback_sentiment" NOT NULL,
  "reason_code" TEXT,
  "reason_detail" TEXT,
  "context_source" TEXT NOT NULL DEFAULT 'shortlist',
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_feedback_user_id_idx" ON "candidate_feedback_memories" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_feedback_person_id_idx" ON "candidate_feedback_memories" ("person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_feedback_sentiment_idx" ON "candidate_feedback_memories" ("sentiment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_feedback_reason_code_idx" ON "candidate_feedback_memories" ("reason_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_feedback_created_at_idx" ON "candidate_feedback_memories" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_feedback_user_sentiment_reason_idx" ON "candidate_feedback_memories" ("user_id", "sentiment", "reason_code", "created_at" DESC);

COMMENT ON TABLE "candidate_feedback_memories" IS 'Per-candidate feedback events for inferred preference derivation';
