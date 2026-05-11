import {
  and,
  eq,
  inArray,
  sql,
  type Person,
  type EvidenceItem,
  type SeekuDatabase,
  persons,
  searchDocuments,
  evidenceItems,
  sourceProfiles,
  personIdentities,
  type SearchDocument,
  type SourceProfile,
  type PersonIdentity
} from "@seeku/db";
import { HybridRetriever, Reranker, SearchCore, type SearchCoreDependencies, buildDisambiguationNotes, extractCandidateSummary, type CrossEncoder, type CrossEncoderScore, type QueryIntent, type GraphRerankFeatures } from "@seeku/search";
import { classifyMatchStrength } from "@seeku/shared";
import { getMutualConnectionsBatch, getGraphNodeFeaturesBatch, areDirectNeighbors } from "@seeku/db";
import type { ScoredCandidate, SearchConditions, ConditionAuditItem, CandidatePrimaryLink } from "./types.js";
import { contextHasTermValue, buildSearchStateContextValue } from "./search-context-helpers.js";
import { buildEffectiveQuery } from "./search-conditions.js";

export type SearchFilterName = "must_have" | "exclude" | "source_bias";

export interface SearchExecutionDiagnostics {
  filterDropoff?: {
    status: "available" | "unavailable";
    dominantFilter?: "role" | "skill" | "must_have" | "location" | "source_bias" | "exclude" | "unknown";
    dropoffByFilter?: Partial<Record<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude", number>>;
  };
  sourceCounterfactual?: {
    status: "available" | "unavailable";
    restrictedSource?: "bonjour" | "github";
    unrestrictedRetrievedCount?: number;
  };
  corpusCoverage?: {
    status: "available" | "unavailable";
    suspectedGap: boolean;
    supportingSignals: string[];
  };
}

export interface SearchExecutionResult {
  candidates: HydratedCandidate[];
  diagnostics?: SearchExecutionDiagnostics;
}

export interface HydratedCandidate extends ScoredCandidate {
  _hydrated: {
    person: Person;
    document?: SearchDocument;
    evidence: EvidenceItem[];
  };
}

export interface SearchExecutorDependencies {
  db: SeekuDatabase;
  llmProvider: {
    embed(text: string, options?: { model?: string; signal?: AbortSignal }): Promise<{ embedding: number[] }>;
  };
  planner: {
    parse(query: string, options?: { signal?: AbortSignal }): Promise<QueryIntent>;
  };
  retriever: HybridRetriever;
  reranker: Reranker;
  /**
   * Optional cross-encoder. When present, top-N retrieved candidates are
   * scored by the LLM and the result feeds into reranker.rerank() as the
   * crossEncoderScores arg. Disabling matches the legacy heuristic-only
   * behavior — useful for cost-sensitive runs (set deps to undefined).
   */
  crossEncoder?: CrossEncoder;
  /** How many top retrieved candidates to send through cross-encoder. */
  crossEncoderLimit?: number;
  scorer: { calculateExperienceMatch(person: Person, evidence: EvidenceItem[], conditions: SearchConditions): number };
  buildQueryMatchExplanation: (
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    conditions: SearchConditions,
    options: {
      score?: number;
      retrievalReasons?: string[];
      sources?: string[];
      referenceDate?: Date;
    }
  ) => { summary: string; reasons: string[] };
  buildConditionAudit: (
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    conditions: SearchConditions,
    options: {
      sources: string[];
      referenceDate?: Date;
      experienceMatched: boolean;
    }
  ) => ConditionAuditItem[];
  buildCandidateSourceMetadata: (
    identities: Array<Pick<PersonIdentity, "sourceProfileId">>,
    sourceProfileMap: Map<string, Pick<SourceProfile, "source" | "canonicalUrl">>,
    evidence: Array<Pick<EvidenceItem, "evidenceType" | "title" | "description" | "url" | "occurredAt">>,
    documentSources: string[]
  ) => { sources: string[]; bonjourUrl?: string; primaryLinks: CandidatePrimaryLink[] };
}

export class SearchExecutor {
  private searchCore: SearchCore<SearchDocument, EvidenceItem, Person>;

  constructor(private deps: SearchExecutorDependencies) {
    const config = this.deps.reranker.getConfig?.();
    if (config) {
      console.log("[GraphRerank:Config]", JSON.stringify({
        enabled: config.graphRerankEnabled,
        mutualConnectionBoost: config.graphMutualConnectionBoost,
        directNeighborBoost: config.graphDirectNeighborBoost,
        sameComponentBoost: config.graphSameComponentBoost
      }));
    }

    this.searchCore = new SearchCore<SearchDocument, EvidenceItem, Person>({
      planner: deps.planner,
      embedder: deps.llmProvider,
      retriever: deps.retriever,
      reranker: deps.reranker,
      crossEncoder: deps.crossEncoder,
      crossEncoderLimit: deps.crossEncoderLimit,
      fetchGraphFeatures: (candidatePersonIds, anchorPersonId, signal) =>
        this.fetchGraphFeatures(candidatePersonIds, anchorPersonId, signal),
      loadDocuments: async (personIds) => {
        const rows = await deps.db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds));
        return new Map(rows.map((r) => [r.personId, r as SearchDocument]));
      },
      loadEvidence: async (personIds) => {
        const rows = await deps.db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds));
        const map = new Map<string, EvidenceItem[]>();
        for (const item of rows) {
          const entries = map.get(item.personId) ?? [];
          entries.push(item as EvidenceItem);
          map.set(item.personId, entries);
        }
        return map;
      },
      loadPersons: async (personIds) => {
        const rows = await deps.db.select().from(persons).where(and(eq(persons.searchStatus, "active"), inArray(persons.id, personIds)));
        return new Map(rows.map((r) => [r.id, r as Person]));
      },
      getContextText: (person, document, evidence) =>
        buildSearchStateContextValue(person, document, evidence.slice(0, 8)),
      getDocFacetSource: (document) => document?.facetSource ?? []
    });
  }

  async performSearch(
    query: string,
    conditions: SearchConditions,
    options: {
      signal?: AbortSignal;
    } = {}
  ): Promise<SearchExecutionResult> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("Search execution aborted.");
    }

    const coreResult = await this.searchCore.execute(query, conditions, options);

    if (coreResult.isFallback) {
      return this.performFallbackSearch(conditions, {
        filterDropoff: coreResult.diagnostics.filterDropoff as SearchExecutionDiagnostics["filterDropoff"],
        sourceCounterfactual: coreResult.diagnostics.sourceCounterfactual as SearchExecutionDiagnostics["sourceCounterfactual"]
      });
    }

    const { reranked, graphFeaturesMap, loaded, diagnostics: coreDiagnostics } = coreResult;
    const { documents: documentMap, evidence: evidenceMap, persons: personMap } = loaded;

    const graphRerankDiagnostics = {
      hasAnchor: Boolean(conditions.candidateAnchor?.personId),
      candidateCount: reranked.length,
      graphFeatureCount: graphFeaturesMap.size,
      graphFeatureRate: reranked.length > 0 ? graphFeaturesMap.size / reranked.length : 0
    };
    console.log("[GraphRerank:Fetch]", JSON.stringify(graphRerankDiagnostics));

    const graphBoostCount = reranked.filter(r =>
      r.matchReasons.some(reason => reason.startsWith("graph:"))
    ).length;
    if (graphBoostCount > 0) {
      console.log("[GraphRerank:Applied]", JSON.stringify({
        boostedCount: graphBoostCount,
        top5GraphReasons: reranked.slice(0, 5).map(r => ({
          id: r.personId.slice(0, 8),
          score: r.finalScore.toFixed(3),
          graphReasons: r.matchReasons.filter(reason => reason.startsWith("graph:"))
        }))
      }));
    }

    const personIds = reranked.map((r) => r.personId);
    const identities = personIds.length > 0
      ? await this.deps.db.select().from(personIdentities).where(inArray(personIdentities.personId, personIds))
      : [];
    const sourceProfileIds = identities.map((i) => i.sourceProfileId);
    const sourceProfileRows = sourceProfileIds.length > 0
      ? await this.deps.db.select().from(sourceProfiles).where(inArray(sourceProfiles.id, sourceProfileIds))
      : [];
    const sourceProfileMap = new Map<string, SourceProfile>(
      sourceProfileRows.map((p) => [p.id, p as SourceProfile])
    );
    const identityMap = new Map<string, PersonIdentity[]>();
    for (const identity of identities) {
      const entries = identityMap.get(identity.personId) ?? [];
      entries.push(identity as PersonIdentity);
      identityMap.set(identity.personId, entries);
    }

    const limit = conditions.limit;
    const hydrationWindow = conditions.preferFresh ? Math.min(reranked.length, limit * 2) : limit;
    const hydrated: HydratedCandidate[] = reranked.slice(0, hydrationWindow).map((result) => {
      const person = personMap.get(result.personId);
      if (!person) {
        throw new Error(`Candidate ${result.personId} not found in database.`);
      }

      const document = documentMap.get(result.personId);
      const candidateEvidence = evidenceMap.get(result.personId) || [];
      const candidateIdentities = identityMap.get(result.personId) || [];

      const { sources, bonjourUrl, primaryLinks } = this.deps.buildCandidateSourceMetadata(
        candidateIdentities,
        sourceProfileMap,
        candidateEvidence,
        document?.facetSource ?? []
      );

      const latestEvidenceAt = candidateEvidence.length > 0
        ? candidateEvidence
            .map((item) => item.occurredAt)
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : undefined;
      const referenceDate = latestEvidenceAt ?? person.updatedAt;
      const experienceMatched = conditions.experience
        ? this.deps.scorer.calculateExperienceMatch(person, candidateEvidence, conditions) >= 10
        : false;
      const queryMatch = this.deps.buildQueryMatchExplanation(
        person, document, candidateEvidence, conditions,
        { score: result.finalScore, retrievalReasons: result.matchReasons, sources, referenceDate }
      );
      const conditionAudit = this.deps.buildConditionAudit(person, document, candidateEvidence, conditions, {
        sources, referenceDate, experienceMatched
      });

      return {
        personId: result.personId,
        name: person.primaryName,
        headline: person.primaryHeadline,
        location: person.primaryLocation,
        company: null,
        experienceYears: null,
        matchScore: result.finalScore,
        matchStrength: classifyMatchStrength(result.finalScore, queryMatch.reasons),
        matchReason: queryMatch.summary,
        queryReasons: queryMatch.reasons,
        conditionAudit,
        sources,
        bonjourUrl,
        primaryLinks,
        lastSyncedAt: person.updatedAt,
        latestEvidenceAt,
        _hydrated: { person, document, evidence: candidateEvidence }
      };
    });

    const disambiguationNotes = buildDisambiguationNotes(
      buildEffectiveQuery(conditions),
      hydrated.map((c) => ({
        personId: c.personId, name: c.name, headline: c.headline,
        matchReasons: c.queryReasons, document: c._hydrated.document
      }))
    );
    hydrated.forEach((candidate) => {
      const disambiguation = disambiguationNotes.get(candidate.personId);
      if (!disambiguation) return;
      candidate.disambiguation = disambiguation;
      candidate.matchReason = `${candidate.matchReason} ${disambiguation}`;
    });

    const diagnostics: SearchExecutionDiagnostics = {
      filterDropoff: coreDiagnostics.filterDropoff as SearchExecutionDiagnostics["filterDropoff"],
      sourceCounterfactual: coreDiagnostics.sourceCounterfactual as SearchExecutionDiagnostics["sourceCounterfactual"]
    };

    const ordered = this.applySearchStateOrdering(hydrated, conditions).slice(0, limit);
    if (ordered.length > 0) {
      return { candidates: ordered, diagnostics };
    }

    return this.performFallbackSearch(conditions, diagnostics);
  }

  async performFallbackSearch(
    conditions: SearchConditions,
    inheritedDiagnostics?: SearchExecutionDiagnostics
  ): Promise<SearchExecutionResult> {
    const diagnostics: SearchExecutionDiagnostics = inheritedDiagnostics ?? {
      filterDropoff: { status: "unavailable" },
      sourceCounterfactual: conditions.sourceBias
        ? {
            status: "available",
            restrictedSource: conditions.sourceBias,
            unrestrictedRetrievedCount: 0
          }
        : { status: "unavailable" }
    };

    const filters = [eq(persons.searchStatus, "active")];

    if (conditions.locations.length > 0) {
      const locationClauses = conditions.locations.map(
        (location) =>
          sql`(${persons.primaryLocation} ILIKE ${`%${location}%`} OR ${searchDocuments.facetLocation}::text ILIKE ${`%${location}%`})`
      );
      filters.push(sql`(${sql.join(locationClauses, sql.raw(" OR "))})`);
    }

    if (conditions.sourceBias) {
      filters.push(sql`${searchDocuments.facetSource} && ARRAY[${conditions.sourceBias}]::text[]`);
    }

    if (conditions.mustHave.length > 0) {
      const mustHaveClauses = conditions.mustHave.map((term) => {
        const terms = term.toLowerCase() === "zhejiang university"
          ? ["zhejiang university", "zju", "浙江大学", "浙大"]
          : [term];
        const aliasClauses = terms.map((value) =>
          sql`(${searchDocuments.docText} ILIKE ${`%${value}%`} OR ${searchDocuments.facetTags}::text ILIKE ${`%${value}%`})`
        );
        return sql`(${sql.join(aliasClauses, sql.raw(" OR "))})`;
      });
      filters.push(sql`(${sql.join(mustHaveClauses, sql.raw(" AND "))})`);
    }

    const rows = await this.deps.db
      .select({
        person: persons,
        document: searchDocuments
      })
      .from(persons)
      .innerJoin(searchDocuments, eq(searchDocuments.personId, persons.id))
      .where(and(...filters))
      .limit(Math.max(conditions.limit * 5, 30));

    if (rows.length === 0) {
      return { candidates: [], diagnostics };
    }

    const personIds = rows.map((row) => row.person.id);
    const [evidence, identities] = await Promise.all([
      this.deps.db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      this.deps.db.select().from(personIdentities).where(inArray(personIdentities.personId, personIds))
    ]);

    const sourceProfileIds = identities.map((identity) => identity.sourceProfileId);
    const sourceProfileRows = sourceProfileIds.length > 0
      ? await this.deps.db.select().from(sourceProfiles).where(inArray(sourceProfiles.id, sourceProfileIds))
      : [];
    const sourceProfileMap = new Map<string, SourceProfile>(
      sourceProfileRows.map((profile) => [profile.id, profile as SourceProfile])
    );

    const identityMap = new Map<string, PersonIdentity[]>();
    for (const identity of identities) {
      const entries = identityMap.get(identity.personId) ?? [];
      entries.push(identity as PersonIdentity);
      identityMap.set(identity.personId, entries);
    }

    const evidenceMap = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const entries = evidenceMap.get(item.personId) ?? [];
      entries.push(item as EvidenceItem);
      evidenceMap.set(item.personId, entries);
    }

    const fallbackDocumentMap = new Map<string, SearchDocument>(
      rows.map((row) => [row.person.id, row.document as SearchDocument])
    );

    const scored: HydratedCandidate[] = rows
      .map((row) => {
        const person = row.person as Person;
        const document = row.document as SearchDocument;
        const candidateEvidence = evidenceMap.get(person.id) || [];
        const personIdentities = identityMap.get(person.id) || [];
        const heuristicScore = this.computeFallbackScore(person, document, candidateEvidence, conditions);

        const { sources, bonjourUrl, primaryLinks } = this.deps.buildCandidateSourceMetadata(
          personIdentities,
          sourceProfileMap,
          candidateEvidence,
          document.facetSource ?? []
        );

        const latestEvidenceAt = candidateEvidence.length > 0
          ? candidateEvidence
              .map((item) => item.occurredAt)
              .filter((date): date is Date => Boolean(date))
              .sort((a, b) => b.getTime() - a.getTime())[0]
          : undefined;
        const referenceDate = latestEvidenceAt ?? person.updatedAt;
        const experienceMatched = conditions.experience
          ? this.deps.scorer.calculateExperienceMatch(person, candidateEvidence, conditions) >= 10
          : false;
        const queryMatch = this.deps.buildQueryMatchExplanation(
          person,
          document,
          candidateEvidence,
          conditions,
          {
            score: heuristicScore,
            sources,
            referenceDate
          }
        );
        const conditionAudit = this.deps.buildConditionAudit(person, document, candidateEvidence, conditions, {
          sources,
          referenceDate,
          experienceMatched
        });

        return {
          personId: person.id,
          name: person.primaryName,
          headline: person.primaryHeadline,
          location: person.primaryLocation,
          company: null,
          experienceYears: null,
          matchScore: heuristicScore,
          matchStrength: classifyMatchStrength(heuristicScore, queryMatch.reasons),
          matchReason: queryMatch.summary,
          queryReasons: queryMatch.reasons,
          conditionAudit,
          sources,
          bonjourUrl,
          primaryLinks,
          lastSyncedAt: person.updatedAt,
          latestEvidenceAt,
          _hydrated: {
            person,
            document,
            evidence: candidateEvidence
          }
        } satisfies HydratedCandidate;
      })
      .filter((candidate) =>
        this.matchesSearchState(
          candidate._hydrated.person,
          fallbackDocumentMap.get(candidate.personId),
          candidate._hydrated.evidence,
          conditions
        )
      )
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, conditions.limit);

    const disambiguationNotes = buildDisambiguationNotes(
      buildEffectiveQuery(conditions),
      scored.map((candidate) => ({
        personId: candidate.personId,
        name: candidate.name,
        headline: candidate.headline,
        matchReasons: candidate.queryReasons,
        document: candidate._hydrated.document
      }))
    );

    scored.forEach((candidate) => {
      const disambiguation = disambiguationNotes.get(candidate.personId);
      if (!disambiguation) {
        return;
      }

      candidate.disambiguation = disambiguation;
      candidate.matchReason = `${candidate.matchReason} ${disambiguation}`;
    });

    return {
      candidates: this.applySearchStateOrdering(scored, conditions),
      diagnostics
    };
  }

  refreshCandidateQueryExplanation(candidate: HydratedCandidate, conditions: SearchConditions): void {
    const referenceDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
    const experienceMatched = conditions.experience
      ? this.deps.scorer.calculateExperienceMatch(candidate._hydrated.person, candidate._hydrated.evidence, conditions) >= 10
      : false;
    const explanation = this.deps.buildQueryMatchExplanation(
      candidate._hydrated.person,
      candidate._hydrated.document,
      candidate._hydrated.evidence,
      conditions,
      {
        score: candidate.matchScore,
        sources: candidate.sources,
        referenceDate
      }
    );

    candidate.matchReason = explanation.summary;
    candidate.queryReasons = explanation.reasons;
    candidate.matchStrength = classifyMatchStrength(candidate.matchScore, explanation.reasons);
    candidate.conditionAudit = this.deps.buildConditionAudit(
      candidate._hydrated.person,
      candidate._hydrated.document,
      candidate._hydrated.evidence,
      conditions,
      {
        sources: candidate.sources,
        referenceDate,
        experienceMatched
      }
    );
  }

  applySearchStateOrdering(candidates: HydratedCandidate[], conditions: SearchConditions): HydratedCandidate[] {
    if (!conditions.preferFresh && !conditions.sourceBias) {
      return candidates;
    }

    return [...candidates].sort((left, right) => {
      const delta =
        this.computeSearchStateOrderingScore(right, conditions) -
        this.computeSearchStateOrderingScore(left, conditions);

      if (delta !== 0) {
        return delta;
      }

      return right.matchScore - left.matchScore;
    });
  }

  private computeFallbackScore(
    person: Person,
    document: SearchDocument,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): number {
    const context = buildSearchStateContextValue(person, document, evidence.slice(0, 8));

    let score = 35;

    if (conditions.locations.length > 0) {
      const locationMatched = conditions.locations.some((location) =>
        (person.primaryLocation || "").toLowerCase().includes(location.toLowerCase()) ||
        document.facetLocation.some((value) => value.toLowerCase().includes(location.toLowerCase()))
      );
      score += locationMatched ? 30 : 0;
    }

    if (conditions.sourceBias) {
      const sourceMatched = document.facetSource.some((value) => value.toLowerCase() === conditions.sourceBias);
      score += sourceMatched ? 10 : 0;
    }

    if (conditions.role && contextHasTermValue(conditions.role, context)) {
      score += 15;
    }

    if (conditions.skills.length > 0) {
      const matchedSkills = conditions.skills.filter((skill) => contextHasTermValue(skill, context));
      score += Math.round((matchedSkills.length / conditions.skills.length) * 25);
    }

    if (conditions.niceToHave.length > 0) {
      const matchedNiceToHave = conditions.niceToHave.filter((term) => contextHasTermValue(term, context));
      score += Math.min(10, matchedNiceToHave.length * 4);
    }

    return Math.min(100, score);
  }

  private matchesSearchState(
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): boolean {
    return this.evaluateSearchStateFilters(person, document, evidence, conditions).matches;
  }

  private evaluateSearchStateFilters(
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): {
    matches: boolean;
    failedFilters: SearchFilterName[];
  } {
    const context = buildSearchStateContextValue(person, document, evidence);
    const failedFilters: SearchFilterName[] = [];

    if (conditions.mustHave.length > 0) {
      const hasMissingMustHave = conditions.mustHave.some(
        (term) => !contextHasTermValue(term, context)
      );
      if (hasMissingMustHave) {
        failedFilters.push("must_have");
      }
    }

    if (conditions.exclude.length > 0) {
      const hasExcludedTerm = conditions.exclude.some(
        (term) => contextHasTermValue(term, context)
      );
      if (hasExcludedTerm) {
        failedFilters.push("exclude");
      }
    }

    if (conditions.sourceBias) {
      const expectedSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
      if (document && !document.facetSource.includes(expectedSource)) {
        failedFilters.push("source_bias");
      }
    }

    return {
      matches: failedFilters.length === 0,
      failedFilters
    };
  }

  private buildFilterDropoffDiagnostics(
    dropoffCounts: Partial<Record<SearchFilterName, number>>
  ): SearchExecutionDiagnostics["filterDropoff"] {
    const entries = Object.entries(dropoffCounts).filter((entry) => (entry[1] ?? 0) > 0) as Array<
      [SearchFilterName, number]
    >;
    if (entries.length === 0) {
      return {
        status: "available",
        dominantFilter: "unknown",
        dropoffByFilter: {}
      };
    }

    entries.sort((left, right) => right[1] - left[1]);
    return {
      status: "available",
      dominantFilter: entries[0][0],
      dropoffByFilter: Object.fromEntries(entries)
    };
  }

  private computeSearchStateOrderingScore(
    candidate: HydratedCandidate,
    conditions: SearchConditions
  ): number {
    let score = candidate.matchScore * 100;

    if (conditions.sourceBias) {
      const expectedSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
      if (candidate.sources.includes(expectedSource)) {
        score += 18;
      }
    }

    if (conditions.preferFresh) {
      const referenceDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
      if (referenceDate) {
        const ageInDays = Math.floor(
          (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (ageInDays <= 7) {
          score += 20;
        } else if (ageInDays <= 30) {
          score += 12;
        } else if (ageInDays <= 90) {
          score += 5;
        }
      }
    }

    return score;
  }

  /**
   * Fetch graph features for reranking.
   * Only computes pairwise features when an anchor person is available.
   * Returns an empty map if no anchor context exists (graceful degradation).
   */
  private async fetchGraphFeatures(
    candidatePersonIds: string[],
    anchorPersonId: string | undefined,
    signal?: AbortSignal
  ): Promise<Map<string, GraphRerankFeatures>> {
    // No anchor = no pairwise features = graceful degradation
    if (!anchorPersonId || candidatePersonIds.length === 0) {
      return new Map();
    }

    if (signal?.aborted) {
      return new Map();
    }

    try {
      // Get node features for anchor and all candidates
      const allPersonIds = [anchorPersonId, ...candidatePersonIds];
      const nodeFeaturesMap = await getGraphNodeFeaturesBatch(this.deps.db, allPersonIds);

      // Check if anchor has graph data
      const anchorFeatures = nodeFeaturesMap.get(anchorPersonId);
      if (!anchorFeatures) {
        // Anchor not in graph - no pairwise features available
        return new Map();
      }

      // Get mutual connections for all candidates against anchor
      const mutualConnectionsMap = await getMutualConnectionsBatch(
        this.deps.db,
        anchorPersonId,
        candidatePersonIds
      );

      // Build result map
      const result = new Map<string, GraphRerankFeatures>();

      for (const candidateId of candidatePersonIds) {
        const candidateFeatures = nodeFeaturesMap.get(candidateId);
        if (!candidateFeatures) {
          // Candidate not in graph - skip
          continue;
        }

        // Check same component
        const sameComponentAsAnchor = Boolean(
          anchorFeatures.componentId &&
          candidateFeatures.componentId &&
          anchorFeatures.componentId === candidateFeatures.componentId
        );

        // Check direct neighbor (expensive, so we do it per candidate)
        // We'll check this lazily only for top candidates later
        // For now, we assume not a direct neighbor (will be enriched later if needed)
        let isDirectNeighbor = false;

        // For candidates with mutual connections, check if they're direct neighbors
        const mutualCount = mutualConnectionsMap.get(candidateId) ?? 0;
        if (mutualCount > 0 || sameComponentAsAnchor) {
          // Only check direct neighbor for candidates with some graph proximity
          try {
            isDirectNeighbor = await areDirectNeighbors(this.deps.db, anchorPersonId, candidateId);
          } catch {
            // If check fails, assume not a direct neighbor
            isDirectNeighbor = false;
          }
        }

        result.set(candidateId, {
          mutualConnectionCount: mutualCount,
          isDirectNeighbor,
          sameComponentAsAnchor
        });
      }

      return result;
    } catch (error) {
      // Graceful degradation: if graph queries fail, return empty map
      console.error("Graph feature fetch failed, falling back to non-graph ranking:", error);
      return new Map();
    }
  }
}
