import {
  coerceJsonObject,
  createDatabaseConnection,
  createEvidenceItem,
  getSourceProfileById,
  listAllPersons,
  listIdentitiesByPersonId,
  type SeekuDatabase
} from "@seeku/db";
import {
  extractAllBonjourEvidence,
  extractAllGithubEvidence,
  type EvidenceItemInput
} from "@seeku/identity";
import type { BonjourProfile, GithubProfile, GithubRepository } from "@seeku/adapters";

function coerceGithubPayload(value: unknown): {
  profile?: GithubProfile;
  repositories?: GithubRepository[];
} {
  const payload = coerceJsonObject(value);
  const repositories = Array.isArray(payload.repositories)
    ? (payload.repositories as GithubRepository[])
    : [];

  return {
    profile: payload.profile as GithubProfile | undefined,
    repositories
  };
}

async function persistEvidenceItems(
  db: SeekuDatabase,
  personId: string,
  sourceProfileId: string,
  items: EvidenceItemInput[]
) {
  let itemsCreated = 0;

  for (const item of items) {
    const created = await createEvidenceItem(db, {
      personId,
      sourceProfileId,
      source: item.source,
      evidenceType: item.evidenceType,
      title: item.title,
      description: item.description,
      url: item.url,
      occurredAt: item.occurredAt,
      metadata: item.metadata,
      evidenceHash: item.evidenceHash
    });

    if (created) {
      itemsCreated += 1;
    }
  }

  return itemsCreated;
}

export async function storeEvidenceForPerson(db: SeekuDatabase, personId: string) {
  let itemsCreated = 0;
  const errors: Array<{ message: string }> = [];
  const identities = await listIdentitiesByPersonId(db, personId);

  for (const identity of identities) {
    const sourceProfile = await getSourceProfileById(db, identity.sourceProfileId);
    if (!sourceProfile) {
      continue;
    }

    try {
      if (sourceProfile.source === "bonjour") {
        const rawProfile = coerceJsonObject(sourceProfile.rawPayload) as unknown as BonjourProfile;
        const extraction = extractAllBonjourEvidence(rawProfile);
        itemsCreated += await persistEvidenceItems(db, personId, sourceProfile.id, extraction.items);
      }

      if (sourceProfile.source === "github") {
        const rawPayload = coerceGithubPayload(sourceProfile.rawPayload);
        if (!rawPayload.profile) {
          throw new Error("GitHub payload missing profile object.");
        }
        const extraction = extractAllGithubEvidence(
          rawPayload.profile,
          rawPayload.repositories ?? []
        );
        itemsCreated += await persistEvidenceItems(db, personId, sourceProfile.id, extraction.items);
      }

      if (sourceProfile.source === "web") {
        const payload = coerceJsonObject(sourceProfile.normalizedPayload);
        const extraction = (await import("@seeku/identity")).extractWebEvidence(payload);
        itemsCreated += await persistEvidenceItems(db, personId, sourceProfile.id, extraction.items);
      }
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    itemsCreated,
    errors
  };
}

export async function runEvidenceStorageWorker(personIds?: string[], db?: SeekuDatabase) {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const people =
      personIds && personIds.length > 0
        ? await Promise.all(personIds.map((personId) => Promise.resolve({ id: personId })))
        : await listAllPersons(database, 500);

    let itemsCreated = 0;
    const errors: Array<{ message: string; context?: unknown }> = [];

    for (const person of people) {
      const result = await storeEvidenceForPerson(database, person.id);
      itemsCreated += result.itemsCreated;
      errors.push(...result.errors.map((error) => ({ ...error, context: { personId: person.id } })));
    }

    return {
      personsProcessed: people.length,
      itemsCreated,
      errors
    };
  } finally {
    await ownedConnection?.close();
  }
}
