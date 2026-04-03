import OpenAI from "openai";
import type { LLMProvider, LLMProviderConfig, ChatMessage, ChatResponse, EmbeddingResponse, ChatOptions } from "./provider.js";
import { withRetry } from "@seeku/shared";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_CHAT_MODEL = "openrouter/free";

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  private client: OpenAI;
  private defaultChatModel: string;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://seeku.ai", // Required for OpenRouter
        "X-Title": "Seeku AI"
      }
    });
    this.defaultChatModel = config.defaultChatModel ?? DEFAULT_CHAT_MODEL;
  }

  static fromEnv(): OpenRouterProvider {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required to use OpenRouterProvider");
    }
    return new OpenRouterProvider({
      apiKey,
      baseURL: process.env.OPENROUTER_BASE_URL ?? OPENROUTER_BASE_URL,
      defaultChatModel: process.env.OPENROUTER_CHAT_MODEL ?? DEFAULT_CHAT_MODEL
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: options?.model ?? this.defaultChatModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7
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

  async embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse> {
    // Note: OpenRouter supports embeddings for some models, but we primarily use it for chat.
    const response = await this.client.embeddings.create({
      model: options?.model ?? "openai/text-embedding-3-small",
      input: text
    });

    const data = response.data[0];
    return {
      embedding: data.embedding,
      model: response.model,
      dimension: data.embedding.length,
      usage: { promptTokens: response.usage.prompt_tokens }
    };
  }

  async embedBatch(texts: string[], options?: { model?: string }): Promise<EmbeddingResponse[]> {
    const response = await this.client.embeddings.create({
      model: options?.model ?? "openai/text-embedding-3-small",
      input: texts
    });

    return response.data.map(data => ({
      embedding: data.embedding,
      model: response.model,
      dimension: data.embedding.length,
      usage: data.index === 0 ? { promptTokens: response.usage.prompt_tokens } : undefined
    }));
  }
}
