import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

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

export function verifyAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const adminKey = process.env.API_ADMIN_KEY;

  if (!adminKey) {
    reply.status(503).send({
      error: "admin_disabled",
      message: "Admin API is disabled. Set API_ADMIN_KEY environment variable."
    });
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    reply.status(401).send({ error: "unauthorized" });
    return;
  }

  done();
}

export function registerAdminRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.register(async (admin) => {
    admin.addHook("onRequest", verifyAdmin);
    admin.get("/admin/sync-status", async () => handleSyncStatus(db));
    admin.post("/admin/run-eval", async () => handleRunEval());
  });
}