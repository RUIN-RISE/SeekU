DO $$ BEGIN
 CREATE TYPE "public"."evidence_type" AS ENUM('social', 'project', 'repository', 'community_post', 'job_signal', 'education', 'experience', 'profile_field');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."search_status" AS ENUM('active', 'hidden', 'claimed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."source_name" AS ENUM('bonjour', 'github');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'failed', 'partial');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"person_id" uuid NOT NULL,
	"source_profile_id" uuid,
	"source" "source_name" NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"title" text,
	"description" text,
	"url" text,
	"occurred_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_items_person_source_hash_unique" UNIQUE("person_id","source","evidence_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opt_out_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"source" "source_name",
	"source_handle" text,
	"requester_contact" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_aliases" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"person_id" uuid NOT NULL,
	"alias_type" text NOT NULL,
	"alias_value" text NOT NULL,
	"source" text NOT NULL,
	"confidence_score" numeric(5, 4) DEFAULT '0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_aliases_alias_unique" UNIQUE("alias_type","alias_value","person_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_identities" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"person_id" uuid NOT NULL,
	"source_profile_id" uuid NOT NULL,
	"match_score" numeric(5, 4) NOT NULL,
	"match_reason" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_identities_source_profile_unique" UNIQUE("source_profile_id"),
	CONSTRAINT "person_identities_person_source_unique" UNIQUE("person_id","source_profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persons" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"primary_name" text NOT NULL,
	"primary_headline" text,
	"summary" text,
	"primary_location" text,
	"avatar_url" text,
	"search_status" "search_status" DEFAULT 'active' NOT NULL,
	"confidence_score" numeric(5, 4) DEFAULT '0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_cache" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"overall_score" numeric(5, 2),
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '7 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_documents" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"doc_text" text NOT NULL,
	"facet_role" text[] DEFAULT '{}'::text[] NOT NULL,
	"facet_location" text[] DEFAULT '{}'::text[] NOT NULL,
	"facet_source" text[] DEFAULT '{}'::text[] NOT NULL,
	"facet_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"rank_features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_embeddings" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"embedding" text NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimension" numeric NOT NULL,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"source" "source_name" NOT NULL,
	"source_profile_id" text,
	"source_handle" text NOT NULL,
	"canonical_url" text NOT NULL,
	"display_name" text,
	"headline" text,
	"bio" text,
	"location_text" text,
	"avatar_url" text,
	"raw_payload" jsonb NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"profile_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_run_id" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "source_profiles_source_handle_unique" UNIQUE("source","source_handle"),
	CONSTRAINT "source_profiles_source_profile_id_unique" UNIQUE("source","source_profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"source" "source_name" NOT NULL,
	"job_name" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cursor" jsonb,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_profile_id_source_profiles_id_fk" FOREIGN KEY ("source_profile_id") REFERENCES "public"."source_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_source_profile_id_source_profiles_id_fk" FOREIGN KEY ("source_profile_id") REFERENCES "public"."source_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_cache" ADD CONSTRAINT "profile_cache_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_embeddings" ADD CONSTRAINT "search_embeddings_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "source_profiles" ADD CONSTRAINT "source_profiles_last_sync_run_id_source_sync_runs_id_fk" FOREIGN KEY ("last_sync_run_id") REFERENCES "public"."source_sync_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
