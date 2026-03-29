import type { LLMProvider } from "@seeku/llm";
import { generateEmbedding, generateEmbeddings } from "@seeku/llm";
import type { NewSearchEmbedding, SearchDocument } from "@seeku/db";

const DEFAULT_EMBEDDING_MODEL =
  process.env.SILICONFLOW_EMBEDDING_MODEL ?? "Qwen/Qwen3-Embedding-8B";
const DEFAULT_BATCH_SIZE = 50;

export interface EmbeddingGeneratorConfig {
  provider: LLMProvider;
  batchSize?: number;
  embeddingModel?: string;
}

export class EmbeddingGenerator {
  private readonly provider: LLMProvider;
  private readonly batchSize: number;
  private readonly embeddingModel: string;

  constructor(config: EmbeddingGeneratorConfig) {
    this.provider = config.provider;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  async generateForDocument(doc: SearchDocument): Promise<number[]> {
    return generateEmbedding(this.provider, doc.docText);
  }

  async generateForDocuments(docs: SearchDocument[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    for (let index = 0; index < docs.length; index += this.batchSize) {
      const batch = docs.slice(index, index + this.batchSize);
      const embeddings = await generateEmbeddings(
        this.provider,
        batch.map((doc) => doc.docText)
      );

      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        results.set(batch[batchIndex].personId, embeddings[batchIndex]);
      }
    }

    return results;
  }

  toDatabaseEmbedding(personId: string, embedding: number[]): NewSearchEmbedding {
    return {
      personId,
      embedding: `[${embedding.join(",")}]`,
      embeddingModel: this.embeddingModel,
      embeddingDimension: String(embedding.length),
      embeddedAt: new Date()
    };
  }

  async generateAllForDatabase(docs: SearchDocument[]): Promise<NewSearchEmbedding[]> {
    const embeddings = await this.generateForDocuments(docs);

    return docs
      .map((doc) => {
        const embedding = embeddings.get(doc.personId);
        if (!embedding) {
          return null;
        }

        return this.toDatabaseEmbedding(doc.personId, embedding);
      })
      .filter((item): item is NewSearchEmbedding => item !== null);
  }
}

export async function generateSearchEmbedding(
  provider: LLMProvider,
  doc: SearchDocument,
  config: Omit<Partial<EmbeddingGeneratorConfig>, "provider"> = {}
): Promise<NewSearchEmbedding> {
  const generator = new EmbeddingGenerator({
    provider,
    ...config
  });
  const embedding = await generator.generateForDocument(doc);
  return generator.toDatabaseEmbedding(doc.personId, embedding);
}

export async function generateAllEmbeddings(
  provider: LLMProvider,
  docs: SearchDocument[],
  config: Omit<Partial<EmbeddingGeneratorConfig>, "provider"> = {}
): Promise<NewSearchEmbedding[]> {
  const generator = new EmbeddingGenerator({
    provider,
    ...config
  });
  return generator.generateAllForDatabase(docs);
}
