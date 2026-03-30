-- Manual migration to add 'web' to source_name and 'summary' to evidence_type
-- DESIGN RATIONALE: Drizzle-kit fails to generate in this environment, so providing a manual SQL fix.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'source_name' AND e.enumlabel = 'web') THEN
    ALTER TYPE "public"."source_name" ADD VALUE 'web';
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'evidence_type' AND e.enumlabel = 'summary') THEN
    ALTER TYPE "public"."evidence_type" ADD VALUE 'summary';
  END IF;
END $$;
