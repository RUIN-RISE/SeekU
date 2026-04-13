import "dotenv/config";
import { createDatabaseConnection, sourceProfiles, eq } from "../packages/db/src/index.js";
import { normalizeBonjourProfile } from "../packages/adapters/src/bonjour/normalize.js";

async function main() {
  const { db, close } = createDatabaseConnection();
  
  try {
    const profiles = await db
      .select()
      .from(sourceProfiles)
      .where(eq(sourceProfiles.source, "bonjour"));
      
    console.info(`Found ${profiles.length} Bonjour profiles to re-normalize.`);
    
    let updatedCount = 0;
    for (const profile of profiles) {
      if (!profile.rawPayload) continue;
      
      const normalized = normalizeBonjourProfile(profile.rawPayload as any);
      
      // Log znqcfu for verification
      if (profile.sourceHandle === "znqcfu") {
        console.info(`znqcfu aliases:`, JSON.stringify(normalized.aliases, null, 2));
      }

      await db
        .update(sourceProfiles)
        .set({
          normalizedPayload: normalized as any,
          lastSyncedAt: new Date()
        })
        .where(eq(sourceProfiles.id, profile.id));
      
      updatedCount++;
      if (updatedCount % 100 === 0) {
        console.info(`Updated ${updatedCount}/${profiles.length}...`);
      }
    }
    
    console.info(`Successfully re-normalized ${updatedCount} profiles.`);
  } finally {
    await close();
  }
}

main().catch(console.error);
