import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  completeSourceSyncRun,
  createDatabaseConnection,
  eq,
  getSourceProfileByHandle,
  profileToUpsertPayload,
  sourceProfiles,
  startSourceSyncRun,
  upsertSourceProfile,
  type SeekuDatabase
} from "@seeku/db";
import { computeProfileHash, normalizeBonjourProfile, type BonjourProfile } from "@seeku/adapters";
import type { NormalizedProfile } from "@seeku/shared";

export const IMPORT_BONJOUR_FRIEND_LINKS_HELP_TEXT = `Seeku import-bonjour-friend-links

Usage:
  seeku import-bonjour-friend-links [options]

Behavior:
  - Import mini-profile data from authenticated Bonjour friend-link crawl output.
  - Safely enrich existing Bonjour source_profiles by filling only missing fields.
  - Optionally create sparse source_profiles for handles not yet in DB.
  - Preserve richer raw/normalized payloads; attach mini-profile provenance under authFriendLinkPreview.

Options:
  --dump-dir <path>             Auth friend-link crawl output directory
  --limit <number>              Optional cap on processed handles
  --create-missing              Also create sparse source_profiles for missing handles
  --job-name <name>             Override sync run job name
  -h, --help                    Show command help`;

interface ImportBonjourFriendLinksOptions {
  dumpDir?: string;
  limit?: number;
  createMissing: boolean;
  jobName?: string;
  help: boolean;
}

interface FriendLinkEntry {
  profile_link: string;
  name?: string;
  avatar?: string;
  description?: string;
  create_time?: string;
}

interface FriendLinkResponse {
  friend?: FriendLinkEntry[];
  friended?: FriendLinkEntry[];
}

interface PreviewAggregate {
  handle: string;
  name?: string;
  avatar?: string;
  description?: string;
  firstSeenAt?: string;
  sourceFiles: string[];
  edgeTypes: Array<"friend" | "friended">;
  sightings: number;
}

interface ImportBonjourFriendLinksSummary {
  runId: string;
  status: "succeeded" | "failed" | "partial";
  dumpDir: string;
  handlesScanned: number;
  existingProfilesUpdated: number;
  missingProfilesCreated: number;
  skippedExistingRichProfiles: number;
  errors: Array<{ handle: string; message: string }>;
}

function requireFlagValue(flagName: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return value;
}

function parsePositiveIntegerFlag(flagName: string, value: string | undefined, max?: number) {
  const parsed = Number.parseInt(requireFlagValue(flagName, value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || (max !== undefined && parsed > max)) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }

  return parsed;
}

function parseImportBonjourFriendLinksArgs(argv: string[]): ImportBonjourFriendLinksOptions {
  const options: ImportBonjourFriendLinksOptions = {
    createMissing: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--create-missing") {
      options.createMissing = true;
      continue;
    }

    if (arg === "--dump-dir") {
      options.dumpDir = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveIntegerFlag(arg, argv[index + 1], 100_000);
      index += 1;
      continue;
    }

    if (arg === "--job-name") {
      options.jobName = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function chooseLonger(current: string | undefined, next: string | undefined) {
  if (!next?.trim()) return current;
  if (!current?.trim()) return next.trim();
  return next.trim().length > current.trim().length ? next.trim() : current.trim();
}

function chooseFirst(current: string | undefined, next: string | undefined) {
  return current?.trim() || next?.trim() || undefined;
}

async function loadFriendLinkPreviews(dumpDir: string): Promise<PreviewAggregate[]> {
  const friendLinksDir = resolve(dumpDir, "friend-links");
  const entries = await readdir(friendLinksDir, { withFileTypes: true });
  const aggregates = new Map<string, PreviewAggregate>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = resolve(friendLinksDir, entry.name);
    const payload = await readJsonFile<FriendLinkResponse>(filePath);
    const records: Array<{ item: FriendLinkEntry; edgeType: "friend" | "friended" }> = [];

    for (const item of payload.friend ?? []) {
      records.push({ item, edgeType: "friend" });
    }
    for (const item of payload.friended ?? []) {
      records.push({ item, edgeType: "friended" });
    }

    for (const { item, edgeType } of records) {
      const handle = item.profile_link?.trim();
      if (!handle) {
        continue;
      }

      const existing = aggregates.get(handle);
      if (!existing) {
        aggregates.set(handle, {
          handle,
          name: item.name?.trim() || undefined,
          avatar: item.avatar?.trim() || undefined,
          description: item.description?.trim() || undefined,
          firstSeenAt: item.create_time?.trim() || undefined,
          sourceFiles: [entry.name],
          edgeTypes: [edgeType],
          sightings: 1
        });
        continue;
      }

      existing.name = chooseFirst(existing.name, item.name);
      existing.avatar = chooseFirst(existing.avatar, item.avatar);
      existing.description = chooseLonger(existing.description, item.description);
      existing.firstSeenAt = chooseFirst(existing.firstSeenAt, item.create_time);
      if (!existing.sourceFiles.includes(entry.name)) {
        existing.sourceFiles.push(entry.name);
      }
      if (!existing.edgeTypes.includes(edgeType)) {
        existing.edgeTypes.push(edgeType);
      }
      existing.sightings += 1;
    }
  }

  return [...aggregates.values()].sort((left, right) => right.sightings - left.sightings);
}

function buildSparseBonjourProfile(preview: PreviewAggregate): BonjourProfile {
  return {
    _id: `auth-friend-link:${preview.handle}`,
    profile_link: preview.handle,
    name: preview.name,
    description: preview.description,
    avatar: preview.avatar,
    create_time: preview.firstSeenAt,
    update_time: new Date().toISOString(),
    inflationRequired: false,
    memories: {
      authFriendLinkPreview: true
    }
  };
}

function buildPreviewMetadata(preview: PreviewAggregate) {
  return {
    handle: preview.handle,
    name: preview.name ?? null,
    avatar: preview.avatar ?? null,
    description: preview.description ?? null,
    firstSeenAt: preview.firstSeenAt ?? null,
    sourceFiles: preview.sourceFiles,
    edgeTypes: preview.edgeTypes,
    sightings: preview.sightings,
    importedAt: new Date().toISOString()
  };
}

function mergeNormalizedProfile(
  existing: Record<string, unknown>,
  profile: NormalizedProfile,
  preview: PreviewAggregate
) {
  const next = { ...existing };

  if (!next.displayName && profile.displayName) next.displayName = profile.displayName;
  if (!next.headline && profile.headline) next.headline = profile.headline;
  if (!next.bio && profile.bio) next.bio = profile.bio;
  if (!next.summary && profile.summary) next.summary = profile.summary;
  if (!next.avatarUrl && profile.avatarUrl) next.avatarUrl = profile.avatarUrl;
  if (!next.locationText && profile.locationText) next.locationText = profile.locationText;
  if (!Array.isArray(next.aliases)) next.aliases = profile.aliases;

  const rawMetadata =
    next.rawMetadata && typeof next.rawMetadata === "object" && !Array.isArray(next.rawMetadata)
      ? { ...(next.rawMetadata as Record<string, unknown>) }
      : {};

  rawMetadata.authFriendLinkPreview = buildPreviewMetadata(preview);
  next.rawMetadata = rawMetadata;

  return next;
}

function mergeRawPayload(existing: Record<string, unknown>, preview: PreviewAggregate) {
  return {
    ...existing,
    authFriendLinkPreview: buildPreviewMetadata(preview)
  };
}

function profileLooksRich(profile: {
  displayName: string | null;
  rawPayload: Record<string, unknown>;
}) {
  return Boolean(
    profile.displayName?.trim() &&
      (profile.rawPayload.basicInfo ||
        (Array.isArray(profile.rawPayload.gridItems) && profile.rawPayload.gridItems.length > 0))
  );
}

async function enrichExistingProfile(
  db: SeekuDatabase,
  existing: {
    id: string;
    displayName: string | null;
    headline: string | null;
    bio: string | null;
    avatarUrl: string | null;
    rawPayload: Record<string, unknown>;
    normalizedPayload: Record<string, unknown>;
  },
  profile: NormalizedProfile,
  preview: PreviewAggregate
) {
  const nextDisplayName = existing.displayName ?? profile.displayName ?? null;
  const nextHeadline = existing.headline ?? profile.headline ?? null;
  const nextBio = existing.bio ?? profile.bio ?? null;
  const nextAvatarUrl = existing.avatarUrl ?? profile.avatarUrl ?? null;
  const nextRawPayload = mergeRawPayload(existing.rawPayload, preview);
  const nextNormalizedPayload = mergeNormalizedProfile(existing.normalizedPayload, profile, preview);

  const changed =
    nextDisplayName !== existing.displayName ||
    nextHeadline !== existing.headline ||
    nextBio !== existing.bio ||
    nextAvatarUrl !== existing.avatarUrl ||
    JSON.stringify(nextRawPayload) !== JSON.stringify(existing.rawPayload) ||
    JSON.stringify(nextNormalizedPayload) !== JSON.stringify(existing.normalizedPayload);

  if (!changed) {
    return false;
  }

  await db
    .update(sourceProfiles)
    .set({
      displayName: nextDisplayName,
      headline: nextHeadline,
      bio: nextBio,
      avatarUrl: nextAvatarUrl,
      rawPayload: nextRawPayload,
      normalizedPayload: nextNormalizedPayload
    })
    .where(eq(sourceProfiles.id, existing.id));

  return true;
}

export async function runImportBonjourFriendLinksCommand(argv: string[]) {
  const options = parseImportBonjourFriendLinksArgs(argv);

  if (options.help) {
    console.log(IMPORT_BONJOUR_FRIEND_LINKS_HELP_TEXT);
    return;
  }

  if (!options.dumpDir) {
    throw new Error("Missing --dump-dir <path>.");
  }

  const dumpDir = resolve(options.dumpDir);
  const previews = await loadFriendLinkPreviews(dumpDir);
  const targets = options.limit ? previews.slice(0, options.limit) : previews;

  const ownedConnection = createDatabaseConnection();
  const db = ownedConnection.db;
  const run = await startSourceSyncRun(db, {
    source: "bonjour",
    jobName: options.jobName ?? "bonjour.import.friend-links",
    cursor: { dumpDir }
  });

  const summary: ImportBonjourFriendLinksSummary = {
    runId: run.id,
    status: "succeeded",
    dumpDir,
    handlesScanned: targets.length,
    existingProfilesUpdated: 0,
    missingProfilesCreated: 0,
    skippedExistingRichProfiles: 0,
    errors: []
  };

  try {
    for (const preview of targets) {
      try {
        const sparseRawProfile = buildSparseBonjourProfile(preview);
        const normalizedProfile = normalizeBonjourProfile(sparseRawProfile);
        const existing = await getSourceProfileByHandle(db, "bonjour", preview.handle);

        if (existing) {
          const rich = profileLooksRich({
            displayName: existing.displayName,
            rawPayload: existing.rawPayload
          });
          if (rich) {
            summary.skippedExistingRichProfiles += 1;
            continue;
          }

          const updated = await enrichExistingProfile(db, existing, normalizedProfile, preview);
          if (updated) {
            summary.existingProfilesUpdated += 1;
          }
          continue;
        }

        if (!options.createMissing) {
          continue;
        }

        await upsertSourceProfile(
          db,
          profileToUpsertPayload(
            normalizedProfile,
            {
              ...sparseRawProfile,
              authFriendLinkPreview: buildPreviewMetadata(preview)
            },
            computeProfileHash(sparseRawProfile),
            run.id
          )
        );
        summary.missingProfilesCreated += 1;
      } catch (error) {
        summary.errors.push({
          handle: preview.handle,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    summary.status =
      summary.errors.length === 0 ? "succeeded" : summary.existingProfilesUpdated > 0 || summary.missingProfilesCreated > 0 ? "partial" : "failed";

    await completeSourceSyncRun(db, {
      runId: run.id,
      status: summary.status,
      cursor: { dumpDir },
      stats: {
        handlesScanned: summary.handlesScanned,
        existingProfilesUpdated: summary.existingProfilesUpdated,
        missingProfilesCreated: summary.missingProfilesCreated,
        skippedExistingRichProfiles: summary.skippedExistingRichProfiles,
        errorCount: summary.errors.length
      },
      errorMessage: summary.errors[0]?.message
    });

    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await ownedConnection.close();
  }
}
