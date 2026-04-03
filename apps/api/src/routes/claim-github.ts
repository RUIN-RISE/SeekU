import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, persons, profileClaims, sourceProfiles, personIdentities, type SeekuDatabase } from "@seeku/db";

/**
 * GitHub OAuth callback endpoint for profile claim verification.
 *
 * GET /claim/github/callback?personId=xxx&code=xxx
 * - Exchanges code for GitHub access token
 * - Gets GitHub user profile (login/username)
 * - Verifies username matches profile's GitHub URL
 * - Auto-approves or rejects per D-03/D-04
 */

interface GitHubCallbackQuery {
  personId?: string;
  code?: string;
  state?: string;
}

interface GitHubCallbackResponseBody {
  status: "verified" | "verification_failed" | "error";
  personId?: string;
  reason?: string;
  message?: string;
}

interface GitHubUser {
  login: string;
  email?: string;
}

/**
 * Exchanges OAuth code for GitHub access token.
 */
async function exchangeCodeForToken(code: string): Promise<string | null> {
  const clientId = process.env.AUTH_GITHUB_ID ?? "";
  const clientSecret = process.env.AUTH_GITHUB_SECRET ?? "";

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const data = await response.json() as { access_token?: string; error?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Gets GitHub user profile using access token.
 */
async function getGitHubUser(accessToken: string): Promise<GitHubUser | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { login?: string; email?: string };
    return {
      login: data.login ?? "",
      email: data.email
    };
  } catch {
    return null;
  }
}

/**
 * Finds GitHub profile URL for a person and extracts username.
 */
async function getPersonGitHubUsername(db: SeekuDatabase, personId: string): Promise<string | null> {
  // Look for GitHub source profiles linked to this person
  const identities = await db
    .select({
      sourceProfileId: personIdentities.sourceProfileId
    })
    .from(personIdentities)
    .where(eq(personIdentities.personId, personId));

  if (identities.length === 0) {
    return null;
  }

  // Find GitHub source profiles
  const sourceProfileIds = identities.map((i) => i.sourceProfileId);
  const githubProfiles = await db
    .select({
      sourceHandle: sourceProfiles.sourceHandle,
      canonicalUrl: sourceProfiles.canonicalUrl,
      normalizedPayload: sourceProfiles.normalizedPayload
    })
    .from(sourceProfiles)
    .where(
      and(
        eq(sourceProfiles.source, "github"),
        // Use inArray for multiple IDs
        // Note: We need to import inArray
      )
    );

  // Actually let's simplify - use the import we need
  const { inArray } = await import("@seeku/db");
  const profiles = await db
    .select({
      sourceHandle: sourceProfiles.sourceHandle,
      canonicalUrl: sourceProfiles.canonicalUrl,
      normalizedPayload: sourceProfiles.normalizedPayload
    })
    .from(sourceProfiles)
    .where(
      and(
        eq(sourceProfiles.source, "github"),
        inArray(sourceProfiles.id, sourceProfileIds)
      )
    );

  if (profiles.length === 0) {
    return null;
  }

  // Return the sourceHandle which should be the GitHub username
  const profile = profiles[0];

  // Also check normalizedPayload for GitHub URL variations
  const payload = profile.normalizedPayload as Record<string, unknown>;
  const socialLinks = payload?.socialLinks as Record<string, string> | undefined;
  if (socialLinks?.github) {
    // Extract username from URL
    const match = socialLinks.github.match(/github\.com\/([^/]+)/);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // Fall back to sourceHandle
  return profile.sourceHandle?.toLowerCase() ?? null;
}

/**
 * Compares GitHub login with profile username (flexible matching per D-03).
 */
function matchesGitHubProfile(gitHubLogin: string, profileUsername: string | null): boolean {
  if (!profileUsername) {
    return false;
  }

  // Normalize both for comparison
  const normalizedLogin = gitHubLogin.toLowerCase().trim();
  const normalizedProfile = profileUsername.toLowerCase().trim();

  return normalizedLogin === normalizedProfile;
}

async function handleGitHubCallback(
  db: SeekuDatabase,
  request: FastifyRequest<{ Querystring: GitHubCallbackQuery }>,
  reply: FastifyReply
): Promise<GitHubCallbackResponseBody | ReturnType<FastifyReply["status"]>> {
  const { personId, code, state } = request.query;

  // Parse state if provided (contains personId and timestamp)
  let targetPersonId = personId;
  if (state && !personId) {
    try {
      const stateData = JSON.parse(decodeURIComponent(state)) as { personId?: string; timestamp?: number };
      targetPersonId = stateData.personId;
    } catch {
      // State parsing failed, use personId if available
    }
  }

  if (!targetPersonId) {
    return reply.status(400).send({
      status: "error",
      message: "personId is required (via query or state)"
    });
  }

  if (!code) {
    return reply.status(400).send({
      status: "error",
      message: "OAuth code is required"
    });
  }

  // Verify person exists
  const person = await db.select().from(persons).where(eq(persons.id, targetPersonId)).limit(1);
  if (person.length === 0) {
    return reply.status(404).send({
      status: "error",
      message: "Person not found"
    });
  }

  // Exchange code for access token
  const accessToken = await exchangeCodeForToken(code);
  if (!accessToken) {
    return reply.status(400).send({
      status: "error",
      message: "Failed to exchange OAuth code for access token"
    });
  }

  // Get GitHub user profile
  const githubUser = await getGitHubUser(accessToken);
  if (!githubUser || !githubUser.login) {
    return reply.status(400).send({
      status: "error",
      message: "Failed to get GitHub user profile"
    });
  }

  // Find the person's GitHub username from their profile
  const profileUsername = await getPersonGitHubUsername(db, targetPersonId);

  // Verify match per D-03: "验证登录 GitHub 是否匹配 profile 上的 GitHub 链接"
  const isMatch = matchesGitHubProfile(githubUser.login, profileUsername);

  // Find pending claim
  const pendingClaims = await db
    .select()
    .from(profileClaims)
    .where(
      and(
        eq(profileClaims.personId, targetPersonId),
        eq(profileClaims.status, "pending"),
        eq(profileClaims.method, "github")
      )
    )
    .limit(1);

  if (pendingClaims.length === 0) {
    // Check if already approved
    const approvedClaims = await db
      .select()
      .from(profileClaims)
      .where(
        and(
          eq(profileClaims.personId, targetPersonId),
          eq(profileClaims.status, "approved")
        )
      )
      .limit(1);

    if (approvedClaims.length > 0) {
      return {
        status: "verified",
        personId: targetPersonId,
        message: "Profile already verified"
      };
    }

    return reply.status(404).send({
      status: "error",
      message: "No pending GitHub claim found"
    });
  }

  const claim = pendingClaims[0];

  if (isMatch) {
    // Auto-approve per D-04
    await db.transaction(async (tx) => {
      await tx
        .update(profileClaims)
        .set({
          status: "approved",
          verifiedGitHubLogin: githubUser.login,
          verifiedAt: new Date()
        })
        .where(eq(profileClaims.id, claim.id));

      await tx
        .update(persons)
        .set({
          searchStatus: "claimed",
          updatedAt: new Date()
        })
        .where(eq(persons.id, targetPersonId));
    });

    return {
      status: "verified",
      personId: targetPersonId,
      message: "Profile claim verified successfully via GitHub"
    };
  }

  // Reject claim - GitHub profile mismatch
  await db
    .update(profileClaims)
    .set({
      status: "rejected",
      verifiedGitHubLogin: githubUser.login,
      verifiedAt: new Date(),
      metadata: {
        reason: "GitHub profile mismatch",
        expectedUsername: profileUsername,
        actualUsername: githubUser.login
      }
    })
    .where(eq(profileClaims.id, claim.id));

  return {
    status: "verification_failed",
    personId: targetPersonId,
    reason: "GitHub profile mismatch",
    message: `GitHub username '${githubUser.login}' does not match profile's GitHub username '${profileUsername}'`
  };
}

export function registerClaimGitHubRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get<{ Querystring: GitHubCallbackQuery }>("/claim/github/callback", async (request, reply) =>
    handleGitHubCallback(db, request, reply)
  );
}