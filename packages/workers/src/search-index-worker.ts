import {
  and,
  createDatabaseConnection,
  eq,
  evidenceItems,
  inArray,
  isNull,
  listActivePersons,
  lt,
  or,
  personIdentities,
  persons,
  searchDocuments,
  searchEmbeddings,
  sql,
  sourceProfiles,
  type EvidenceItem,
  type NewSearchDocument,
  type NewSearchEmbedding,
  type Person,
  type SearchDocument,
  type SeekuDatabase
} from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import {
  EmbeddingGenerator,
  buildAllSearchDocuments,
  type EmbeddingGeneratorConfig
} from "@seeku/search";

interface SearchSourceHint {
  source: string;
  handle?: string;
  canonicalUrl?: string;
}

export interface SearchIndexWorkerConfig {
  batchSize?: number;
  embeddingBatchSize?: number;
  provider?: LLMProvider;
  /** Skip staleness check — re-embed all documents regardless of timestamps */
  force?: boolean;
}

export interface SearchDocumentSyncSummary {
  personsProcessed: number;
  documentsUpserted: number;
  personIds: string[];
}

export interface SearchEmbeddingSyncSummary {
  documentsProcessed: number;
  embeddingsUpserted: number;
  personIds: string[];
}

export interface SearchIndexRunSummary {
  documents: SearchDocumentSyncSummary;
  embeddings: SearchEmbeddingSyncSummary;
}

const DEFAULT_BATCH_SIZE = 100;

function groupEvidence(items: EvidenceItem[]): Map<string, EvidenceItem[]> {
  const grouped = new Map<string, EvidenceItem[]>();

  for (const item of items) {
    const current = grouped.get(item.personId) ?? [];
    current.push(item);
    grouped.set(item.personId, current);
  }

  return grouped;
}

function toTextArraySql(values: string[] | null | undefined) {
  if (!values || values.length === 0) {
    return sql`ARRAY[]::text[]`;
  }

  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;
}

function toJsonbSql(value: unknown) {
  return sql`${JSON.stringify(value ?? {})}::jsonb`;
}

export class SearchIndexWorker {
  private readonly db: SeekuDatabase;
  private readonly batchSize: number;
  private readonly embeddingGenerator: EmbeddingGenerator;
  private readonly force: boolean;

  constructor(db: SeekuDatabase, config: SearchIndexWorkerConfig = {}) {
    this.db = db;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.force = config.force ?? false;

    // Hard-lock to SiliconFlow for indexing and embeddings to ensure 4096-dim vector compatibility.
    // This prevents provider drift if OPENAI_API_KEY is accidentally set.
    const provider = config.provider ?? SiliconFlowProvider.fromStrictEnv();

    this.embeddingGenerator = new EmbeddingGenerator({
      provider,
      batchSize: config.embeddingBatchSize ?? config.batchSize ?? DEFAULT_BATCH_SIZE
    } satisfies EmbeddingGeneratorConfig);
  }

  private async resolvePersons(personIds?: string[]): Promise<Person[]> {
    if (personIds !== undefined) {
      if (personIds.length === 0) {
        return [];
      }

      return this.db.select().from(persons).where(inArray(persons.id, personIds));
    }

    return listActivePersons(this.db);
  }

  private async loadEvidence(personIds: string[]) {
    if (personIds.length === 0) {
      return [];
    }

    return this.db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds));
  }

  private async loadSourceHints(personIds: string[]) {
    if (personIds.length === 0) {
      return new Map<string, SearchSourceHint[]>();
    }

    const rows = await this.db
      .select({
        personId: personIdentities.personId,
        source: sourceProfiles.source,
        handle: sourceProfiles.sourceHandle,
        canonicalUrl: sourceProfiles.canonicalUrl
      })
      .from(personIdentities)
      .innerJoin(sourceProfiles, eq(sourceProfiles.id, personIdentities.sourceProfileId))
      .where(inArray(personIdentities.personId, personIds));

    const hintsByPerson = new Map<string, SearchSourceHint[]>();

    for (const row of rows) {
      const current = hintsByPerson.get(row.personId) ?? [];
      if (!current.some((hint) => hint.source === row.source && hint.handle === row.handle)) {
        current.push({
          source: row.source,
          handle: row.handle,
          canonicalUrl: row.canonicalUrl
        });
      }
      hintsByPerson.set(row.personId, current);
    }

    return hintsByPerson;
  }

  private async upsertDocument(document: NewSearchDocument) {
    const documentUpdatedAt =
      document.updatedAt instanceof Date
        ? document.updatedAt.toISOString()
        : new Date().toISOString();

    await this.db
      .insert(searchDocuments)
      .values(document)
      .onConflictDoUpdate({
        target: searchDocuments.personId,
        set: {
          docText: document.docText,
          facetRole: document.facetRole,
          facetLocation: document.facetLocation,
          facetSource: document.facetSource,
          facetTags: document.facetTags,
          rankFeatures: document.rankFeatures,
          updatedAt: sql`CASE
            WHEN ${searchDocuments.docText} IS DISTINCT FROM ${document.docText}
              OR ${searchDocuments.facetRole} IS DISTINCT FROM ${toTextArraySql(document.facetRole)}
              OR ${searchDocuments.facetLocation} IS DISTINCT FROM ${toTextArraySql(document.facetLocation)}
              OR ${searchDocuments.facetSource} IS DISTINCT FROM ${toTextArraySql(document.facetSource)}
              OR ${searchDocuments.facetTags} IS DISTINCT FROM ${toTextArraySql(document.facetTags)}
              OR ${searchDocuments.rankFeatures} IS DISTINCT FROM ${toJsonbSql(document.rankFeatures)}
            THEN ${documentUpdatedAt}
            ELSE ${searchDocuments.updatedAt}
          END`
        }
      });
  }

  private async upsertEmbedding(embedding: NewSearchEmbedding) {
    await this.db
      .insert(searchEmbeddings)
      .values(embedding)
      .onConflictDoUpdate({
        target: searchEmbeddings.personId,
        set: {
          embedding: embedding.embedding,
          embeddingModel: embedding.embeddingModel,
          embeddingDimension: embedding.embeddingDimension,
          embeddedAt: embedding.embeddedAt ?? new Date()
        }
      });
  }

  async rebuildDocuments(personIds?: string[]): Promise<SearchDocumentSyncSummary> {
    const people = await this.resolvePersons(personIds);
    const ids = people.map((person) => person.id);
    const [evidence, sourceHintsByPerson] = await Promise.all([
      this.loadEvidence(ids),
      this.loadSourceHints(ids)
    ]);
    const documents = await buildAllSearchDocuments(
      people,
      groupEvidence(evidence),
      sourceHintsByPerson
    );

    for (const document of documents) {
      await this.upsertDocument(document);
    }

    return {
      personsProcessed: people.length,
      documentsUpserted: documents.length,
      personIds: ids
    };
  }

  private async resolveDocumentsForEmbedding(personIds?: string[], limit?: number): Promise<SearchDocument[]> {
    if (personIds !== undefined) {
      if (personIds.length === 0) {
        return [];
      }

      if (this.force) {
        return this.db
          .select()
          .from(searchDocuments)
          .where(inArray(searchDocuments.personId, personIds));
      }

      // In non-force mode with explicit IDs, still respect staleness
      const rows = await this.db
        .select({ document: searchDocuments })
        .from(searchDocuments)
        .leftJoin(searchEmbeddings, eq(searchEmbeddings.personId, searchDocuments.personId))
        .where(
          and(
            inArray(searchDocuments.personId, personIds),
            or(
              isNull(searchEmbeddings.personId),
              lt(searchEmbeddings.embeddedAt, searchDocuments.updatedAt)
            )
          )
        );
      return rows.map((row) => row.document);
    }

    if (this.force) {
      return this.db
        .select()
        .from(searchDocuments)
        .limit(limit ?? this.batchSize);
    }

    const rows = await this.db
      .select({
        document: searchDocuments
      })
      .from(searchDocuments)
      .leftJoin(searchEmbeddings, eq(searchEmbeddings.personId, searchDocuments.personId))
      .where(
        or(
          isNull(searchEmbeddings.personId),
          lt(searchEmbeddings.embeddedAt, searchDocuments.updatedAt)
        )
      )
      .limit(limit ?? this.batchSize);

    return rows.map((row) => row.document);
  }

  private async loadEmbeddingTargetIds(personIds?: string[]): Promise<string[]> {
    if (personIds !== undefined) {
      if (personIds.length === 0) {
        return [];
      }

      const rows = await this.db
        .select({ personId: searchDocuments.personId })
        .from(searchDocuments)
        .where(inArray(searchDocuments.personId, personIds))
        .orderBy(searchDocuments.personId);

      return rows.map((row) => row.personId);
    }

    if (this.force) {
      const rows = await this.db
        .select({ personId: searchDocuments.personId })
        .from(searchDocuments)
        .orderBy(searchDocuments.personId);

      return rows.map((row) => row.personId);
    }

    const rows = await this.db
      .select({ personId: searchDocuments.personId })
      .from(searchDocuments)
      .leftJoin(searchEmbeddings, eq(searchEmbeddings.personId, searchDocuments.personId))
      .where(
        or(
          isNull(searchEmbeddings.personId),
          lt(searchEmbeddings.embeddedAt, searchDocuments.updatedAt)
        )
      )
      .orderBy(searchDocuments.personId);

    return rows.map((row) => row.personId);
  }

  async rebuildEmbeddings(personIds?: string[]): Promise<SearchEmbeddingSyncSummary> {
    const documents = await this.resolveDocumentsForEmbedding(personIds);
    const embeddings = await this.embeddingGenerator.generateAllForDatabase(documents);

    for (const embedding of embeddings) {
      await this.upsertEmbedding(embedding);
    }

    return {
      documentsProcessed: documents.length,
      embeddingsUpserted: embeddings.length,
      personIds: documents.map((document) => document.personId)
    };
  }

  async rebuild(personIds?: string[]): Promise<SearchIndexRunSummary> {
    const documents = await this.rebuildDocuments(personIds);
    const embeddings = await this.rebuildEmbeddings(documents.personIds);

    return {
      documents,
      embeddings
    };
  }

  /**
   * Rebuild ALL active candidates in batches, with per-batch error recovery.
   */
  async rebuildAll(): Promise<SearchIndexRunSummary & { errors: string[] }> {
    const errors: string[] = [];
    const totalProcessed: SearchIndexRunSummary = {
      documents: { personsProcessed: 0, documentsUpserted: 0, personIds: [] },
      embeddings: { documentsProcessed: 0, embeddingsUpserted: 0, personIds: [] }
    };

    // 1. Sync all documents in batches
    let offset = 0;
    while (true) {
      const activeBatch = await this.db
        .select()
        .from(persons)
        .where(eq(persons.searchStatus, "active"))
        .limit(this.batchSize)
        .offset(offset);

      if (activeBatch.length === 0) break;

      try {
        const summary = await this.rebuildDocuments(activeBatch.map((p) => p.id));
        totalProcessed.documents.personsProcessed += summary.personsProcessed;
        totalProcessed.documents.documentsUpserted += summary.documentsUpserted;
        totalProcessed.documents.personIds.push(...summary.personIds);
      } catch (error) {
        const batchStart = offset;
        const batchEnd = offset + activeBatch.length;
        const message = `Document batch ${batchStart}-${batchEnd} failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message);
        console.error(`[SearchIndexWorker] ${message}`);
      }

      offset += this.batchSize;
    }

    // 2. Sync all embeddings in batches
    const embeddingSummary = await this.rebuildAllEmbeddings();
    totalProcessed.embeddings.documentsProcessed = embeddingSummary.documentsProcessed;
    totalProcessed.embeddings.embeddingsUpserted = embeddingSummary.embeddingsUpserted;
    totalProcessed.embeddings.personIds = embeddingSummary.personIds;
    errors.push(...embeddingSummary.errors);

    return { ...totalProcessed, errors };
  }

  /**
   * Rebuild embeddings for ALL documents that need it, in batches.
   * Unlike rebuildEmbeddings() which processes one batch, this loops until done.
   */
  async rebuildAllEmbeddings(): Promise<SearchEmbeddingSyncSummary & { errors: string[] }> {
    const errors: string[] = [];
    const totalProcessed: SearchEmbeddingSyncSummary = {
      documentsProcessed: 0,
      embeddingsUpserted: 0,
      personIds: []
    };

    const targetIds = await this.loadEmbeddingTargetIds();
    if (targetIds.length === 0) {
      return { ...totalProcessed, errors };
    }

    for (let index = 0; index < targetIds.length; index += this.batchSize) {
      const batchIds = targetIds.slice(index, index + this.batchSize);

      try {
        const summary = await this.rebuildEmbeddings(batchIds);
        totalProcessed.documentsProcessed += summary.documentsProcessed;
        totalProcessed.embeddingsUpserted += summary.embeddingsUpserted;
        totalProcessed.personIds.push(...summary.personIds);
      } catch (error) {
        const batchStart = index;
        const batchEnd = index + batchIds.length;
        const message = `Embedding batch ${batchStart}-${batchEnd} failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message);
        console.error(`[SearchIndexWorker] ${message}`);
      }
    }

    return { ...totalProcessed, errors };
  }
}

export async function runSearchIndexWorker(
  personIds?: string[],
  db?: SeekuDatabase,
  config: SearchIndexWorkerConfig = {}
) {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const worker = new SearchIndexWorker(database, config);
    return await worker.rebuildDocuments(personIds);
  } finally {
    await ownedConnection?.close();
  }
}

export async function runSearchEmbeddingWorker(
  personIds?: string[],
  db?: SeekuDatabase,
  config: SearchIndexWorkerConfig = {}
) {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const worker = new SearchIndexWorker(database, config);
    if (personIds !== undefined) {
      return await worker.rebuildEmbeddings(personIds);
    }

    return await worker.rebuildAllEmbeddings();
  } finally {
    await ownedConnection?.close();
  }
}

export async function runSearchRebuildWorker(
  personIds?: string[],
  db?: SeekuDatabase,
  config: SearchIndexWorkerConfig = {}
) {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const worker = new SearchIndexWorker(database, config);
    if (personIds !== undefined) {
      return await worker.rebuild(personIds);
    }

    return await worker.rebuildAll();
  } finally {
    await ownedConnection?.close();
  }
}
