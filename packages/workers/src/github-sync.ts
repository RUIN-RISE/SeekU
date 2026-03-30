import { createHash } from "node:crypto";

import {
  completeSourceSyncRun,
  createDatabaseConnection,
  isHandleOptedOut,
  listSourceProfilesBySource,
  profileToUpsertPayload,
  startSourceSyncRun,
  upsertSourceProfile,
  type SeekuDatabase,
  type SyncStatus
} from "@seeku/db";
import {
  GithubAdapter,
  GithubClient,
  type GithubProfile,
  type GithubRepository
} from "@seeku/adapters";
import type { NormalizedProfile, SyncRunResult } from "@seeku/shared";

function normalizeGithubHandle(value: string) {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function computeGithubSyncHash(profile: GithubProfile, repositories: GithubRepository[]) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profileId: profile.id,
        login: profile.login,
        name: profile.name,
        bio: profile.bio,
        location: profile.location,
        company: profile.company,
        publicRepos: profile.public_repos,
        updatedAt: profile.updated_at,
        repoIds: repositories.map((repository) => repository.id).sort((left, right) => left - right)
      })
    )
    .digest("hex");
}

function extractGithubHandlesFromNormalizedProfile(profile: {
  normalizedPayload: Record<string, unknown>;
}) {
  const normalized = profile.normalizedPayload as unknown as NormalizedProfile;
  return (normalized.aliases ?? [])
    .filter((alias) => alias.type === "github")
    .map((alias) => {
      try {
        const url = new URL(alias.value);
        return normalizeGithubHandle(url.pathname.replace(/^\/+/, "").split("/")[0] ?? alias.value);
      } catch {
        return normalizeGithubHandle(alias.value);
      }
    })
    .filter(Boolean);
}

export async function syncGithubProfile(
  client: GithubClient,
  db: SeekuDatabase,
  handle: string,
  syncRunId?: string
): Promise<{
  success: boolean;
  profile?: GithubProfile;
  repositories?: GithubRepository[];
  error?: string;
}> {
  try {
    const profile = await client.fetchProfileByUsername(handle);
    const repositories = await client.fetchRepositoriesByUsername(handle);
    const adapter = new GithubAdapter(client);
    const normalized = await adapter.normalizeProfile({ rawProfile: profile });
    const optedOut = await isHandleOptedOut(db, "github", normalized.sourceHandle);

    await upsertSourceProfile(
      db,
      profileToUpsertPayload(
        normalized,
        {
          profile,
          repositories
        },
        computeGithubSyncHash(profile, repositories),
        syncRunId,
        optedOut
      )
    );

    return {
      success: true,
      profile,
      repositories
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function syncGithubRepositories(client: GithubClient, handle: string) {
  return client.fetchRepositoriesByUsername(handle);
}

export async function syncGithubHandles(
  handles: string[],
  options: {
    limit?: number;
    client?: GithubClient;
    db?: SeekuDatabase;
  } = {}
): Promise<SyncRunResult> {
  const ownedConnection = options.db ? null : createDatabaseConnection();
  const db = options.db ?? ownedConnection!.db;
  const client = options.client ?? new GithubClient();
  const limit = options.limit ?? handles.length;

  const syncRun = await startSourceSyncRun(db, {
    source: "github",
    jobName: "github.sync",
    cursor: {
      handles,
      processed: 0
    }
  });

  const errors: Array<{ message: string; context?: unknown }> = [];
  let profilesProcessed = 0;

  try {
    for (const handle of handles.slice(0, limit)) {
      const result = await syncGithubProfile(client, db, handle, syncRun.id);

      if (result.success) {
        profilesProcessed += 1;
      } else {
        errors.push({
          message: result.error ?? "Unknown GitHub sync error",
          context: { handle }
        });
      }
    }

    let status: SyncStatus = "succeeded";
    if (errors.length > 0) {
      status = profilesProcessed > 0 ? "partial" : "failed";
    }
    const nextCursor =
      profilesProcessed < handles.length
        ? {
            handles,
            processed: profilesProcessed
          }
        : undefined;

    await completeSourceSyncRun(db, {
      runId: syncRun.id,
      status,
      cursor: nextCursor,
      stats: {
        profilesProcessed,
        errorCount: errors.length
      },
      errorMessage: errors[0]?.message
    });

    return {
      status,
      profilesProcessed,
      errors,
      nextCursor
    };
  } finally {
    await ownedConnection?.close();
  }
}

export async function runGithubSync(
  seedHandles: string[] = [],
  options: {
    limit?: number;
    client?: GithubClient;
    db?: SeekuDatabase;
  } = {}
) {
  const ownedConnection = options.db ? null : createDatabaseConnection();
  const db = options.db ?? ownedConnection!.db;

  try {
    const handles = new Set(seedHandles.map(normalizeGithubHandle));
    const bonjourProfiles = await listSourceProfilesBySource(db, "bonjour", 500);

    for (const profile of bonjourProfiles) {
      for (const handle of extractGithubHandlesFromNormalizedProfile(profile)) {
        handles.add(handle);
      }
    }

    return await syncGithubHandles([...handles], {
      ...options,
      db
    });
  } finally {
    await ownedConnection?.close();
  }
}
