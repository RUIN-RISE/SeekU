import { profileCache, type ProfileCache, type NewProfileCache, eq, and, sql } from "./index.js";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";

export class ProfileCacheRepository {
  constructor(private db: NodePgDatabase<any>) {}

  async getProfile(personId: string): Promise<any | null> {
    const results = await this.db
      .select()
      .from(profileCache)
      .where(
        and(
          eq(profileCache.personId, personId),
          sql`${profileCache.expiresAt} > NOW()`
        )
      )
      .limit(1);

    return results.length > 0 ? results[0].profile : null;
  }

  async setProfile(personId: string, profile: any, overallScore?: number): Promise<void> {
    const data: NewProfileCache = {
      personId,
      profile,
      overallScore: overallScore?.toString(),
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
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

  async invalidate(personId: string): Promise<void> {
    await this.db.delete(profileCache).where(eq(profileCache.personId, personId));
  }
}
