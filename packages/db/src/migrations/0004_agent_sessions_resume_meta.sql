DO $$ BEGIN
  ALTER TABLE "agent_sessions" ADD COLUMN "resume_meta" jsonb;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
WITH extracted AS (
  SELECT
    "session_id",
    "posture",
    COALESCE("latest_snapshot"->'runtime'->>'status', "latest_snapshot"->>'status') AS "status",
    COALESCE("latest_snapshot"->'runtime'->>'statusSummary', "latest_snapshot"->>'statusSummary') AS "status_summary",
    "latest_snapshot"->'runtime'->>'whySummary' AS "why_summary",
    "latest_snapshot"->'runtime'->>'terminationReason' AS "termination_reason",
    COALESCE("latest_snapshot"->'runtime'->>'lastStatusAt', "updated_at"::text) AS "last_status_at"
  FROM "agent_sessions"
)
UPDATE "agent_sessions" AS sessions
SET "resume_meta" = jsonb_strip_nulls(jsonb_build_object(
  'kind', CASE
    WHEN extracted."termination_reason" IN ('interrupted', 'crashed') THEN 'interrupted_work_item'
    WHEN extracted."termination_reason" = 'user_exit' AND extracted."status" <> 'completed' THEN
      CASE
        WHEN extracted."posture" = 'active' THEN 'interrupted_work_item'
        ELSE 'stopped_session'
      END
    WHEN extracted."posture" = 'active' AND extracted."status" <> 'completed' THEN 'interrupted_work_item'
    WHEN extracted."posture" = 'stopped' THEN 'stopped_session'
    ELSE 'recent_session'
  END,
  'resumability', CASE
    WHEN extracted."termination_reason" IN ('interrupted', 'crashed') THEN 'resumable'
    WHEN extracted."termination_reason" = 'completed' THEN 'read_only'
    WHEN extracted."termination_reason" = 'user_exit' AND extracted."status" <> 'completed' THEN 'resumable'
    WHEN extracted."posture" = 'active' AND extracted."status" <> 'completed' THEN 'resumable'
    ELSE 'read_only'
  END,
  'status', extracted."status",
  'statusSummary', extracted."status_summary",
  'whySummary', extracted."why_summary",
  'terminationReason', extracted."termination_reason",
  'lastStatusAt', extracted."last_status_at"
))
FROM extracted
WHERE sessions."session_id" = extracted."session_id"
  AND sessions."resume_meta" IS NULL
  AND extracted."status" IN (
    'idle',
    'clarifying',
    'searching',
    'recovering',
    'shortlist',
    'comparing',
    'waiting-input',
    'blocked',
    'completed'
  );
