import type { SearchConditions, SearchCandidateAnchor } from "./search-conditions-types.js";
import type { QueryIntent } from "./planner.js";
import type { GraphRerankFeatures } from "./reranker.js";
import type { CrossEncoderScore, CrossEncoder } from "./cross-encoder.js";
import { HybridRetriever } from "./retriever.js";
import { Reranker } from "./reranker.js";
import { extractCandidateSummary } from "./cross-encoder.js";
import { buildDisambiguationNotes } from "./disambiguation.js";

export interface SearchCoreResult<TDoc = unknown, TEvidence = unknown, TPerson = unknown> {
  personIds: string[];
  reranked: Array<{ personId: string; finalScore: number; matchReasons: string[] }>;
  intent: QueryIntent;
  graphFeaturesMap: Map<string, GraphRerankFeatures>;
  crossEncoderScores?: Map<string, CrossEncoderScore>;
  diagnostics: SearchCoreDiagnostics;
  isFallback: boolean;
  loaded: {
    documents: Map<string, TDoc>;
    evidence: Map<string, TEvidence[]>;
    persons: Map<string, TPerson>;
  };
}

export interface SearchCoreDiagnostics {
  filterDropoff?: {
    status: "available" | "unavailable";
    dominantFilter?: string;
    dropoffByFilter?: Record<string, number>;
  };
  sourceCounterfactual?: {
    status: "available" | "unavailable";
    restrictedSource?: string;
    unrestrictedRetrievedCount?: number;
  };
}

export type SearchFilterName = "must_have" | "exclude" | "source_bias";

export interface SearchCoreDependencies<TDoc = unknown, TEvidence = unknown, TPerson = unknown> {
  planner: {
    parse(query: string, options?: { signal?: AbortSignal }): Promise<QueryIntent>;
  };
  embedder: {
    embed(text: string, options?: { signal?: AbortSignal }): Promise<{ embedding: number[] }>;
  };
  retriever: HybridRetriever;
  reranker: Reranker;
  crossEncoder?: CrossEncoder;
  crossEncoderLimit?: number;
  fetchGraphFeatures: (
    candidatePersonIds: string[],
    anchorPersonId: string | undefined,
    signal?: AbortSignal
  ) => Promise<Map<string, GraphRerankFeatures>>;
  loadDocuments: (personIds: string[]) => Promise<Map<string, TDoc>>;
  loadEvidence: (personIds: string[]) => Promise<Map<string, TEvidence[]>>;
  loadPersons: (personIds: string[]) => Promise<Map<string, TPerson>>;
  getContextText: (person: TPerson, document: TDoc | undefined, evidence: TEvidence[]) => string;
  getDocFacetSource: (document: TDoc | undefined) => string[];
}

function mergeIntentWithConditions(intent: QueryIntent, conditions: SearchConditions): QueryIntent {
  const unique = (values: string[]) => [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];

  return {
    ...intent,
    roles: unique([...intent.roles, ...(conditions.role ? [conditions.role] : [])]),
    skills: unique([...intent.skills, ...conditions.skills]),
    locations: unique([...intent.locations, ...conditions.locations]),
    experienceLevel: intent.experienceLevel ?? conditions.experience?.toLowerCase(),
    sourceBias: conditions.sourceBias ?? intent.sourceBias,
    mustHaves: unique([
      ...intent.mustHaves,
      ...(conditions.role ? [conditions.role] : []),
      ...conditions.skills,
      ...conditions.mustHave
    ]),
    niceToHaves: unique([...intent.niceToHaves, ...conditions.niceToHave])
  };
}

function evaluateFilters(
  document: { facetSource?: string[] } | undefined,
  contextText: string,
  conditions: SearchConditions
): { matches: boolean; failedFilters: SearchFilterName[] } {
  const failedFilters: SearchFilterName[] = [];
  const normalized = contextText.toLowerCase();

  if (conditions.mustHave.length > 0) {
    const hasMissing = conditions.mustHave.some((term) => !normalized.includes(term.toLowerCase()));
    if (hasMissing) failedFilters.push("must_have");
  }

  if (conditions.exclude.length > 0) {
    const hasExcluded = conditions.exclude.some((term) => normalized.includes(term.toLowerCase()));
    if (hasExcluded) failedFilters.push("exclude");
  }

  if (conditions.sourceBias && document) {
    const expected = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
    if (!(document.facetSource ?? []).includes(expected)) {
      failedFilters.push("source_bias");
    }
  }

  return { matches: failedFilters.length === 0, failedFilters };
}

export class SearchCore<TDoc = unknown, TEvidence = unknown, TPerson = unknown> {
  constructor(private deps: SearchCoreDependencies<TDoc, TEvidence, TPerson>) {}

  async execute(
    query: string,
    conditions: SearchConditions,
    options: { signal?: AbortSignal } = {}
  ): Promise<SearchCoreResult<TDoc, TEvidence, TPerson>> {
    const intent = mergeIntentWithConditions(
      await this.deps.planner.parse(query, { signal: options.signal }),
      conditions
    );

    const queryEmbedding = await this.deps.embedder.embed(intent.rawQuery, { signal: options.signal });

    let retrieved = await this.deps.retriever.retrieve(intent, { embedding: queryEmbedding.embedding });

    if (retrieved.length === 0) {
      return {
        personIds: [],
        reranked: [],
        intent,
        graphFeaturesMap: new Map(),
        diagnostics: {
          filterDropoff: { status: "unavailable" },
          sourceCounterfactual: conditions.sourceBias
            ? { status: "available", restrictedSource: conditions.sourceBias, unrestrictedRetrievedCount: 0 }
            : { status: "unavailable" }
        },
        isFallback: true,
        loaded: { documents: new Map(), evidence: new Map(), persons: new Map() }
      };
    }

    const personIds = retrieved.map((r) => r.personId);
    const [documentMap, evidenceMap, personMap] = await Promise.all([
      this.deps.loadDocuments(personIds),
      this.deps.loadEvidence(personIds),
      this.deps.loadPersons(personIds)
    ]);

    const dropoffCounts: Partial<Record<SearchFilterName, number>> = {};
    const filtered = retrieved.filter((r) => {
      const person = personMap.get(r.personId);
      if (!person) return false;

      const doc = documentMap.get(r.personId);
      const ev = evidenceMap.get(r.personId) ?? [];
      const contextText = this.deps.getContextText(person, doc, ev);
      const facetSource = this.deps.getDocFacetSource(doc);

      const result = evaluateFilters({ facetSource }, contextText, conditions);
      for (const f of result.failedFilters) {
        dropoffCounts[f] = (dropoffCounts[f] ?? 0) + 1;
      }
      return result.matches;
    });

    const graphFeaturesMap = await this.deps.fetchGraphFeatures(
      filtered.map((r) => r.personId),
      conditions.candidateAnchor?.personId,
      options.signal
    );

    const crossEncoderScores = await this.scoreWithCrossEncoder(
      filtered, intent, documentMap, evidenceMap, personMap, conditions.limit, options.signal
    );

    const reranked = this.deps.reranker.rerank(
      filtered, intent, documentMap as any, evidenceMap as any, crossEncoderScores, graphFeaturesMap
    );

    const diagnostics: SearchCoreDiagnostics = {
      filterDropoff: {
        status: "available",
        dominantFilter: Object.entries(dropoffCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "unknown",
        dropoffByFilter: dropoffCounts as Record<string, number>
      },
      sourceCounterfactual: conditions.sourceBias
        ? { status: "available", restrictedSource: conditions.sourceBias, unrestrictedRetrievedCount: retrieved.length }
        : { status: "unavailable" }
    };

    return {
      personIds: reranked.map((r) => r.personId),
      reranked,
      intent,
      graphFeaturesMap,
      crossEncoderScores,
      diagnostics,
      isFallback: false,
      loaded: { documents: documentMap, evidence: evidenceMap, persons: personMap }
    };
  }

  private async scoreWithCrossEncoder(
    retrieved: Array<{ personId: string }>,
    intent: QueryIntent,
    documentMap: Map<string, any>,
    evidenceMap: Map<string, any[]>,
    personMap: Map<string, any>,
    requestLimit: number,
    signal?: AbortSignal
  ): Promise<Map<string, CrossEncoderScore> | undefined> {
    const encoder = this.deps.crossEncoder;
    if (!encoder || retrieved.length === 0) return undefined;

    const configuredLimit = this.deps.crossEncoderLimit ?? 15;
    const limit = Math.max(configuredLimit, requestLimit * 2);
    const top = retrieved.slice(0, limit);
    const summaries = top.map((r) =>
      extractCandidateSummary(documentMap.get(r.personId), evidenceMap.get(r.personId) ?? [], r.personId, personMap.get(r.personId))
    );

    try {
      const scores = await encoder.scoreBatch(intent, summaries, { signal });
      return new Map(scores.map((s) => [s.personId, s]));
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      return undefined;
    }
  }
}
