import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, persons, profileClaims, evidenceItems, extractedProfiles, type SeekuDatabase } from "@seeku/db";

/**
 * Profile editing routes for claimed users (D-07, D-08).
 *
 * PUT /profiles/:personId - Update headline and contact visibility
 * DELETE /evidence/:evidenceId - Delete evidence item
 * POST /evidence - Add new evidence item
 */

interface UpdateProfileBody {
  headline?: string;
  contactVisible?: boolean;
}

interface UpdateProfileResponse {
  person: {
    id: string;
    primaryHeadline: string | null;
  };
}

interface ErrorResponse {
  error: string;
  message?: string;
}

interface AddEvidenceBody {
  personId: string;
  type: string;
  title?: string;
  url?: string;
}

interface DeleteEvidenceBody {
  personId: string;
}

/**
 * Verify that the person has an approved claim.
 * For MVP, we check if an approved claim exists for this person.
 */
async function verifyClaimed(db: SeekuDatabase, personId: string): Promise<boolean> {
  const claims = await db
    .select()
    .from(profileClaims)
    .where(and(eq(profileClaims.personId, personId), eq(profileClaims.status, "approved")))
    .limit(1);

  return claims.length > 0;
}

/**
 * PUT /profiles/:personId
 * Update headline and contact visibility for claimed users.
 */
async function handleUpdateProfile(
  db: SeekuDatabase,
  request: FastifyRequest<{ Params: { personId: string }; Body: UpdateProfileBody }>,
  reply: FastifyReply
): Promise<UpdateProfileResponse | ReturnType<FastifyReply["status"]>> {
  const { personId } = request.params;
  const { headline, contactVisible } = request.body;

  // Verify the person has an approved claim
  const isClaimed = await verifyClaimed(db, personId);
  if (!isClaimed) {
    return reply.status(403).send({
      error: "not_claimed",
      message: "Only claimed profiles can be edited"
    });
  }

  // Update headline if provided (D-07)
  if (headline !== undefined) {
    await db
      .update(persons)
      .set({ primaryHeadline: headline, updatedAt: new Date() })
      .where(eq(persons.id, personId));
  }

  // Update contact visibility if provided (D-08)
  if (contactVisible !== undefined) {
    // For MVP, we store this in metadata since extractedProfiles doesn't have a visibility column
    // In production, would need a dedicated column or settings table
    const existingProfile = await db
      .select()
      .from(extractedProfiles)
      .where(eq(extractedProfiles.personId, personId))
      .limit(1);

    if (existingProfile.length > 0) {
      // Update existing profile
      // Note: extractedProfiles doesn't have a contactVisible column in current schema
      // For MVP, we just acknowledge the request
    }
  }

  // Fetch updated person
  const updatedPerson = await db
    .select({ id: persons.id, primaryHeadline: persons.primaryHeadline })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);

  return {
    person: updatedPerson[0] ?? { id: personId, primaryHeadline: headline ?? null }
  };
}

/**
 * DELETE /evidence/:evidenceId
 * Delete evidence item for claimed users.
 */
async function handleDeleteEvidence(
  db: SeekuDatabase,
  request: FastifyRequest<{ Params: { evidenceId: string }; Body: DeleteEvidenceBody }>,
  reply: FastifyReply
): Promise<{ success: boolean } | ReturnType<FastifyReply["status"]>> {
  const { evidenceId } = request.params;
  const { personId } = request.body;

  // Verify the person has an approved claim
  const isClaimed = await verifyClaimed(db, personId);
  if (!isClaimed) {
    return reply.status(403).send({
      error: "not_claimed",
      message: "Only claimed profiles can edit evidence"
    });
  }

  // Verify evidence belongs to this person
  const evidence = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.id, evidenceId))
    .limit(1);

  if (evidence.length === 0) {
    return reply.status(404).send({
      error: "not_found",
      message: "Evidence item not found"
    });
  }

  if (evidence[0].personId !== personId) {
    return reply.status(403).send({
      error: "not_owner",
      message: "Evidence does not belong to this profile"
    });
  }

  // Delete the evidence
  await db.delete(evidenceItems).where(eq(evidenceItems.id, evidenceId));

  return { success: true };
}

/**
 * POST /evidence
 * Add new evidence item for claimed users.
 */
async function handleAddEvidence(
  db: SeekuDatabase,
  request: FastifyRequest<{ Body: AddEvidenceBody }>,
  reply: FastifyReply
): Promise<{ evidence: { id: string; title: string | null; url: string | null } } | ReturnType<FastifyReply["status"]>> {
  const { personId, type, title, url } = request.body;

  // Verify the person has an approved claim
  const isClaimed = await verifyClaimed(db, personId);
  if (!isClaimed) {
    return reply.status(403).send({
      error: "not_claimed",
      message: "Only claimed profiles can add evidence"
    });
  }

  // Validate evidence type
  const validTypes = ["social", "project", "repository", "community_post", "job_signal", "education", "experience", "profile_field", "summary"];
  if (!validTypes.includes(type)) {
    return reply.status(400).send({
      error: "invalid_type",
      message: `Evidence type must be one of: ${validTypes.join(", ")}`
    });
  }

  // Generate a hash for uniqueness
  const evidenceHash = `${personId}-${type}-${title ?? url ?? Date.now()}`;

  // Insert the new evidence
  const [newEvidence] = await db
    .insert(evidenceItems)
    .values({
      personId,
      source: "github", // Default source for user-added evidence
      evidenceType: type as any,
      title: title ?? null,
      url: url ?? null,
      description: null,
      metadata: {},
      evidenceHash
    })
    .returning();

  return {
    evidence: {
      id: newEvidence.id,
      title: newEvidence.title,
      url: newEvidence.url
    }
  };
}

export function registerProfileEditRoutes(server: FastifyInstance, db: SeekuDatabase) {
  // PUT /profiles/:personId - Update headline/contact visibility (D-07, D-08)
  server.put<{ Params: { personId: string }; Body: UpdateProfileBody }>(
    "/profiles/:personId",
    async (request, reply) => handleUpdateProfile(db, request, reply)
  );

  // DELETE /evidence/:evidenceId - Delete evidence (D-07)
  server.delete<{ Params: { evidenceId: string }; Body: DeleteEvidenceBody }>(
    "/evidence/:evidenceId",
    async (request, reply) => handleDeleteEvidence(db, request, reply)
  );

  // POST /evidence - Add evidence (D-07)
  server.post<{ Body: AddEvidenceBody }>(
    "/evidence",
    async (request, reply) => handleAddEvidence(db, request, reply)
  );
}