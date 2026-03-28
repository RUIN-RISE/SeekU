import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

export const sourceName = pgEnum("source_name", ["bonjour", "github"]);
export const syncStatus = pgEnum("sync_status", [
  "running",
  "succeeded",
  "failed",
  "partial"
]);

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

export type SourceName = typeof sourceName.enumValues[number];
export type SyncStatus = typeof syncStatus.enumValues[number];
export type SourceSyncRun = typeof sourceSyncRuns.$inferSelect;
export type NewSourceSyncRun = typeof sourceSyncRuns.$inferInsert;
export type SourceProfile = typeof sourceProfiles.$inferSelect;
export type NewSourceProfile = typeof sourceProfiles.$inferInsert;
export type OptOutRequest = typeof optOutRequests.$inferSelect;
export type NewOptOutRequest = typeof optOutRequests.$inferInsert;
