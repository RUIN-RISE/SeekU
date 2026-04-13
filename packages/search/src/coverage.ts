import { 
  eq, 
  and, 
  not,
  isNull, 
  sql, 
  persons, 
  searchDocuments, 
  searchEmbeddings, 
  personIdentities, 
  sourceProfiles, 
  type SeekuDatabase 
} from "@seeku/db";

export interface CoverageReport {
  totalPersons: number;
  activePersons: number;
  indexedPersons: number;
  embeddedPersons: number;
  multiSourcePersons: number;
  githubCoveredPersons: number;
  bonjourCoveredPersons: number;
  coveragePercentage: {
    indexed: number;
    embedded: number;
    multiSource: number;
  };
}

export async function runCoverageReport(db: SeekuDatabase): Promise<CoverageReport> {
  const [counts] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) FILTER (WHERE ${persons.searchStatus} = 'active')::int`
  }).from(persons);

  const [indexed] = await db.select({
    count: sql<number>`count(DISTINCT ${searchDocuments.personId})::int`
  }).from(searchDocuments);

  const [embedded] = await db.select({
    count: sql<number>`count(DISTINCT ${searchEmbeddings.personId})::int`
  }).from(searchEmbeddings);

  const [sources] = await db.select({
    bonjour: sql<number>`count(DISTINCT ${personIdentities.personId}) FILTER (WHERE ${sourceProfiles.source} = 'bonjour')::int`,
    github: sql<number>`count(DISTINCT ${personIdentities.personId}) FILTER (WHERE ${sourceProfiles.source} = 'github')::int`,
    multi: sql<number>`count(DISTINCT ${personIdentities.personId}) FILTER (WHERE ${personIdentities.personId} IN (
      SELECT person_id FROM person_identities pi 
      JOIN source_profiles sp ON sp.id = pi.source_profile_id 
      GROUP BY person_id HAVING count(DISTINCT sp.source) > 1
    ))::int`
  })
  .from(personIdentities)
  .innerJoin(sourceProfiles, eq(sourceProfiles.id, personIdentities.sourceProfileId));

  const report: CoverageReport = {
    totalPersons: counts.total || 0,
    activePersons: counts.active || 0,
    indexedPersons: indexed.count || 0,
    embeddedPersons: embedded.count || 0,
    multiSourcePersons: sources.multi || 0,
    bonjourCoveredPersons: sources.bonjour || 0,
    githubCoveredPersons: sources.github || 0,
    coveragePercentage: {
      indexed: counts.active ? Math.round((indexed.count / counts.active) * 100) : 0,
      embedded: counts.active ? Math.round((embedded.count / counts.active) * 100) : 0,
      multiSource: counts.active ? Math.round((sources.multi / counts.active) * 100) : 0
    }
  };

  return report;
}
