import { sql } from "drizzle-orm";

export const profileClaimsStatements = [
  sql`
    DO $$ BEGIN
      CREATE TYPE claim_method AS ENUM ('email', 'github');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `,
  sql`
    DO $$ BEGIN
      CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `,
  sql`
    CREATE TABLE IF NOT EXISTS profile_claims (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      method claim_method NOT NULL,
      verified_email TEXT,
      verified_github_login TEXT,
      status claim_status NOT NULL DEFAULT 'pending',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      revoked_by UUID,
      revoke_reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `,
  sql`
    CREATE INDEX IF NOT EXISTS profile_claims_person_id_idx ON profile_claims(person_id);
  `,
  sql`
    CREATE INDEX IF NOT EXISTS profile_claims_status_idx ON profile_claims(status);
  `,
];