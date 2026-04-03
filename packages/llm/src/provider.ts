export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** Request structured JSON output from the model */
  responseFormat?: "json" | "text";
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimension: number;
  usage?: { promptTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse>;
  embedBatch(texts: string[], options?: { model?: string }): Promise<EmbeddingResponse[]>;
}

export interface LLMProviderConfig {
  apiKey: string;
  baseURL?: string;
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
  embeddingDimension?: number;
}