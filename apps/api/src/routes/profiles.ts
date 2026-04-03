import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { and, eq, ne, sql } from "drizzle-orm";
import {
  evidenceItems,
  persons,
  profileClaims,
  type EvidenceItem,
  type Person,
  type SeekuDatabase
} from "@seeku/db";

interface ProfileResponse {
  person: Person;
  evidence: EvidenceItem[];
  total: number;
  claim?: {
    status: string;
    verifiedAt: Date | null;
  };
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

  // Fetch person excluding hidden profiles (allow active and claimed)
  const personResults = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), ne(persons.searchStatus, "hidden")));

  if (personResults.length === 0) {
    return reply.status(404).send({ error: "not_found" } as NotFoundResponse);
  }

  const person = personResults[0];

  // Fetch claim info if profile is claimed
  let claimInfo: ProfileResponse["claim"] = undefined;
  if (person.searchStatus === "claimed") {
    const claimResults = await db
      .select({
        status: profileClaims.status,
        verifiedAt: profileClaims.verifiedAt
      })
      .from(profileClaims)
      .where(and(eq(profileClaims.personId, personId), eq(profileClaims.status, "approved")))
      .limit(1);

    if (claimResults.length > 0) {
      claimInfo = {
        status: claimResults[0].status,
        verifiedAt: claimResults[0].verifiedAt
      };
    }
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
    person,
    evidence,
    total: countResult[0]?.count ?? 0,
    claim: claimInfo
  };
}

export function registerProfileRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get<{ Params: { personId: string } }>(
    "/profiles/:personId",
    async (request, reply) => handleProfile(db, request, reply)
  );
}
