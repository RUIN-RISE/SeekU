import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, desc, sql, persons, profileClaims, type SeekuDatabase } from "@seeku/db";

/**
 * Admin claims audit routes (D-04).
 *
 * GET /admin/claims - List all claims for audit with filters and pagination
 * POST /admin/claims/:claimId/revoke - Revoke a claim with reason
 */

interface ClaimsListQuery {
  status?: string;
  method?: string;
  limit?: string;
  offset?: string;
}

interface ClaimsListResponse {
  claims: Array<{
    claimId: string;
    personId: string;
    personName: string;
    method: string;
    status: string;
    submittedAt: string;
    verifiedAt: string | null;
    verifiedEmail: string | null;
    verifiedGitHubLogin: string | null;
  }>;
  total: number;
}

interface RevokeClaimBody {
  reason: string;
}

interface RevokeClaimResponse {
  success: boolean;
  claim: {
    id: string;
    status: string;
    revokedAt: string;
    revokeReason: string;
  };
}

interface ErrorResponse {
  error: string;
  message?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /admin/claims
 * List all claims for audit with filters and pagination.
 */
async function handleListClaims(
  db: SeekuDatabase,
  request: FastifyRequest<{ Querystring: ClaimsListQuery }>
): Promise<ClaimsListResponse> {
  const { status, method, limit, offset } = request.query;

  const limitNum = Math.min(MAX_LIMIT, parseInt(limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);
  const offsetNum = Math.max(0, parseInt(offset ?? "0", 10) || 0);

  // Build where conditions
  const conditions: any[] = [];
  if (status && ["pending", "approved", "rejected", "revoked"].includes(status)) {
    conditions.push(eq(profileClaims.status, status as any));
  }
  if (method && ["email", "github"].includes(method)) {
    conditions.push(eq(profileClaims.method, method as any));
  }

  // Fetch claims with person join
  const claims = await db
    .select({
      claimId: profileClaims.id,
      personId: profileClaims.personId,
      personName: persons.primaryName,
      method: profileClaims.method,
      status: profileClaims.status,
      submittedAt: profileClaims.submittedAt,
      verifiedAt: profileClaims.verifiedAt,
      verifiedEmail: profileClaims.verifiedEmail,
      verifiedGitHubLogin: profileClaims.verifiedGitHubLogin
    })
    .from(profileClaims)
    .leftJoin(persons, eq(profileClaims.personId, persons.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(profileClaims.submittedAt))
    .limit(limitNum)
    .offset(offsetNum);

  // Count total
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profileClaims)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return {
    claims: claims.map((c) => ({
      claimId: c.claimId,
      personId: c.personId,
      personName: c.personName ?? "Unknown",
      method: c.method,
      status: c.status,
      submittedAt: c.submittedAt.toISOString(),
      verifiedAt: c.verifiedAt?.toISOString() ?? null,
      verifiedEmail: c.verifiedEmail ?? null,
      verifiedGitHubLogin: c.verifiedGitHubLogin ?? null
    })),
    total: countResult[0]?.count ?? 0
  };
}

/**
 * POST /admin/claims/:claimId/revoke
 * Revoke a claim and update person status back to active.
 */
async function handleRevokeClaim(
  db: SeekuDatabase,
  request: FastifyRequest<{ Params: { claimId: string }; Body: RevokeClaimBody }>,
  reply: FastifyReply
): Promise<RevokeClaimResponse | ReturnType<FastifyReply["status"]>> {
  const { claimId } = request.params;
  const { reason } = request.body;

  // Require reason for revocation (D-04)
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return reply.status(400).send({
      error: "reason_required",
      message: "A reason must be provided for revocation"
    });
  }

  // Fetch the claim
  const claim = await db
    .select()
    .from(profileClaims)
    .where(eq(profileClaims.id, claimId))
    .limit(1);

  if (claim.length === 0) {
    return reply.status(404).send({
      error: "not_found",
      message: "Claim not found"
    });
  }

  const existingClaim = claim[0];

  // Check if already revoked
  if (existingClaim.status === "revoked") {
    return reply.status(400).send({
      error: "already_revoked",
      message: "Claim is already revoked"
    });
  }

  // Update claim status to revoked
  const [updatedClaim] = await db
    .update(profileClaims)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokeReason: reason.trim()
    })
    .where(eq(profileClaims.id, claimId))
    .returning();

  // Update person status back to active (un-claim)
  await db
    .update(persons)
    .set({ searchStatus: "active", updatedAt: new Date() })
    .where(eq(persons.id, existingClaim.personId));

  return {
    success: true,
    claim: {
      id: updatedClaim.id,
      status: updatedClaim.status,
      revokedAt: updatedClaim.revokedAt!.toISOString(),
      revokeReason: updatedClaim.revokeReason ?? reason.trim()
    }
  };
}

export function registerAdminClaimsRoutes(server: FastifyInstance, db: SeekuDatabase) {
  // Register under admin namespace with auth pattern matching existing admin.ts
  server.register(async (admin) => {
    admin.addHook("onRequest", (request, reply, done) => {
      const adminKey = process.env.API_ADMIN_KEY;

      if (!adminKey) {
        // For MVP testing, allow access without admin key if not configured
        done();
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
        reply.status(401).send({ error: "unauthorized" });
        return;
      }

      done();
    });

    // GET /admin/claims - List claims for audit (D-04)
    admin.get("/admin/claims", async (request) => handleListClaims(db, request));

    // POST /admin/claims/:claimId/revoke - Revoke claim (D-04)
    admin.post<{ Params: { claimId: string }; Body: RevokeClaimBody }>(
      "/admin/claims/:claimId/revoke",
      async (request, reply) => handleRevokeClaim(db, request, reply)
    );
  });
}