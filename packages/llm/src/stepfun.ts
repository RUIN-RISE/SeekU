import OpenAI from "openai";
import type { LLMProvider, LLMProviderConfig, ChatMessage, ChatResponse, ChatOptions } from "./provider.js";
import { withRetry } from "@seeku/shared";

// StepFun (阶跃星辰) official API defaults
const STEPFUN_BASE_URL = "https://api.stepfun.com/v1";
const DEFAULT_CHAT_MODEL = "step-3.5-flash-2603";

export class StepFunProvider implements LLMProvider {
  readonly name = "stepfun";
  private client: OpenAI;
  private defaultChatModel: string;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? STEPFUN_BASE_URL
    });
    this.defaultChatModel = config.defaultChatModel ?? DEFAULT_CHAT_MODEL;
  }

  static fromEnv(): StepFunProvider {
    const apiKey = process.env.STEPFUN_API_KEY;
    if (!apiKey) {
      throw new Error("STEPFUN_API_KEY is required to use StepFunProvider");
    }
    return new StepFunProvider({
      apiKey,
      baseURL: process.env.STEPFUN_BASE_URL ?? STEPFUN_BASE_URL,
      defaultChatModel: process.env.STEPFUN_CHAT_MODEL ?? DEFAULT_CHAT_MODEL
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

  async embed(): Promise<never> {
    throw new Error("StepFunProvider does not support embeddings. Use SiliconFlowProvider for embedding operations.");
  }

  async embedBatch(): Promise<never> {
    throw new Error("StepFunProvider does not support embeddings. Use SiliconFlowProvider for embedding operations.");
  }

  getEmbeddingDimension(): number {
    throw new Error("StepFunProvider does not support embeddings.");
  }
}
