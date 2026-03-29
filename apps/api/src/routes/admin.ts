import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { desc } from "drizzle-orm";
import { sourceSyncRuns, type SeekuDatabase, type SourceSyncRun } from "@seeku/db";

interface SyncStatusResponse {
  runs: SourceSyncRun[];
}

interface EvalRunResponse {
  status: "triggered" | "not_implemented";
  message: string;
}

async function handleSyncStatus(db: SeekuDatabase): Promise<SyncStatusResponse> {
  const runs = await db
    .select()
    .from(sourceSyncRuns)
    .orderBy(desc(sourceSyncRuns.startedAt))
    .limit(10);

  return { runs };
}

async function handleRunEval(): Promise<EvalRunResponse> {
  // Placeholder until eval package is integrated
  return {
    status: "not_implemented",
    message: "Eval package not yet integrated"
  };
}

export function registerAdminRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get("/admin/sync-status", async () => handleSyncStatus(db));
  server.post("/admin/run-eval", async () => handleRunEval());
}