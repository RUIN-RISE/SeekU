import { SignJWT, jwtVerify } from "jose";

/**
 * JWT-based email verification token utilities for profile claim flow.
 *
 * Uses stateless JWT tokens instead of database storage for:
 * - Auto-expiration (no cleanup needed)
 * - No database round-trip for verification
 * - Simpler implementation
 */

/**
 * Secret key for JWT signing and verification.
 * Uses JWT_SECRET env var (same as Auth.js session secret).
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET or NEXTAUTH_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Payload structure for email verification tokens.
 */
interface ClaimTokenPayload {
  personId: string;
  email: string;
  type: "claim";
}

/**
 * Generates a JWT token for email verification.
 *
 * @param personId - The UUID of the person claiming the profile
 * @param email - The email address being verified
 * @returns Promise resolving to the JWT token string
 */
export async function generateVerificationToken(
  personId: string,
  email: string
): Promise<string> {
  const secretKey = getSecretKey();

  const token = await new SignJWT({ personId, email, type: "claim" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);

  return token;
}

/**
 * Verifies and decodes an email verification JWT token.
 *
 * @param token - The JWT token to verify
 * @returns Promise resolving to the payload if valid, null if invalid/expired
 */
export async function verifyEmailToken(
  token: string
): Promise<{ personId: string; email: string } | null> {
  try {
    const secretKey = getSecretKey();

    const { payload } = await jwtVerify<ClaimTokenPayload>(token, secretKey);

    // Validate token type
    if (payload.type !== "claim") {
      return null;
    }

    // Validate required fields
    if (!payload.personId || !payload.email) {
      return null;
    }

    return {
      personId: payload.personId,
      email: payload.email,
    };
  } catch {
    // Token invalid, expired, or malformed
    return null;
  }
}