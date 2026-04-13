import {
  attachProfilesToPerson,
  compareLocations,
  compareNames,
  type MatchResult
} from "@seeku/identity";
import {
  countEvidenceByPersonId,
  createDatabaseConnection,
  eq,
  extractAliasesFromNormalizedProfile,
  getPersonById,
  getSourceProfileById,
  listIdentitiesByPersonId,
  personIdentities,
  persons,
  searchDocuments,
  searchEmbeddings,
  sourceProfiles,
  type Person,
  type SeekuDatabase,
  type SourceProfile
} from "@seeku/db";
import { runBackfillPersonFieldsWorker } from "./backfill-person-fields.js";
import { runEvidenceStorageWorker } from "./evidence-storage.js";
import { runSearchIndexWorker } from "./search-index-worker.js";

type StrongAliasType = "github" | "x" | "jike";

interface BonjourProfileWithPerson {
  person: Person;
  profile: SourceProfile;
}

interface AliasEdgeReason {
  aliasType: StrongAliasType;
  aliasValue: string;
}

interface AliasGroupRecord {
  aliasType: StrongAliasType;
  aliasValue: string;
  personIds: string[];
}

interface DedupePersonStats {
  person: Person;
  identitiesCount: number;
  evidenceCount: number;
}

export interface BonjourStrongAliasDedupeSummary {
  candidateAliasGroups: number;
  qualifyingAliasGroups: number;
  componentsMerged: number;
  personsMerged: number;
  identitiesMoved: number;
  winnersUpdated: number;
  winnerPersonIds: string[];
}

function normalizeHandleishAlias(value: string, hosts: string[]) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  for (const host of hosts) {
    const prefix = `${host}/`;
    if (lower.startsWith(prefix)) {
      return lower.slice(prefix.length).replace(/^@/, "").split(/[/?#]/, 1)[0] || null;
    }
  }

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/^\/+/, "").replace(/^@/, "");
    return pathname.split(/[/?#]/, 1)[0]?.toLowerCase() || null;
  } catch {
    return lower.replace(/^@/, "");
  }
}

function canonicalizeStrongAlias(type: string, value: string): { type: StrongAliasType; value: string } | null {
  if (type === "github") {
    const normalized = normalizeHandleishAlias(value, ["github.com"]);
    if (!normalized || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(normalized)) {
      return null;
    }

    return { type, value: normalized };
  }

  if (type === "x") {
    const normalized = normalizeHandleishAlias(value, ["x.com", "twitter.com"]);
    if (!normalized || !/^[a-z\d_]{1,15}$/i.test(normalized)) {
      return null;
    }

    return { type, value: normalized };
  }

  if (type === "jike") {
    const normalized = value.trim().replace(/^@/, "").toLowerCase();
    if (!normalized) {
      return null;
    }

    return { type, value: normalized };
  }

  return null;
}

function shouldCreateEdge(
  aliasType: StrongAliasType,
  left: Person,
  right: Person
) {
  const nameScore = compareNames(left.primaryName, right.primaryName);
  const locationScore = compareLocations(left.primaryLocation, right.primaryLocation);

  if (aliasType === "github") {
    return nameScore > 0 || locationScore >= 0.3;
  }

  return nameScore > 0 || locationScore >= 0.3;
}

function chooseWinner(stats: DedupePersonStats[]) {
  return [...stats].sort((left, right) => {
    return (
      right.identitiesCount - left.identitiesCount ||
      right.evidenceCount - left.evidenceCount ||
      left.person.createdAt.getTime() - right.person.createdAt.getTime() ||
      left.person.id.localeCompare(right.person.id)
    );
  })[0]!;
}

function collectConnectedComponents(edges: Map<string, Set<string>>) {
  const seen = new Set<string>();
  const components: string[][] = [];

  for (const personId of edges.keys()) {
    if (seen.has(personId)) {
      continue;
    }

    const queue = [personId];
    const component: string[] = [];
    seen.add(personId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const neighbor of edges.get(current) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (component.length > 1) {
      components.push(component);
    }
  }

  return components;
}

async function loadAllProfilesForPerson(db: SeekuDatabase, personId: string) {
  const identities = await listIdentitiesByPersonId(db, personId);
  const profiles = await Promise.all(
    identities.map((identity) => getSourceProfileById(db, identity.sourceProfileId))
  );

  return profiles.filter((profile): profile is SourceProfile => Boolean(profile));
}

async function loadBonjourProfilesWithPersons(db: SeekuDatabase): Promise<BonjourProfileWithPerson[]> {
  const rows = await db
    .select({
      person: persons,
      profile: sourceProfiles
    })
    .from(sourceProfiles)
    .innerJoin(personIdentities, eq(personIdentities.sourceProfileId, sourceProfiles.id))
    .innerJoin(persons, eq(persons.id, personIdentities.personId))
    .where(eq(sourceProfiles.source, "bonjour"));

  return rows;
}

function buildAliasGroups(rows: BonjourProfileWithPerson[]) {
  const aliasToPersons = new Map<string, Set<string>>();
  const aliasGroupMetadata = new Map<string, AliasEdgeReason>();

  for (const row of rows) {
    for (const alias of extractAliasesFromNormalizedProfile(row.profile)) {
      if (alias.confidence < 1) {
        continue;
      }

      const normalized = canonicalizeStrongAlias(alias.type, alias.value);
      if (!normalized) {
        continue;
      }

      const key = `${normalized.type}:${normalized.value}`;
      if (!aliasToPersons.has(key)) {
        aliasToPersons.set(key, new Set<string>());
        aliasGroupMetadata.set(key, {
          aliasType: normalized.type,
          aliasValue: normalized.value
        });
      }

      aliasToPersons.get(key)!.add(row.person.id);
    }
  }

  const groups: AliasGroupRecord[] = [];

  for (const [key, personIds] of aliasToPersons.entries()) {
    if (personIds.size <= 1) {
      continue;
    }

    const metadata = aliasGroupMetadata.get(key)!;
    groups.push({
      aliasType: metadata.aliasType,
      aliasValue: metadata.aliasValue,
      personIds: [...personIds]
    });
  }

  return groups;
}

function buildQualifyingEdges(
  groups: AliasGroupRecord[],
  personById: Map<string, Person>
) {
  const edges = new Map<string, Set<string>>();
  const reasons = new Map<string, AliasEdgeReason[]>();
  let qualifyingAliasGroups = 0;

  for (const group of groups) {
    let groupQualified = false;

    for (let index = 0; index < group.personIds.length; index += 1) {
      const leftId = group.personIds[index]!;
      const left = personById.get(leftId);
      if (!left) {
        continue;
      }

      for (let inner = index + 1; inner < group.personIds.length; inner += 1) {
        const rightId = group.personIds[inner]!;
        const right = personById.get(rightId);
        if (!right) {
          continue;
        }

        if (!shouldCreateEdge(group.aliasType, left, right)) {
          continue;
        }

        groupQualified = true;

        if (!edges.has(leftId)) {
          edges.set(leftId, new Set<string>());
        }
        if (!edges.has(rightId)) {
          edges.set(rightId, new Set<string>());
        }

        edges.get(leftId)!.add(rightId);
        edges.get(rightId)!.add(leftId);

        const pairKey = [leftId, rightId].sort().join(":");
        const pairReasons = reasons.get(pairKey) ?? [];
        pairReasons.push({
          aliasType: group.aliasType,
          aliasValue: group.aliasValue
        });
        reasons.set(pairKey, pairReasons);
      }
    }

    if (groupQualified) {
      qualifyingAliasGroups += 1;
    }
  }

  return {
    edges,
    reasons,
    qualifyingAliasGroups
  };
}

async function mergeComponent(
  db: SeekuDatabase,
  componentPersonIds: string[],
  reasonIndex: Map<string, AliasEdgeReason[]>
) {
  const stats = await Promise.all(
    componentPersonIds.map(async (personId) => {
      const person = await getPersonById(db, personId);
      if (!person) {
        return null;
      }

      const identities = await listIdentitiesByPersonId(db, personId);
      const evidenceCount = await countEvidenceByPersonId(db, personId);

      return {
        person,
        identitiesCount: identities.length,
        evidenceCount
      } satisfies DedupePersonStats;
    })
  );

  const available = stats.filter((item): item is DedupePersonStats => Boolean(item));
  if (available.length <= 1) {
    return null;
  }

  const winner = chooseWinner(available);
  let identitiesMoved = 0;
  let personsMerged = 0;

  await db.transaction(async (tx) => {
    for (const loser of available) {
      if (loser.person.id === winner.person.id) {
        continue;
      }

      const profiles = await loadAllProfilesForPerson(tx, loser.person.id);
      const reason = reasonIndex.get([winner.person.id, loser.person.id].sort().join(":")) ?? [];
      const matchResults = new Map<string, MatchResult>(
        profiles.map((profile) => [
          profile.id,
          {
            confidence: 1,
            reasons:
              reason.length > 0
                ? reason.map((item) => ({
                    signal: `strong_alias_${item.aliasType}`,
                    confidence: 1
                  }))
                : [{ signal: "strong_alias_dedupe", confidence: 1 }]
          }
        ])
      );

      await attachProfilesToPerson(tx, winner.person.id, profiles, matchResults);
      await tx.delete(searchDocuments).where(eq(searchDocuments.personId, loser.person.id));
      await tx.delete(searchEmbeddings).where(eq(searchEmbeddings.personId, loser.person.id));
      await tx.delete(persons).where(eq(persons.id, loser.person.id));

      identitiesMoved += profiles.length;
      personsMerged += 1;
    }

    await tx.delete(searchDocuments).where(eq(searchDocuments.personId, winner.person.id));
    await tx.delete(searchEmbeddings).where(eq(searchEmbeddings.personId, winner.person.id));
  });

  return {
    winnerPersonId: winner.person.id,
    identitiesMoved,
    personsMerged
  };
}

export async function runBonjourStrongAliasDedupeWorker(
  db?: SeekuDatabase
): Promise<BonjourStrongAliasDedupeSummary> {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const rows = await loadBonjourProfilesWithPersons(database);
    const personById = new Map<string, Person>();
    for (const row of rows) {
      personById.set(row.person.id, row.person);
    }

    const aliasGroups = buildAliasGroups(rows);
    const { edges, reasons, qualifyingAliasGroups } = buildQualifyingEdges(aliasGroups, personById);
    const components = collectConnectedComponents(edges);

    const winnerIds = new Set<string>();
    let personsMerged = 0;
    let identitiesMoved = 0;

    for (const component of components) {
      const merged = await mergeComponent(database, component, reasons);
      if (!merged) {
        continue;
      }

      winnerIds.add(merged.winnerPersonId);
      personsMerged += merged.personsMerged;
      identitiesMoved += merged.identitiesMoved;
    }

    const winnerPersonIds = [...winnerIds];
    if (winnerPersonIds.length > 0) {
      await runEvidenceStorageWorker(winnerPersonIds, database);
      await runBackfillPersonFieldsWorker(winnerPersonIds, database);
      await runSearchIndexWorker(winnerPersonIds, database);
    }

    return {
      candidateAliasGroups: aliasGroups.length,
      qualifyingAliasGroups,
      componentsMerged: winnerIds.size,
      personsMerged,
      identitiesMoved,
      winnersUpdated: winnerIds.size,
      winnerPersonIds
    };
  } finally {
    await ownedConnection?.close();
  }
}
