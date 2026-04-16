import {
  completeSourceSyncRun,
  createDatabaseConnection,
  getSourceProfileByHandle,
  isHandleOptedOut,
  profileToUpsertPayload,
  startSourceSyncRun,
  upsertSourceProfile,
  type SeekuDatabase
} from "@seeku/db";
import {
  computeProfileHash,
  createBonjourAdapter,
  type BonjourAdapter
} from "@seeku/adapters";
import { BonjourScanner as WorkerScanner } from "@seeku/workers";

export { SearchWorkflow } from "./cli/workflow.js";
export * from "./cli/agent-session-events.js";
export * from "./cli/agent-session-bridge.js";

export interface BonjourScanJobOptions {
  query: string[];
  limit?: number;
  depth?: number;
  db?: SeekuDatabase;
}

export interface BonjourScanSummary {
  status: "succeeded" | "failed";
  foundCount: number;
  syncedSummary: BonjourSyncJobSummary | null;
  error?: string;
}

export async function runBonjourDiscoveryScan(options: BonjourScanJobOptions): Promise<BonjourScanSummary> {
  const ownedConnection = options.db ? null : createDatabaseConnection();
  const db = options.db ?? ownedConnection!.db;

  try {
    const scanner = new WorkerScanner();
    const result = await scanner.scanByKeywords(options.query, {
      limitPerCategory: options.limit,
      maxDepth: options.depth
    });

    if (result.handles.length === 0) {
      return {
        status: "succeeded",
        foundCount: 0,
        syncedSummary: null
      };
    }

    console.info(`[Discovery] Scanned ${result.totalPostsChecked} posts, found ${result.handles.length} matches. Syncing...`);

    const syncSummary = await runBonjourSyncJob({
      db,
      handles: result.handles,
      limit: result.handles.length,
      jobName: `bonjour.discovery.${options.query.join("_")}`
    });

    return {
      status: "succeeded",
      foundCount: result.handles.length,
      syncedSummary: syncSummary
    };
  } catch (error) {
    return {
      status: "failed",
      foundCount: 0,
      syncedSummary: null,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await ownedConnection?.close();
  }
}

export interface BonjourSyncJobOptions {
  limit: number;
  cursor?: Record<string, unknown>;
  handles?: string[];
  jobName?: string;
  db?: SeekuDatabase;
  adapter?: BonjourAdapter;
}

export interface BonjourSyncJobSummary {
  runId: string;
  status: "succeeded" | "failed" | "partial";
  discoveredCount: number;
  processedCount: number;
  hiddenCount: number;
  nextCursor?: Record<string, unknown>;
  errors: Array<{ handle?: string; message: string }>;
}

function uniqueHandles(handles: string[]) {
  return [...new Set(handles.filter(Boolean))];
}

function extractReplayHandle(rawPayload: Record<string, unknown> | null | undefined) {
  const direct = rawPayload?.profile_link;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const metadata = rawPayload?.normalizedPayload;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const rawMetadata = (metadata as Record<string, unknown>).rawMetadata;
    if (rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)) {
      const profileLink = (rawMetadata as Record<string, unknown>).profileLink;
      if (typeof profileLink === "string" && profileLink.length > 0) {
        return profileLink;
      }
    }
  }

  return undefined;
}

async function fetchBonjourProfileWithReplay(
  db: SeekuDatabase,
  adapter: BonjourAdapter,
  handle: string
) {
  try {
    return await adapter.fetchProfileByHandle({ handle });
  } catch (error) {
    const existing = await getSourceProfileByHandle(db, "bonjour", handle);
    const replayHandle = extractReplayHandle(existing?.rawPayload);

    if (!replayHandle || replayHandle === handle) {
      throw error;
    }

    return adapter.fetchProfileByHandle({ handle: replayHandle });
  }
}

export async function runBonjourSyncJob(options: BonjourSyncJobOptions): Promise<BonjourSyncJobSummary> {
  const ownedConnection = options.db ? null : createDatabaseConnection();
  const db = options.db ?? ownedConnection!.db;
  const adapter = options.adapter ?? createBonjourAdapter();

  const run = await startSourceSyncRun(db, {
    source: "bonjour",
    jobName: options.jobName ?? "bonjour.sync",
    cursor: options.cursor
  });

  const errors: Array<{ handle?: string; message: string }> = [];
  let discoveredCount = 0;
  let processedCount = 0;
  let hiddenCount = 0;
  let nextCursor: Record<string, unknown> | undefined;

  try {
    const discovery = options.handles?.length
      ? {
          profiles: uniqueHandles(options.handles).map((handle) => ({
            handle,
            rawPayload: { discoveredVia: "manual" }
          })),
          hasMore: false,
          nextCursor: undefined
        }
      : await adapter.discoverSeeds({
          cursor: options.cursor,
          limit: options.limit
        });

    const handles = uniqueHandles(discovery.profiles.map((profile) => profile.handle)).slice(
      0,
      options.limit
    );

    discoveredCount = handles.length;
    nextCursor = discovery.nextCursor;

    for (const handle of handles) {
      try {
        const result = await fetchBonjourProfileWithReplay(db, adapter, handle);
        const optedOut = await isHandleOptedOut(db, "bonjour", result.profile.sourceHandle);

        await upsertSourceProfile(
          db,
          profileToUpsertPayload(
            result.profile,
            result.rawPayload,
            computeProfileHash(result.rawPayload),
            run.id,
            optedOut
          )
        );

        processedCount += 1;

        if (optedOut) {
          hiddenCount += 1;
        }
      } catch (error) {
        errors.push({
          handle,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const status =
      errors.length === 0 ? "succeeded" : processedCount > 0 ? "partial" : "failed";

    await completeSourceSyncRun(db, {
      runId: run.id,
      status,
      cursor: nextCursor,
      stats: {
        discoveredCount,
        processedCount,
        hiddenCount,
        errorCount: errors.length
      },
      errorMessage: errors[0]?.message
    });

    return {
      runId: run.id,
      status,
      discoveredCount,
      processedCount,
      hiddenCount,
      nextCursor,
      errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await completeSourceSyncRun(db, {
      runId: run.id,
      status: "failed",
      cursor: options.cursor,
      stats: {
        discoveredCount,
        processedCount,
        hiddenCount,
        errorCount: errors.length + 1
      },
      errorMessage: message
    });

    throw error;
  } finally {
    await ownedConnection?.close();
  }
}
