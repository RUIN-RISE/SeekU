-- Manually create the extracted_profiles table to avoid drizzle-kit data loss issues with vector types
CREATE TABLE IF NOT EXISTS "extracted_profiles" (
    "person_id" uuid PRIMARY KEY NOT NULL,
    "name" text,
    "wechat" text,
    "email" text,
    "enrollment_year" text,
    "major" text,
    "gender" text,
    "current_company" text,
    "bio" text,
    "industry_tags" text[] DEFAULT '{}'::text[] NOT NULL,
    "social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'extracted_profiles_person_id_persons_id_fk'
    ) THEN
        ALTER TABLE "extracted_profiles" 
        ADD CONSTRAINT "extracted_profiles_person_id_persons_id_fk" 
        FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE;
    END IF;
END $$;
