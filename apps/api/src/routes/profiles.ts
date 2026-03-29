import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { and, eq } from "drizzle-orm";
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
}

interface NotFoundResponse {
  error: "not_found";
}

async function handleProfile(
  db: SeekuDatabase,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ProfileResponse | ReturnType<FastifyReply["status"]>> {
  const params = request.params as { personId: string };
  const { personId } = params;

  // Fetch person with searchStatus="active" (exclude hidden/claimed)
  const personResults = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.searchStatus, "active")));

  if (personResults.length === 0) {
    return reply.status(404).send({ error: "not_found" } as NotFoundResponse);
  }

  // Fetch all evidence items for this person
  const evidence = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.personId, personId));

  return {
    person: personResults[0],
    evidence
  };
}

export function registerProfileRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get<{ Params: { personId: string } }>(
    "/profiles/:personId",
    async (request, reply) => handleProfile(db, request, reply)
  );
}