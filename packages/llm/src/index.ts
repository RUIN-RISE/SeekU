export * from "./provider.js";
export * from "./siliconflow.js";
export * from "./openrouter.js";
export * from "./stepfun.js";
export * from "./embeddings.js";

import type { LLMProvider } from "./provider.js";
import { StepFunProvider } from "./stepfun.js";
import { SiliconFlowProvider } from "./siliconflow.js";

/**
 * Create a provider that routes chat to StepFun (if configured) or SiliconFlow,
 * and always routes embedding to SiliconFlow.
 * Drop-in replacement for SiliconFlowProvider.fromEnv().
 */
export function createProvider(): LLMProvider {
  const embedProvider = SiliconFlowProvider.fromEnv();

  if (process.env.STEPFUN_API_KEY) {
    const chatProvider = StepFunProvider.fromEnv();
    return {
      get name() { return chatProvider.name; },
      chat: (messages, options) => chatProvider.chat(messages, options),
      embed: (text, options) => embedProvider.embed(text, options),
      embedBatch: (texts, options) => embedProvider.embedBatch(texts, options),
    };
  }

  return embedProvider;
}

/**
 * @deprecated Use createProvider() instead — it handles both chat and embedding routing.
 */
export function createChatProvider(): LLMProvider {
  return createProvider();
}