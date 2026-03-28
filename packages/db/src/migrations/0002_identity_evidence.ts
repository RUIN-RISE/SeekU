import { sql } from "drizzle-orm";

export const identityEvidenceStatements = [
  sql`
    DO $$ BEGIN
      CREATE TYPE evidence_type AS ENUM (
        'social', 'project', 'repository', 'community_post',
        'job_signal', 'education', 'experience', 'profile_field'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `,
  sql`
    DO $$ BEGIN
      CREATE TYPE search_status AS ENUM ('active', 'hidden', 'claimed');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `
];
