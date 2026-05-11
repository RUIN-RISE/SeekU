import OpenAI from "openai";
import type { LLMProvider, LLMProviderConfig, ChatMessage, ChatResponse, ChatOptions } from "./provider.js";
import { withRetry } from "@seeku/shared";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_CHAT_MODEL = "deepseek-v4-flash";

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";
  private client: OpenAI;
  private defaultChatModel: string;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? DEEPSEEK_BASE_URL
    });
    this.defaultChatModel = config.defaultChatModel ?? DEFAULT_CHAT_MODEL;
  }

  static fromEnv(): DeepSeekProvider {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required to use DeepSeekProvider");
    }
    return new DeepSeekProvider({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? DEEPSEEK_BASE_URL,
      defaultChatModel: process.env.DEEPSEEK_CHAT_MODEL ?? DEFAULT_CHAT_MODEL
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: options?.model ?? this.defaultChatModel,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        temperature: options?.temperature ?? 0.7,
        response_format: options?.responseFormat === "json" ? { type: "json_object" } : undefined
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

  async embed(_text?: string, _options?: { model?: string; signal?: AbortSignal }): Promise<never> {
    throw new Error("DeepSeekProvider does not support embeddings here. Use SiliconFlowProvider for embedding operations.");
  }

  async embedBatch(_texts?: string[], _options?: { model?: string; signal?: AbortSignal }): Promise<never> {
    throw new Error("DeepSeekProvider does not support embeddings here. Use SiliconFlowProvider for embedding operations.");
  }
}
