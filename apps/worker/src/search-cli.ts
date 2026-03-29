import "dotenv/config";

import { and, eq, inArray } from "drizzle-orm";
import { persons, evidenceItems, searchDocuments, createDatabaseConnection, type Person, type EvidenceItem, type SearchDocument } from "@seeku/db";
import { SiliconFlowProvider } from "@seeku/llm";
import { QueryPlanner, HybridRetriever, Reranker, type QueryIntent, type SearchResult, type RerankResult } from "@seeku/search";

export interface SearchCliOptions {
  query: string;
  limit?: number;
  json?: boolean;
}

export interface ShowCliOptions {
  personId: string;
  json?: boolean;
}

export interface SearchResultOutput {
  personId: string;
  name: string;
  headline: string | null;
  matchScore: number;
  matchReasons: string[];
}

export interface ProfileOutput {
  person: Person;
  evidence: EvidenceItem[];
}

export async function runSearchCli(options: SearchCliOptions): Promise<SearchResultOutput[] | string> {
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
      return options.json ? [] : "No results found.";
    }

    const personIds = retrieved.map(r => r.personId);
    const [documents, evidence, people] = await Promise.all([
      db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds)),
      db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      db.select({
        id: persons.id,
        primaryName: persons.primaryName,
        primaryHeadline: persons.primaryHeadline
      }).from(persons).where(and(eq(persons.searchStatus, "active"), inArray(persons.id, personIds)))
    ]);

    const documentMap = new Map(documents.map(d => [d.personId, d]));
    const evidenceMap = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const arr = evidenceMap.get(item.personId) ?? [];
      arr.push(item);
      evidenceMap.set(item.personId, arr);
    }
    const personMap = new Map(people.map(p => [p.id, p]));

    const reranked = reranker.rerank(retrieved, intent, documentMap, evidenceMap);
    const limited = reranked.slice(0, options.limit ?? 10);

    const output = limited.map(result => ({
      personId: result.personId,
      name: personMap.get(result.personId)?.primaryName ?? "Unknown",
      headline: personMap.get(result.personId)?.primaryHeadline ?? null,
      matchScore: result.finalScore,
      matchReasons: result.matchReasons
    }));

    if (options.json) {
      return output;
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