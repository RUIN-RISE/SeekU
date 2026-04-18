import { desc, eq } from "drizzle-orm";

import type { SeekuDatabase } from "./index.js";
import { agentSessions, type AgentSessionOrigin, type AgentSessionPosture } from "./schema.js";

export interface UpsertAgentSessionInput {
  sessionId: string;
  origin: AgentSessionOrigin;
  posture: AgentSessionPosture;
  transcript: Record<string, unknown>[];
  latestSnapshot: Record<string, unknown> | null;
}

export async function upsertAgentSession(
  db: SeekuDatabase,
  input: UpsertAgentSessionInput
) {
  const values = {
    sessionId: input.sessionId,
    origin: input.origin,
    posture: input.posture,
    transcript: input.transcript,
    latestSnapshot: input.latestSnapshot ?? {},
    updatedAt: new Date()
  } as const;

  const [record] = await db
    .insert(agentSessions)
    .values(values)
    .onConflictDoUpdate({
      target: agentSessions.sessionId,
      set: values
    })
    .returning();

  return record;
}

export async function getAgentSession(db: SeekuDatabase, sessionId: string) {
  const [record] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.sessionId, sessionId))
    .limit(1);

  return record ?? null;
}

export async function listRecentAgentSessions(db: SeekuDatabase, limit = 10) {
  return db
    .select()
    .from(agentSessions)
    .orderBy(desc(agentSessions.updatedAt))
    .limit(limit);
}
