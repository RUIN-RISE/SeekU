export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimension: number;
  usage?: { promptTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: { model?: string; temperature?: number }): Promise<ChatResponse>;
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