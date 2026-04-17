import {
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

export class SearchIndexWorker {
  private readonly db: SeekuDatabase;
  private readonly batchSize: number;
  private readonly embeddingGenerator: EmbeddingGenerator;

  constructor(db: SeekuDatabase, config: SearchIndexWorkerConfig = {}) {
    this.db = db;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    
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
          updatedAt: document.updatedAt ?? new Date()
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

      return this.db
        .select()
        .from(searchDocuments)
        .where(inArray(searchDocuments.personId, personIds));
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
   * Rebuild ALL active candidates in batches
   */
  async rebuildAll(): Promise<SearchIndexRunSummary> {
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

      const summary = await this.rebuildDocuments(activeBatch.map((p) => p.id));
      totalProcessed.documents.personsProcessed += summary.personsProcessed;
      totalProcessed.documents.documentsUpserted += summary.documentsUpserted;
      totalProcessed.documents.personIds.push(...summary.personIds);
      offset += this.batchSize;
    }

    // 2. Sync all embeddings in batches
    while (true) {
      const summary = await this.rebuildEmbeddings();
      if (summary.documentsProcessed === 0) break;

      totalProcessed.embeddings.documentsProcessed += summary.documentsProcessed;
      totalProcessed.embeddings.embeddingsUpserted += summary.embeddingsUpserted;
      totalProcessed.embeddings.personIds.push(...summary.personIds);
    }

    return totalProcessed;
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
    return await worker.rebuildEmbeddings(personIds);
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
