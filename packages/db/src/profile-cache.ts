import { profileCache, type NewProfileCache, eq } from "./index.js";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";

const PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_CACHE_VERSION = 2;

interface ProfileCacheEntry {
  profile: unknown;
  overallScore?: string;
  cachedAt: string;
  expiresAt: string;
}

interface ProfileCacheEnvelope {
  version: number;
  entries: Record<string, ProfileCacheEntry>;
}

function isProfileCacheEnvelope(value: unknown): value is ProfileCacheEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === PROFILE_CACHE_VERSION &&
    typeof candidate.entries === "object" &&
    candidate.entries !== null &&
    !Array.isArray(candidate.entries)
  );
}

function pruneExpiredEntries(entries: Record<string, ProfileCacheEntry>, now = Date.now()) {
  return Object.fromEntries(
    Object.entries(entries).filter(([, entry]) => {
      const expiresAt = new Date(entry.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    })
  );
}

function getEnvelopeExpiry(entries: Record<string, ProfileCacheEntry>) {
  const expirations = Object.values(entries)
    .map((entry) => new Date(entry.expiresAt).getTime())
    .filter((value) => Number.isFinite(value));

  const latestExpiry = expirations.length > 0 ? Math.max(...expirations) : Date.now() + PROFILE_CACHE_TTL_MS;
  return new Date(latestExpiry);
}

export class ProfileCacheRepository {
  constructor(private db: NodePgDatabase<any>) {}

  async getProfile(personId: string, queryKey: string): Promise<any | null> {
    const results = await this.db
      .select()
      .from(profileCache)
      .where(eq(profileCache.personId, personId))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    if (!isProfileCacheEnvelope(row.profile)) {
      // Ignore legacy single-profile cache entries because they are not query scoped.
      return null;
    }

    const entries = pruneExpiredEntries(row.profile.entries);
    const entry = entries[queryKey];
    return entry ? entry.profile : null;
  }

  async setProfile(personId: string, queryKey: string, profile: any, overallScore?: number): Promise<void> {
    const existing = await this.db
      .select()
      .from(profileCache)
      .where(eq(profileCache.personId, personId))
      .limit(1);

    const existingEntries =
      existing.length > 0 && isProfileCacheEnvelope(existing[0].profile)
        ? pruneExpiredEntries(existing[0].profile.entries)
        : {};

    const cachedAt = new Date();
    const expiresAt = new Date(Date.now() + PROFILE_CACHE_TTL_MS);

    const nextEntries: Record<string, ProfileCacheEntry> = {
      ...existingEntries,
      [queryKey]: {
        profile,
        overallScore: overallScore?.toString(),
        cachedAt: cachedAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      }
    };

    const data: NewProfileCache = {
      personId,
      profile: {
        version: PROFILE_CACHE_VERSION,
        entries: nextEntries
      },
      overallScore: overallScore?.toString(),
      cachedAt,
      expiresAt: getEnvelopeExpiry(nextEntries)
    };

    await this.db
      .insert(profileCache)
      .values(data)
      .onConflictDoUpdate({
        target: profileCache.personId,
        set: {
          profile: data.profile,
          overallScore: data.overallScore,
          cachedAt: data.cachedAt,
          expiresAt: data.expiresAt
        }
      });
  }

  async invalidate(personId: string, queryKey?: string): Promise<void> {
    if (!queryKey) {
      await this.db.delete(profileCache).where(eq(profileCache.personId, personId));
      return;
    }

    const existing = await this.db
      .select()
      .from(profileCache)
      .where(eq(profileCache.personId, personId))
      .limit(1);

    if (existing.length === 0 || !isProfileCacheEnvelope(existing[0].profile)) {
      await this.db.delete(profileCache).where(eq(profileCache.personId, personId));
      return;
    }

    const remainingEntries = pruneExpiredEntries(existing[0].profile.entries);
    delete remainingEntries[queryKey];

    if (Object.keys(remainingEntries).length === 0) {
      await this.db.delete(profileCache).where(eq(profileCache.personId, personId));
      return;
    }

    await this.db
      .update(profileCache)
      .set({
        profile: {
          version: PROFILE_CACHE_VERSION,
          entries: remainingEntries
        },
        cachedAt: new Date(),
        expiresAt: getEnvelopeExpiry(remainingEntries)
      })
      .where(eq(profileCache.personId, personId));
  }
}
