import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, persons, profileClaims, type SeekuDatabase } from "@seeku/db";

/**
 * Claim submission endpoint for profile ownership verification.
 *
 * POST /claim
 * - Accepts email or github method
 * - Returns pending status with verification URL
 * - Prevents duplicate claims
 */

interface ClaimRequestBody {
  personId: string;
  email?: string;
  method: "email" | "github";
}

interface ClaimResponseBody {
  status: "pending_verification" | "pending_oauth" | "approved" | "error";
  verificationUrl?: string;
  oauthUrl?: string;
  claimId?: string;
  message?: string;
}

/**
 * Generates GitHub OAuth URL for claim verification.
 */
function buildGitHubOAuthUrl(personId: string): string {
  const clientId = process.env.AUTH_GITHUB_ID ?? "";
  const redirectUri = `${process.env.API_URL ?? "http://localhost:3000"}/claim/github/callback`;
  const state = encodeURIComponent(JSON.stringify({ personId, timestamp: Date.now() }));

  return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=read:user,user:email`;
}

/**
 * Sends verification email or logs URL for MVP testing.
 */
async function sendVerificationEmail(email: string, verificationUrl: string): Promise<void> {
  // MVP fallback: log URL to console
  if (!process.env.SMTP_HOST) {
    console.log(`[CLAIM] Verification URL for ${email}: ${verificationUrl}`);
    return;
  }

  // TODO: Implement actual email sending when SMTP is configured
  // For now, use console.log fallback per plan specification
  console.log(`[CLAIM] Verification URL for ${email}: ${verificationUrl}`);
}

async function handleClaim(
  db: SeekuDatabase,
  request: FastifyRequest<{ Body: ClaimRequestBody }>,
  reply: FastifyReply
): Promise<ClaimResponseBody | ReturnType<FastifyReply["status"]>> {
  const { personId, email, method } = request.body;

  // Validate required fields
  if (!personId || typeof personId !== "string") {
    return reply.status(400).send({
      status: "error",
      message: "personId is required"
    });
  }

  if (!method || (method !== "email" && method !== "github")) {
    return reply.status(400).send({
      status: "error",
      message: "method must be 'email' or 'github'"
    });
  }

  if (method === "email" && (!email || typeof email !== "string")) {
    return reply.status(400).send({
      status: "error",
      message: "email is required when method is 'email'"
    });
  }

  // Verify person exists
  const person = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);

  if (person.length === 0) {
    return reply.status(404).send({
      status: "error",
      message: "Person not found"
    });
  }

  // Check for existing approved claim (prevent duplicates per D-04)
  const existingClaim = await db
    .select()
    .from(profileClaims)
    .where(and(eq(profileClaims.personId, personId), eq(profileClaims.status, "approved")))
    .limit(1);

  if (existingClaim.length > 0) {
    return reply.status(409).send({
      status: "error",
      message: "Profile already claimed"
    });
  }

  // Handle email method
  if (method === "email" && email) {
    // Import JWT utilities dynamically to avoid bundling issues in API
    // The actual JWT generation should happen in a shared location
    // For now, we create a placeholder that the web app will fill in
    const webUrl = process.env.WEB_URL ?? "http://localhost:3001";

    // Generate verification token using jose (API needs jose too)
    // Import jose for JWT generation
    const { SignJWT } = await import("jose");
    const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return reply.status(500).send({
        status: "error",
        message: "JWT_SECRET not configured"
      });
    }
    const secretKey = new TextEncoder().encode(secret);

    const token = await new SignJWT({ personId, email, type: "claim" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secretKey);

    const verificationUrl = `${webUrl}/claim/verify?token=${token}`;

    // Insert pending claim
    const [claim] = await db
      .insert(profileClaims)
      .values({
        personId,
        method: "email",
        verifiedEmail: null, // Will be set on verification
        status: "pending"
      })
      .returning();

    // Send verification email (or log for MVP)
    await sendVerificationEmail(email, verificationUrl);

    return {
      status: "pending_verification",
      verificationUrl,
      claimId: claim.id
    };
  }

  // Handle GitHub method
  if (method === "github") {
    // Insert pending claim
    const [claim] = await db
      .insert(profileClaims)
      .values({
        personId,
        method: "github",
        verifiedGitHubLogin: null, // Will be set on OAuth callback
        status: "pending"
      })
      .returning();

    const oauthUrl = buildGitHubOAuthUrl(personId);

    return {
      status: "pending_oauth",
      oauthUrl,
      claimId: claim.id
    };
  }

  // Should never reach here due to validation above
  return reply.status(400).send({
    status: "error",
    message: "Invalid method"
  });
}

export function registerClaimRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.post<{ Body: ClaimRequestBody }>("/claim", async (request, reply) =>
    handleClaim(db, request, reply)
  );
}