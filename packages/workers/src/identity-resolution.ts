import {
  createDatabaseConnection,
  listSourceProfilesByHandles,
  listSourceProfilesWithoutIdentity,
  type SeekuDatabase,
  type SourceProfile
} from "@seeku/db";
import { resolveIdentities, type ResolutionResult } from "@seeku/identity";

async function getUnlinkedProfiles(db: SeekuDatabase) {
  const [bonjour, github] = await Promise.all([
    listSourceProfilesWithoutIdentity(db, "bonjour", 500),
    listSourceProfilesWithoutIdentity(db, "github", 500)
  ]);

  return {
    bonjour,
    github
  };
}

export async function loadProfilesByHandles(
  db: SeekuDatabase,
  bonjourHandles: string[],
  githubHandles: string[]
): Promise<{ bonjour: SourceProfile[]; github: SourceProfile[] }> {
  const [bonjour, github] = await Promise.all([
    listSourceProfilesByHandles(db, "bonjour", bonjourHandles),
    listSourceProfilesByHandles(db, "github", githubHandles)
  ]);

  return {
    bonjour,
    github
  };
}

export async function runIdentityResolutionWorker(
  bonjourHandles?: string[],
  githubHandles?: string[],
  db?: SeekuDatabase
): Promise<ResolutionResult> {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const profiles =
      bonjourHandles && githubHandles
        ? await loadProfilesByHandles(database, bonjourHandles, githubHandles)
        : await getUnlinkedProfiles(database);

    return await resolveIdentities({
      db: database,
      bonjourProfiles: profiles.bonjour,
      githubProfiles: profiles.github
    });
  } finally {
    await ownedConnection?.close();
  }
}
