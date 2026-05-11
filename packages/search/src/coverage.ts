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

export interface FacetQuality {
  withRole: number;
  withTags: number;
  withLocation: number;
  withRolePct: number;
  withTagsPct: number;
  withLocationPct: number;
}

export interface CoverageReport {
  totalPersons: number;
  activePersons: number;
  indexedPersons: number;
  embeddedPersons: number;
  freshEmbeddedPersons: number;
  staleEmbeddedPersons: number;
  multiSourcePersons: number;
  githubCoveredPersons: number;
  bonjourCoveredPersons: number;
  facetQuality: FacetQuality;
  coveragePercentage: {
    indexed: number;
    embedded: number;
    freshEmbedded: number;
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

  const [embeddingFreshness] = await db.select({
    fresh: sql<number>`count(DISTINCT ${searchDocuments.personId}) FILTER (
      WHERE ${searchEmbeddings.personId} IS NOT NULL
      AND ${searchEmbeddings.embeddedAt} >= ${searchDocuments.updatedAt}
    )::int`,
    stale: sql<number>`count(DISTINCT ${searchDocuments.personId}) FILTER (
      WHERE ${searchEmbeddings.personId} IS NOT NULL
      AND ${searchEmbeddings.embeddedAt} < ${searchDocuments.updatedAt}
    )::int`
  })
  .from(searchDocuments)
  .leftJoin(searchEmbeddings, eq(searchEmbeddings.personId, searchDocuments.personId));

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

  const [facetStats] = await db.select({
    withRole: sql<number>`count(*) FILTER (WHERE array_length(facet_role, 1) > 0)::int`,
    withTags: sql<number>`count(*) FILTER (WHERE array_length(facet_tags, 1) > 0)::int`,
    withLocation: sql<number>`count(*) FILTER (WHERE array_length(facet_location, 1) > 0)::int`
  }).from(searchDocuments);

  const indexedCount = indexed.count || 1; // avoid division by zero

  const report: CoverageReport = {
    totalPersons: counts.total || 0,
    activePersons: counts.active || 0,
    indexedPersons: indexed.count || 0,
    embeddedPersons: embedded.count || 0,
    freshEmbeddedPersons: embeddingFreshness.fresh || 0,
    staleEmbeddedPersons: embeddingFreshness.stale || 0,
    multiSourcePersons: sources.multi || 0,
    bonjourCoveredPersons: sources.bonjour || 0,
    githubCoveredPersons: sources.github || 0,
    facetQuality: {
      withRole: facetStats.withRole || 0,
      withTags: facetStats.withTags || 0,
      withLocation: facetStats.withLocation || 0,
      withRolePct: Math.round(((facetStats.withRole || 0) / indexedCount) * 100),
      withTagsPct: Math.round(((facetStats.withTags || 0) / indexedCount) * 100),
      withLocationPct: Math.round(((facetStats.withLocation || 0) / indexedCount) * 100)
    },
    coveragePercentage: {
      indexed: counts.active ? Math.round(((indexed.count || 0) / counts.active) * 100) : 0,
      embedded: counts.active ? Math.round(((embedded.count || 0) / counts.active) * 100) : 0,
      freshEmbedded: counts.active ? Math.round(((embeddingFreshness.fresh || 0) / counts.active) * 100) : 0,
      multiSource: counts.active ? Math.round(((sources.multi || 0) / counts.active) * 100) : 0
    }
  };

  return report;
}
