---
phase: 03-search-embeddings
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/llm/src/provider.ts
  - packages/llm/src/openai.ts
  - packages/llm/src/embeddings.ts
  - packages/llm/src/index.ts
  - packages/llm/package.json
autonomous: true
requirements: [DATA-08, SEARCH-02]
user_setup:
  - service: openai
    why: "LLM and embedding generation for query parsing and semantic search"
    env_vars:
      - name: OPENAI_API_KEY
        source: "OpenAI Platform -> API Keys -> Create new secret key"
        note: "Requires access to gpt-4o-mini and text-embedding-3-small models"
must_haves:
  truths:
    - "LLM provider interface exists for chat completions"
    - "OpenAI provider implementation works with gpt-4o-mini"
    - "Embedding generation produces 1536-dimensional vectors"
    - "Provider abstraction allows future model swapping"
  artifacts:
    - path: "packages/llm/src/provider.ts"
      provides: "LLM provider interface abstraction"
      exports: ["LLMProvider", "ChatMessage", "ChatResponse", "EmbeddingResponse"]
    - path: "packages/llm/src/openai.ts"
      provides: "OpenAI-specific implementation"
      exports: ["OpenAIProvider"]
    - path: "packages/llm/src/embeddings.ts"
      provides: "Embedding generation with caching"
      exports: ["generateEmbedding", "generateEmbeddings"]
  key_links:
    - from: "packages/llm/src/openai.ts"
      to: "openai SDK"
      via: "npm package"
      pattern: "import OpenAI from 'openai'"
---

<objective>
Create an LLM provider abstraction layer for chat completions and embedding generation. This provides a unified interface that allows swapping between different LLM providers while currently implementing OpenAI as the default.

Purpose: Foundation for query intent parsing (SEARCH-02) and embedding generation (DATA-08)
Output: Reusable LLM module with OpenAI implementation
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create LLM provider interface and OpenAI implementation</name>
  <files>packages/llm/src/provider.ts, packages/llm/src/openai.ts, packages/llm/package.json</files>
  <read_first>
    - packages/db/src/schema.ts (existing module structure pattern)
    - packages/shared/src/index.ts (export pattern)
  </read_first>
  <action>
Create packages/llm/ package with provider abstraction:

1. Create packages/llm/package.json:
```json
{
  "name": "@seeku/llm",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "openai": "^4.85.0"
  },
  "devDependencies": {
    "typescript": "^5.8.2",
    "@types/node": "^22.13.10"
  }
}
```

2. Create packages/llm/src/provider.ts with interface:
```typescript
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
  usage?: { promptTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: { model?: string; temperature?: number }): Promise<ChatResponse>;
  embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse>;
  embedBatch(texts: string[], options?: { model?: string }): Promise<EmbeddingResponse[]>;
}
```

3. Create packages/llm/src/openai.ts implementing the interface:
```typescript
import OpenAI from "openai";
import type { LLMProvider, ChatMessage, ChatResponse, EmbeddingResponse } from "./provider.js";

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY
    });
  }

  async chat(messages: ChatMessage[], options?: { model?: string; temperature?: number }): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? DEFAULT_CHAT_MODEL,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0
    });

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens
      } : undefined
    };
  }

  async embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse> {
    const response = await this.client.embeddings.create({
      model: options?.model ?? DEFAULT_EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSION
    });

    return {
      embedding: response.data[0].embedding,
      model: response.model,
      usage: { promptTokens: response.usage.prompt_tokens }
    };
  }

  async embedBatch(texts: string[], options?: { model?: string }): Promise<EmbeddingResponse[]> {
    const response = await this.client.embeddings.create({
      model: options?.model ?? DEFAULT_EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSION
    });

    return response.data.map((d, i) => ({
      embedding: d.embedding,
      model: response.model,
      usage: i === 0 ? { promptTokens: response.usage.prompt_tokens } : undefined
    }));
  }
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/llm && pnpm build --filter=@seeku/llm</automated>
  </verify>
  <done>
    - LLMProvider interface defined with chat and embed methods
    - OpenAIProvider implements LLMProvider with gpt-4o-mini and text-embedding-3-small
    - TypeScript compilation succeeds
    - Build succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Create embedding generation helpers with caching</name>
  <files>packages/llm/src/embeddings.ts, packages/llm/src/index.ts</files>
  <read_first>
    - packages/llm/src/provider.ts (LLMProvider interface)
    - packages/llm/src/openai.ts (OpenAIProvider)
  </read_first>
  <action>
Create embedding helpers with caching support:

1. Create packages/llm/src/embeddings.ts:
```typescript
import type { LLMProvider } from "./provider.js";

interface EmbeddingCache {
  get(key: string): number[] | undefined;
  set(key: string, embedding: number[]): void;
}

// Simple in-memory cache for development
const memoryCache = new Map<string, number[]>();

export const defaultCache: EmbeddingCache = {
  get: (key) => memoryCache.get(key),
  set: (key, embedding) => memoryCache.set(key, embedding)
};

export async function generateEmbedding(
  provider: LLMProvider,
  text: string,
  cache?: EmbeddingCache
): Promise<number[]> {
  const cacheKey = `embed:${text.slice(0, 100)}:${text.length}`;

  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  const response = await provider.embed(text);

  if (cache) {
    cache.set(cacheKey, response.embedding);
  }

  return response.embedding;
}

export async function generateEmbeddings(
  provider: LLMProvider,
  texts: string[],
  cache?: EmbeddingCache
): Promise<number[][]> {
  // Check cache for each text
  const uncachedIndices: number[] = [];
  const results: (number[] | undefined)[] = texts.map((text, i) => {
    const cacheKey = `embed:${text.slice(0, 100)}:${text.length}`;
    const cached = cache?.get(cacheKey);
    if (cached) return cached;
    uncachedIndices.push(i);
    return undefined;
  });

  // Batch generate uncached embeddings
  if (uncachedIndices.length > 0) {
    const uncachedTexts = uncachedIndices.map(i => texts[i]);
    const embeddings = await provider.embedBatch(uncachedTexts);

    for (let j = 0; j < uncachedIndices.length; j++) {
      results[uncachedIndices[j]] = embeddings[j].embedding;

      // Cache the result
      const text = texts[uncachedIndices[j]];
      const cacheKey = `embed:${text.slice(0, 100)}:${text.length}`;
      cache?.set(cacheKey, embeddings[j].embedding);
    }
  }

  return results as number[][];
}
```

2. Create packages/llm/src/index.ts:
```typescript
export * from "./provider.js";
export * from "./openai.js";
export * from "./embeddings.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/llm && pnpm build --filter=@seeku/llm</automated>
  </verify>
  <done>
    - generateEmbedding function exists with caching support
    - generateEmbeddings function exists for batch processing
    - In-memory default cache provided
    - All exports properly organized in index.ts
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/llm
2. Build passes for @seeku/llm
3. LLMProvider interface exports chat and embed methods
4. OpenAIProvider uses gpt-4o-mini and text-embedding-3-small
</verification>

<success_criteria>
1. LLM provider abstraction allows model swapping
2. OpenAI implementation provides chat completions (SEARCH-02 foundation)
3. Embedding generation produces 1536-dimensional vectors (DATA-08 foundation)
4. Caching reduces redundant embedding API calls
5. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/02-SUMMARY.md`
</output>