import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, persons, profileClaims, type SeekuDatabase } from "@seeku/db";

/**
 * Email verification endpoint for profile claim auto-approval.
 *
 * GET /claim/verify?token=xxx
 * - Validates JWT token
 * - Auto-approves claim per D-04
 * - Updates person searchStatus to "claimed"
 */

interface ClaimVerifyResponseBody {
  status: "verified" | "invalid_token" | "already_verified" | "error";
  personId?: string;
  message?: string;
}

async function handleClaimVerify(
  db: SeekuDatabase,
  request: FastifyRequest<{ Querystring: { token?: string } }>,
  reply: FastifyReply
): Promise<ClaimVerifyResponseBody | ReturnType<FastifyReply["status"]>> {
  const { token } = request.query;

  if (!token || typeof token !== "string") {
    return reply.status(400).send({
      status: "error",
      message: "token is required"
    });
  }

  // Verify JWT token
  const { jwtVerify } = await import("jose");
  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return reply.status(500).send({
      status: "error",
      message: "JWT_SECRET not configured"
    });
  }
  const secretKey = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify<{ personId: string; email: string; type: string }>(
      token,
      secretKey
    );

    // Validate token type
    if (payload.type !== "claim") {
      return reply.status(400).send({
        status: "invalid_token",
        message: "Invalid token type"
      });
    }

    const { personId, email } = payload;

    // Find pending claim for this person
    const pendingClaims = await db
      .select()
      .from(profileClaims)
      .where(and(eq(profileClaims.personId, personId), eq(profileClaims.status, "pending")))
      .limit(1);

    if (pendingClaims.length === 0) {
      // Check if already verified
      const approvedClaims = await db
        .select()
        .from(profileClaims)
        .where(and(eq(profileClaims.personId, personId), eq(profileClaims.status, "approved")))
        .limit(1);

      if (approvedClaims.length > 0) {
        return {
          status: "already_verified",
          personId,
          message: "Profile already verified"
        };
      }

      return reply.status(404).send({
        status: "error",
        message: "No pending claim found"
      });
    }

    const claim = pendingClaims[0];

    // Auto-approve per D-04: "验证成功后自动标记为 verified"
    // Use transaction for atomicity
    await db.transaction(async (tx) => {
      // Update claim status
      await tx
        .update(profileClaims)
        .set({
          status: "approved",
          verifiedEmail: email,
          verifiedAt: new Date()
        })
        .where(eq(profileClaims.id, claim.id));

      // Update person searchStatus to "claimed"
      await tx
        .update(persons)
        .set({
          searchStatus: "claimed",
          updatedAt: new Date()
        })
        .where(eq(persons.id, personId));
    });

    return {
      status: "verified",
      personId,
      message: "Profile claim verified successfully"
    };
  } catch {
    // Token invalid or expired
    return reply.status(400).send({
      status: "invalid_token",
      message: "Token is invalid or expired"
    });
  }
}

export function registerClaimVerifyRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get<{ Querystring: { token?: string } }>("/claim/verify", async (request, reply) =>
    handleClaimVerify(db, request, reply)
  );
}