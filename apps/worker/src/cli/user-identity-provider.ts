/**
 * User identity provider for the CLI agent product.
 *
 * In V1, the CLI is a single-user local environment.
 * This provider resolves a stable user identity from a persisted local profile.
 * If no profile exists, it generates and persists a stable anonymous ID.
 *
 * This abstraction ensures no call site passes raw ad hoc user_id strings.
 *
 * The profile is stored in ~/.seeku/profile.json, consistent with session cache location.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const SEEKU_HOME_DIR = ".seeku";
const PROFILE_FILE = "profile.json";

export interface ResolvedUserIdentity {
  userId: string;
  source: "local_profile" | "generated";
}

export interface LocalProfile {
  userId: string;
  createdAt: string;
}

function getProfilePath(): string {
  return join(homedir(), SEEKU_HOME_DIR, PROFILE_FILE);
}

function readLocalProfile(profilePath: string): LocalProfile | null {
  if (!existsSync(profilePath)) {
    return null;
  }
  try {
    const raw = readFileSync(profilePath, "utf-8");
    return JSON.parse(raw) as LocalProfile;
  } catch {
    return null;
  }
}

function writeLocalProfile(profilePath: string, profile: LocalProfile): void {
  const dir = dirname(profilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf-8");
}

export class UserIdentityProvider {
  private resolvedIdentity: ResolvedUserIdentity | null = null;
  private readonly profilePath: string;

  /**
   * Create a UserIdentityProvider.
   *
   * In V1, the profile is always stored in ~/.seeku/profile.json.
   * The constructor takes no arguments to enforce consistent user identity
   * regardless of working directory.
   */
  constructor() {
    this.profilePath = getProfilePath();
  }

  /**
   * Resolve the current user identity.
   *
   * - If a persisted local profile exists, use its userId.
   * - Otherwise, generate a stable anonymous ID and persist it.
   *
   * The result is cached for the lifetime of the provider instance.
   */
  resolve(): ResolvedUserIdentity {
    if (this.resolvedIdentity) {
      return this.resolvedIdentity;
    }

    const existing = readLocalProfile(this.profilePath);
    if (existing && existing.userId) {
      this.resolvedIdentity = {
        userId: existing.userId,
        source: "local_profile"
      };
      return this.resolvedIdentity;
    }

    const newUserId = `local-${randomUUID()}`;
    const profile: LocalProfile = {
      userId: newUserId,
      createdAt: new Date().toISOString()
    };
    writeLocalProfile(this.profilePath, profile);

    this.resolvedIdentity = {
      userId: newUserId,
      source: "generated"
    };
    return this.resolvedIdentity;
  }

  /**
   * Get the resolved user ID string.
   * Throws if resolve() has not been called.
   */
  getUserId(): string {
    if (!this.resolvedIdentity) {
      throw new Error("UserIdentityProvider: resolve() must be called before getUserId()");
    }
    return this.resolvedIdentity.userId;
  }

  /**
   * Check if an identity has been resolved.
   */
  isResolved(): boolean {
    return this.resolvedIdentity !== null;
  }

  /**
   * Reset the resolved identity. Useful for testing.
   */
  reset(): void {
    this.resolvedIdentity = null;
  }
}
