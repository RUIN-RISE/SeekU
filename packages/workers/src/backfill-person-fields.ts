import {
  createDatabaseConnection,
  getPersonById,
  getSourceProfileById,
  listAllPersons,
  listIdentitiesByPersonId,
  updatePerson,
  type Person,
  type SeekuDatabase,
  type SourceProfile
} from "@seeku/db";
import { selectPrimaryHeadline } from "@seeku/identity";

export interface BackfillPersonFieldsSummary {
  personsProcessed: number;
  personsUpdated: number;
  headlinesFilled: number;
  errors: Array<{ personId: string; message: string }>;
}

async function resolvePeople(db: SeekuDatabase, personIds?: string[]): Promise<Person[]> {
  if (!personIds || personIds.length === 0) {
    return listAllPersons(db, 500);
  }

  const rows = await Promise.all(personIds.map((personId) => getPersonById(db, personId)));
  return rows.filter((person): person is Person => Boolean(person));
}

async function loadProfilesForPerson(db: SeekuDatabase, personId: string): Promise<SourceProfile[]> {
  const identities = await listIdentitiesByPersonId(db, personId);
  const profiles = await Promise.all(
    identities.map((identity) => getSourceProfileById(db, identity.sourceProfileId))
  );

  return profiles.filter((profile): profile is SourceProfile => Boolean(profile));
}

export async function runBackfillPersonFieldsWorker(
  personIds?: string[],
  db?: SeekuDatabase
): Promise<BackfillPersonFieldsSummary> {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const people = await resolvePeople(database, personIds);
    const summary: BackfillPersonFieldsSummary = {
      personsProcessed: people.length,
      personsUpdated: 0,
      headlinesFilled: 0,
      errors: []
    };

    for (const person of people) {
      try {
        const profiles = await loadProfilesForPerson(database, person.id);
        const nextHeadline = selectPrimaryHeadline(profiles);

        if (nextHeadline) {
          summary.headlinesFilled += 1;
        }

        if (!nextHeadline || nextHeadline === person.primaryHeadline) {
          continue;
        }

        await updatePerson(database, person.id, {
          primaryHeadline: nextHeadline
        });
        summary.personsUpdated += 1;
      } catch (error) {
        summary.errors.push({
          personId: person.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return summary;
  } finally {
    await ownedConnection?.close();
  }
}
