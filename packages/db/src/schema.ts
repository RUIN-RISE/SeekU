import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

export const sourceName = pgEnum("source_name", ["bonjour", "github", "web"]);
export const syncStatus = pgEnum("sync_status", [
  "running",
  "succeeded",
  "failed",
  "partial"
]);
export const evidenceType = pgEnum("evidence_type", [
  "social",
  "project",
  "repository",
  "community_post",
  "job_signal",
  "education",
  "experience",
  "profile_field",
  "summary"
]);
export const searchStatus = pgEnum("search_status", ["active", "hidden", "claimed"]);
export const claimMethod = pgEnum("claim_method", ["email", "github"]);
export const claimStatus = pgEnum("claim_status", ["pending", "approved", "rejected", "revoked"]);
export const agentSessionOrigin = pgEnum("agent_session_origin", ["cli"]);
export const agentSessionPosture = pgEnum("agent_session_posture", ["active", "stopped"]);

export const sourceSyncRuns = pgTable("source_sync_runs", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  source: sourceName("source").notNull(),
  jobName: text("job_name").notNull(),
  status: syncStatus("status").default("running").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  cursor: jsonb("cursor").$type<Record<string, unknown> | null>(),
  stats: jsonb("stats")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  errorMessage: text("error_message")
});

export const sourceProfiles = pgTable(
  "source_profiles",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
    source: sourceName("source").notNull(),
    sourceProfileId: text("source_profile_id"),
    sourceHandle: text("source_handle").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    displayName: text("display_name"),
    headline: text("headline"),
    bio: text("bio"),
    locationText: text("location_text"),
    avatarUrl: text("avatar_url"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb("normalized_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    profileHash: text("profile_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSyncRunId: uuid("last_sync_run_id").references(() => sourceSyncRuns.id, {
      onDelete: "set null"
    }),
    isDeleted: boolean("is_deleted").default(false).notNull()
  },
  (table) => ({
    sourceHandleUnique: unique("source_profiles_source_handle_unique").on(
      table.source,
      table.sourceHandle
    ),
    sourceProfileIdUnique: unique("source_profiles_source_profile_id_unique").on(
      table.source,
      table.sourceProfileId
    )
  })
);

export const optOutRequests = pgTable("opt_out_requests", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  source: sourceName("source"),
  sourceHandle: text("source_handle"),
  requesterContact: text("requester_contact").notNull(),
  reason: text("reason"),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
});

export const agentSessions = pgTable("agent_sessions", {
  sessionId: uuid("session_id").primaryKey(),
  origin: agentSessionOrigin("origin").default("cli").notNull(),
  posture: agentSessionPosture("posture").default("active").notNull(),
  transcript: jsonb("transcript")
    .$type<Record<string, unknown>[]>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  latestSnapshot: jsonb("latest_snapshot")
    .$type<Record<string, unknown> | null>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  resumeMeta: jsonb("resume_meta")
    .$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export interface MatchReason {
  signal: string;
  confidence: number;
}

export const persons = pgTable("persons", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  primaryName: text("primary_name").notNull(),
  primaryHeadline: text("primary_headline"),
  summary: text("summary"),
  primaryLocation: text("primary_location"),
  avatarUrl: text("avatar_url"),
  searchStatus: searchStatus("search_status").default("active").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 })
    .default("0.0")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const personIdentities = pgTable(
  "person_identities",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    sourceProfileId: uuid("source_profile_id")
      .notNull()
      .references(() => sourceProfiles.id, { onDelete: "cascade" }),
    matchScore: numeric("match_score", { precision: 5, scale: 4 }).notNull(),
    matchReason: jsonb("match_reason")
      .$type<MatchReason[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    sourceProfileUnique: unique("person_identities_source_profile_unique").on(table.sourceProfileId),
    personSourceUnique: unique("person_identities_person_source_unique").on(
      table.personId,
      table.sourceProfileId
    )
  })
);

export const personAliases = pgTable(
  "person_aliases",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    aliasType: text("alias_type").notNull(),
    aliasValue: text("alias_value").notNull(),
    source: text("source").notNull(),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 })
      .default("0.0")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    aliasUnique: unique("person_aliases_alias_unique").on(
      table.aliasType,
      table.aliasValue,
      table.personId
    )
  })
);

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    sourceProfileId: uuid("source_profile_id").references(() => sourceProfiles.id, {
      onDelete: "set null"
    }),
    source: sourceName("source").notNull(),
    evidenceType: evidenceType("evidence_type").notNull(),
    title: text("title"),
    description: text("description"),
    url: text("url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    evidenceUnique: unique("evidence_items_person_source_hash_unique").on(
      table.personId,
      table.source,
      table.evidenceHash
    )
  })
);

export type SourceName = typeof sourceName.enumValues[number];
export type SyncStatus = typeof syncStatus.enumValues[number];
export type EvidenceType = typeof evidenceType.enumValues[number];
export type SearchStatus = typeof searchStatus.enumValues[number];
export type AgentSessionOrigin = typeof agentSessionOrigin.enumValues[number];
export type AgentSessionPosture = typeof agentSessionPosture.enumValues[number];
export type SourceSyncRun = typeof sourceSyncRuns.$inferSelect;
export type NewSourceSyncRun = typeof sourceSyncRuns.$inferInsert;
export type SourceProfile = typeof sourceProfiles.$inferSelect;
export type NewSourceProfile = typeof sourceProfiles.$inferInsert;
export type OptOutRequest = typeof optOutRequests.$inferSelect;
export type NewOptOutRequest = typeof optOutRequests.$inferInsert;
export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type PersonIdentity = typeof personIdentities.$inferSelect;
export type NewPersonIdentity = typeof personIdentities.$inferInsert;
export type PersonAlias = typeof personAliases.$inferSelect;
export type NewPersonAlias = typeof personAliases.$inferInsert;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type NewEvidenceItem = typeof evidenceItems.$inferInsert;

// Search infrastructure tables

export interface RankFeatures {
  evidenceCount: number;
  projectCount: number;
  repoCount: number;
  followerCount: number;
  freshness: number;
}

export const searchDocuments = pgTable("search_documents", {
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" })
    .primaryKey(),
  docText: text("doc_text").notNull(),
  facetRole: text("facet_role").array().notNull().default(sql`'{}'::text[]`),
  facetLocation: text("facet_location").array().notNull().default(sql`'{}'::text[]`),
  facetSource: text("facet_source").array().notNull().default(sql`'{}'::text[]`),
  facetTags: text("facet_tags").array().notNull().default(sql`'{}'::text[]`),
  rankFeatures: jsonb("rank_features")
    .$type<RankFeatures>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const searchEmbeddings = pgTable("search_embeddings", {
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" })
    .primaryKey(),
  // Note: embedding stored as text in schema, actual vector(4096) created via migration
  embedding: text("embedding").notNull(),
  embeddingModel: text("embedding_model").notNull(),
  embeddingDimension: numeric("embedding_dimension").notNull(),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }).defaultNow().notNull()
});

export type SearchDocument = typeof searchDocuments.$inferSelect;
export type NewSearchDocument = typeof searchDocuments.$inferInsert;
export type SearchEmbedding = typeof searchEmbeddings.$inferSelect;
export type NewSearchEmbedding = typeof searchEmbeddings.$inferInsert;

export const profileCache = pgTable("profile_cache", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => persons.id, { onDelete: "cascade" }),
  profile: jsonb("profile").notNull(), // Type validated at application layer via Zod
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .default(sql`NOW() + INTERVAL '7 days'`)
    .notNull(),
});

export type ProfileCache = typeof profileCache.$inferSelect;
export type NewProfileCache = typeof profileCache.$inferInsert;

export const extractedProfiles = pgTable("extracted_profiles", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => persons.id, { onDelete: "cascade" }),
  name: text("name"),
  wechat: text("wechat"),
  email: text("email"),
  enrollmentYear: text("enrollment_year"),
  major: text("major"),
  gender: text("gender"),
  currentCompany: text("current_company"),
  bio: text("bio"),
  industryTags: text("industry_tags").array().notNull().default(sql`'{}'::text[]`),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().default(sql`'{}'::jsonb`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ExtractedProfile = typeof extractedProfiles.$inferSelect;
export type NewExtractedProfile = typeof extractedProfiles.$inferInsert;

// Profile claims table for talent verification

export const profileClaims = pgTable("profile_claims", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" }),
  method: claimMethod("method").notNull(),
  verifiedEmail: text("verified_email"),
  verifiedGitHubLogin: text("verified_github_login"),
  status: claimStatus("status").default("pending").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by"),
  revokeReason: text("revoke_reason"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
});

export type ClaimMethod = typeof claimMethod.enumValues[number];
export type ClaimStatus = typeof claimStatus.enumValues[number];
export type ProfileClaim = typeof profileClaims.$inferSelect;
export type NewProfileClaim = typeof profileClaims.$inferInsert;
