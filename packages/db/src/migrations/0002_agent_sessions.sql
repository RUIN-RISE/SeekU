DO $$ BEGIN
  CREATE TYPE "public"."agent_session_origin" AS ENUM('cli');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."agent_session_posture" AS ENUM('active', 'stopped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_sessions" (
  "session_id" uuid PRIMARY KEY,
  "origin" "agent_session_origin" DEFAULT 'cli' NOT NULL,
  "posture" "agent_session_posture" DEFAULT 'active' NOT NULL,
  "transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "latest_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_sessions_updated_at_idx" ON "agent_sessions" ("updated_at");
