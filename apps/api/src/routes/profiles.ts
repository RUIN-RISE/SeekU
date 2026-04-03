import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { and, eq, sql } from "drizzle-orm";
import {
  evidenceItems,
  persons,
  type EvidenceItem,
  type Person,
  type SeekuDatabase
} from "@seeku/db";

interface ProfileResponse {
  person: Person;
  evidence: EvidenceItem[];
  total: number;
}

interface NotFoundResponse {
  error: "not_found";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_EVIDENCE_LIMIT = 50;
const MAX_EVIDENCE_LIMIT = 200;

async function handleProfile(
  db: SeekuDatabase,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ProfileResponse | ReturnType<FastifyReply["status"]>> {
  const params = request.params as { personId: string };
  const query = request.query as { limit?: string; offset?: string };
  const { personId } = params;

  if (!UUID_PATTERN.test(personId)) {
    return reply.status(400).send({
      error: "invalid_request",
      message: "personId must be a valid UUID"
    });
  }

  const limit = Math.max(1, Math.min(
    MAX_EVIDENCE_LIMIT,
    parseInt(query.limit ?? String(DEFAULT_EVIDENCE_LIMIT), 10) || DEFAULT_EVIDENCE_LIMIT
  ));
  const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

  // Fetch person with searchStatus="active" (exclude hidden/claimed)
  const personResults = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.searchStatus, "active")));

  if (personResults.length === 0) {
    return reply.status(404).send({ error: "not_found" } as NotFoundResponse);
  }

  // Fetch evidence with pagination
  const [evidence, countResult] = await Promise.all([
    db
      .select()
      .from(evidenceItems)
      .where(eq(evidenceItems.personId, personId))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(evidenceItems)
      .where(eq(evidenceItems.personId, personId))
  ]);

  return {
    person: personResults[0],
    evidence,
    total: countResult[0]?.count ?? 0
  };
}

export function registerProfileRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get<{ Params: { personId: string } }>(
    "/profiles/:personId",
    async (request, reply) => handleProfile(db, request, reply)
  );
}
