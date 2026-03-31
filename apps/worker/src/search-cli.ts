import "dotenv/config";

import {
  and,
  eq,
  inArray,
  persons,
  evidenceItems,
  searchDocuments,
  sourceProfiles,
  personIdentities,
  createDatabaseConnection,
  type Person,
  type EvidenceItem,
  type SearchDocument
} from "@seeku/db";
import { SiliconFlowProvider } from "@seeku/llm";
import { QueryPlanner, HybridRetriever, Reranker, type QueryIntent } from "@seeku/search";
import { FALLBACK_MATCH_REASONS } from "@seeku/shared";
import type { ScriptSearchResponseOutput, ScriptSearchResultOutput, SearchConditions } from "./cli/types.js";
import {
  buildQueryMatchExplanation,
  buildResultWarning,
  classifyMatchStrength,
  describeRelativeDate,
  formatSourceLabel
} from "./cli/workflow.js";

export interface SearchCliOptions {
  query: string;
  limit?: number;
  json?: boolean;
}

export interface ShowCliOptions {
  personId: string;
  json?: boolean;
}

export interface ProfileOutput {
  person: Person | null;
  evidence: EvidenceItem[];
}

function buildSearchConditionsFromIntent(intent: QueryIntent, limit: number): SearchConditions {
  const roles = Array.isArray(intent.roles) ? intent.roles : [];
  const skills = Array.isArray(intent.skills) ? intent.skills : [];
  const locations = Array.isArray(intent.locations) ? intent.locations : [];
  const mustHaves = Array.isArray(intent.mustHaves) ? intent.mustHaves : [];
  const niceToHaves = Array.isArray(intent.niceToHaves) ? intent.niceToHaves : [];
  const sourceBias = intent.sourceBias === "bonjour" || intent.sourceBias === "github"
    ? intent.sourceBias
    : undefined;

  return {
    skills: skills.filter((value): value is string => typeof value === "string"),
    locations: locations.filter((value): value is string => typeof value === "string"),
    experience: typeof intent.experienceLevel === "string" ? intent.experienceLevel : undefined,
    role: typeof roles[0] === "string" ? roles[0] : undefined,
    sourceBias,
    mustHave: mustHaves.filter((value): value is string => typeof value === "string"),
    niceToHave: niceToHaves.filter((value): value is string => typeof value === "string"),
    exclude: [],
    preferFresh: false,
    candidateAnchor: undefined,
    limit
  };
}

function getLatestEvidenceAt(evidence: EvidenceItem[]): Date | undefined {
  return evidence
    .map((item) => item.occurredAt)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

function formatSourceSummary(sources: string[]): string {
  if (sources.length === 0 || sources[0] === "Unknown") {
    return "来源未知";
  }

  return sources.join(" / ");
}

function buildRawQueryFallbackReason(
  query: string,
  person: Pick<Person, "primaryHeadline" | "primaryLocation">,
  document: Pick<SearchDocument, "docText" | "facetLocation"> | undefined,
  evidence: Pick<EvidenceItem, "title" | "description">[]
): string | undefined {
  const terms = query
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return undefined;
  }

  const locationText = [
    person.primaryLocation || "",
    ...(document?.facetLocation || [])
  ]
    .join(" ")
    .toLowerCase();
  const contextText = [
    person.primaryHeadline || "",
    person.primaryLocation || "",
    document?.docText || "",
    ...(document?.facetLocation || []),
    ...evidence.map((item) => `${item.title || ""} ${item.description || ""}`)
  ]
    .join(" ")
    .toLowerCase();

  const matchedTerms = terms.filter((term) => contextText.includes(term.toLowerCase()));
  if (matchedTerms.length === 0) {
    return undefined;
  }

  const matchedLocation = matchedTerms.find((term) => locationText.includes(term.toLowerCase()));
  if (matchedLocation) {
    return `地点命中：${matchedLocation}`;
  }

  return `命中查询词：${matchedTerms.slice(0, 2).join(" / ")}`;
}

export async function runSearchCli(options: SearchCliOptions): Promise<ScriptSearchResponseOutput | string> {
  const { db, close } = createDatabaseConnection();

  try {
    const provider = SiliconFlowProvider.fromEnv();
    const planner = new QueryPlanner({ provider });
    const retriever = new HybridRetriever({ db, provider, limit: 50 });
    const reranker = new Reranker();

    const intent = await planner.parse(options.query);
    const queryEmbedding = await provider.embed(intent.rawQuery);
    const retrieved = await retriever.retrieve(intent, { embedding: queryEmbedding.embedding });

    if (retrieved.length === 0) {
      return options.json ? { results: [], total: 0 } : "No results found.";
    }

    const personIds = retrieved.map(r => r.personId);
    const [documents, evidence, people, identities] = await Promise.all([
      db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds)),
      db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      db.select().from(persons).where(and(eq(persons.searchStatus, "active"), inArray(persons.id, personIds))),
      db.select().from(personIdentities).where(inArray(personIdentities.personId, personIds))
    ]);
    const sourceProfileIds = identities.map((identity) => identity.sourceProfileId).filter(Boolean);
    const profiles = sourceProfileIds.length > 0
      ? await db.select().from(sourceProfiles).where(inArray(sourceProfiles.id, sourceProfileIds))
      : [];

    const documentMap = new Map(documents.map(d => [d.personId, d]));
    const evidenceMap = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const arr = evidenceMap.get(item.personId) ?? [];
      arr.push(item);
      evidenceMap.set(item.personId, arr);
    }
    const personMap = new Map(people.map(p => [p.id, p]));
    const identityMap = new Map<string, typeof identities>();
    for (const identity of identities) {
      const arr = identityMap.get(identity.personId) ?? [];
      arr.push(identity);
      identityMap.set(identity.personId, arr);
    }
    const sourceProfileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    const reranked = reranker.rerank(retrieved, intent, documentMap, evidenceMap);
    const limited = reranked.slice(0, options.limit ?? 10);
    const conditions = buildSearchConditionsFromIntent(intent, options.limit ?? 10);

    const output = limited.map((result) => {
      const person = personMap.get(result.personId);
      const fallbackPerson = {
        primaryName: "Unknown",
        primaryHeadline: null,
        primaryLocation: null,
        summary: null,
        updatedAt: undefined
      } as unknown as Person;
      const personRow = person ?? fallbackPerson;
      const document = documentMap.get(result.personId);
      const candidateEvidence = evidenceMap.get(result.personId) ?? [];
      const latestEvidenceAt = getLatestEvidenceAt(candidateEvidence);
      const personIdentityRows = identityMap.get(result.personId) ?? [];
      const identitySources = [...new Set(
        personIdentityRows
          .map((identity) => formatSourceLabel(sourceProfileMap.get(identity.sourceProfileId)?.source))
          .filter((value): value is string => Boolean(value))
      )];
      const bonjourProfile = personIdentityRows
        .map((identity) => sourceProfileMap.get(identity.sourceProfileId))
        .find((profile) => profile?.source === "bonjour");
      const bonjourUrl = bonjourProfile?.canonicalUrl ?? undefined;
      const sources = document?.facetSource && document.facetSource.length > 0
        ? [...new Set(document.facetSource.map((source) => formatSourceLabel(source) || source))]
        : identitySources.length > 0
          ? identitySources
          : bonjourUrl
            ? ["Bonjour"]
            : ["Unknown"];
      const freshnessDate = latestEvidenceAt ?? personRow.updatedAt ?? undefined;
      const explanation = buildQueryMatchExplanation(
        personRow,
        document,
        candidateEvidence,
        conditions,
        {
          score: result.finalScore,
          retrievalReasons: result.matchReasons,
          sources,
          referenceDate: freshnessDate
        }
      );
      const fallbackMatchReason = buildRawQueryFallbackReason(
        options.query,
        personRow,
        document,
        candidateEvidence
      );
      const matchReason = FALLBACK_MATCH_REASONS.some((reason) =>
        explanation.summary.startsWith(reason)
      )
        ? (fallbackMatchReason || explanation.summary)
        : explanation.summary;

      return {
        personId: result.personId,
        name: personRow.primaryName ?? "Unknown",
        headline: personRow.primaryHeadline ?? null,
        location: personRow.primaryLocation ?? null,
        matchScore: result.finalScore,
        matchStrength: classifyMatchStrength(result.finalScore, explanation.reasons),
        matchReasons: result.matchReasons,
        matchReason,
        whyMatched: matchReason,
        source: formatSourceSummary(sources),
        sources,
        freshness: freshnessDate ? describeRelativeDate(freshnessDate) : "时间未知",
        bonjourUrl,
        lastSyncedAt: personRow.updatedAt ? personRow.updatedAt.toISOString() : undefined,
        latestEvidenceAt: latestEvidenceAt ? latestEvidenceAt.toISOString() : undefined
      } satisfies ScriptSearchResultOutput;
    });

    if (options.json) {
      return {
        results: output,
        total: output.length,
        resultWarning: buildResultWarning(output)
      };
    }

    // Human-readable format
    return output.map(r => `${r.personId}: ${r.name} (${r.matchScore.toFixed(2)})`).join("\n");
  } finally {
    await close();
  }
}

export async function runShowCli(options: ShowCliOptions): Promise<ProfileOutput | string> {
  const { db, close } = createDatabaseConnection();

  try {
    const person = await db.select().from(persons).where(
      and(eq(persons.id, options.personId), eq(persons.searchStatus, "active"))
    );

    if (!person.length) {
      return options.json ? { person: null, evidence: [] } : `Person ${options.personId} not found.`;
    }

    const evidence = await db.select().from(evidenceItems).where(eq(evidenceItems.personId, options.personId));

    const output = { person: person[0], evidence };

    if (options.json) {
      return output;
    }

    // Human-readable format
    const p = person[0];
    const lines = [
      `Name: ${p.primaryName}`,
      `Headline: ${p.primaryHeadline ?? "N/A"}`,
      `Location: ${p.primaryLocation ?? "N/A"}`,
      `Evidence (${evidence.length} items):`,
      ...evidence.slice(0, 5).map(e => `  - ${e.evidenceType}: ${e.title ?? "Untitled"}`)
    ];
    return lines.join("\n");
  } finally {
    await close();
  }
}
