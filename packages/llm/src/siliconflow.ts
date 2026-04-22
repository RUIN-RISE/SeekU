import OpenAI from "openai";
import type { LLMProvider, LLMProviderConfig, ChatMessage, ChatResponse, EmbeddingResponse, ChatOptions } from "./provider.js";
import { withRetry } from "@seeku/shared";

// SiliconFlow defaults (Stepfun models)
const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_CHAT_MODEL = "stepfun-ai/Step-3.5-Flash";
const DEFAULT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B";
const DEFAULT_EMBEDDING_DIMENSION = 4096;

export class SiliconFlowProvider implements LLMProvider {
  readonly name = "siliconflow";
  private client: OpenAI;
  private defaultChatModel: string;
  private defaultEmbeddingModel: string;
  private embeddingDimension: number;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? SILICONFLOW_BASE_URL
    });
    this.defaultChatModel = config.defaultChatModel ?? DEFAULT_CHAT_MODEL;
    this.defaultEmbeddingModel = config.defaultEmbeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.embeddingDimension = config.embeddingDimension ?? DEFAULT_EMBEDDING_DIMENSION;
  }

  // Convenience constructor using env vars (Strictly SiliconFlow only)
  static fromStrictEnv(): SiliconFlowProvider {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      throw new Error("SILICONFLOW_API_KEY is required for strict SiliconFlowProvider initialization");
    }
    return new SiliconFlowProvider({
      apiKey,
      baseURL: process.env.SILICONFLOW_BASE_URL ?? SILICONFLOW_BASE_URL,
      defaultChatModel: process.env.SILICONFLOW_CHAT_MODEL ?? DEFAULT_CHAT_MODEL,
      defaultEmbeddingModel: process.env.SILICONFLOW_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
      embeddingDimension: process.env.SILICONFLOW_EMBEDDING_DIMENSION
        ? parseInt(process.env.SILICONFLOW_EMBEDDING_DIMENSION, 10)
        : DEFAULT_EMBEDDING_DIMENSION
    });
  }

  // Convenience constructor using env vars (Allows legacy fallback)
  static fromEnv(): SiliconFlowProvider {
    const apiKey = process.env.SILICONFLOW_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("SILICONFLOW_API_KEY or OPENAI_API_KEY is required");
    }
    return new SiliconFlowProvider({
      apiKey,
      baseURL: process.env.SILICONFLOW_BASE_URL ?? SILICONFLOW_BASE_URL,
      defaultChatModel: process.env.SILICONFLOW_CHAT_MODEL ?? DEFAULT_CHAT_MODEL,
      defaultEmbeddingModel: process.env.SILICONFLOW_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
      embeddingDimension: process.env.SILICONFLOW_EMBEDDING_DIMENSION
        ? parseInt(process.env.SILICONFLOW_EMBEDDING_DIMENSION, 10)
        : DEFAULT_EMBEDDING_DIMENSION
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: options?.model ?? this.defaultChatModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        ...(options?.responseFormat === "json" ? { response_format: { type: "json_object" as const } } : {})
      }, {
        signal: options?.signal
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content ?? "",
        model: response.model,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens
        } : undefined
      };
    });
  }

  async embed(text: string, options?: { model?: string; signal?: AbortSignal }): Promise<EmbeddingResponse> {
    return withRetry(async () => {
      const response = await this.client.embeddings.create({
        model: options?.model ?? this.defaultEmbeddingModel,
        input: text
      }, {
        signal: options?.signal
      });

      const data = response.data[0];
      return {
        embedding: data.embedding,
        model: response.model,
        dimension: data.embedding.length,
        usage: { promptTokens: response.usage.prompt_tokens }
      };
    });
  }

  async embedBatch(texts: string[], options?: { model?: string; signal?: AbortSignal }): Promise<EmbeddingResponse[]> {
    const BATCH_SIZE = 50;
    const results: EmbeddingResponse[] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResults = await withRetry(async () => {
        const response = await this.client.embeddings.create({
          model: options?.model ?? this.defaultEmbeddingModel,
          input: batch
        }, {
          signal: options?.signal
        });
        return response.data.map((data) => ({
          embedding: data.embedding,
          model: response.model,
          dimension: data.embedding.length,
          usage: data.index === 0 ? { promptTokens: response.usage.prompt_tokens } : undefined
        }));
      });
      results.push(...batchResults);
    }

    return results;
  }

  getEmbeddingDimension(): number {
    return this.embeddingDimension;
  }
}
