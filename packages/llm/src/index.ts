export * from "./provider.js";
export * from "./siliconflow.js";
export * from "./openrouter.js";
export * from "./stepfun.js";
export * from "./embeddings.js";

import type { LLMProvider } from "./provider.js";
import { StepFunProvider } from "./stepfun.js";
import { SiliconFlowProvider } from "./siliconflow.js";

function createLazyEmbedProvider() {
  let provider: SiliconFlowProvider | null = null;

  return () => {
    if (!provider) {
      provider = SiliconFlowProvider.fromEnv();
    }

    return provider;
  };
}

/**
 * Create a provider that routes chat to StepFun (if configured) or SiliconFlow,
 * and always routes embedding to SiliconFlow.
 * Drop-in replacement for SiliconFlowProvider.fromEnv().
 */
export function createProvider(): LLMProvider {
  const getEmbedProvider = createLazyEmbedProvider();

  if (process.env.STEPFUN_API_KEY) {
    const chatProvider = StepFunProvider.fromEnv();
    return {
      get name() { return chatProvider.name; },
      chat: (messages, options) => chatProvider.chat(messages, options),
      embed: (text, options) => getEmbedProvider().embed(text, options),
      embedBatch: (texts, options) => getEmbedProvider().embedBatch(texts, options),
    };
  }

  return getEmbedProvider();
}

/**
 * @deprecated Use createProvider() instead — it handles both chat and embedding routing.
 */
export function createChatProvider(): LLMProvider {
  return createProvider();
}
