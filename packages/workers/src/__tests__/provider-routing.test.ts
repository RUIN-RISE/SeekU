import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted mocks
vi.mock("@seeku/db", () => ({
  createDatabaseConnection: vi.fn(() => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [])
          }))
        }))
      }))
    },
    close: vi.fn()
  })),
  evidenceItems: {},
  sourceProfiles: {},
  inArray: vi.fn(),
  not: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  eq: vi.fn()
}));

vi.mock("@seeku/llm", async () => {
  const actual = await vi.importActual<typeof import("@seeku/llm")>("@seeku/llm");
  return {
    ...actual,
    SiliconFlowProvider: {
      ...actual.SiliconFlowProvider,
      fromStrictEnv: vi.fn(() => ({
        name: "siliconflow-mock",
        chat: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn()
      }))
    },
    OpenRouterProvider: {
      ...actual.OpenRouterProvider,
      fromEnv: vi.fn(() => ({
        name: "openrouter-mock",
        chat: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn()
      }))
    }
  };
});

vi.mock("../enrichment/hub.js", () => ({
  EnrichmentHub: vi.fn().mockImplementation(() => ({
    // Mock methods if needed
  }))
}));

import { SearchIndexWorker } from "../search-index-worker.js";
import { runProfileEnrichmentWorker } from "../profile-enrichment.js";
import { SiliconFlowProvider } from "@seeku/llm";
import { EnrichmentHub } from "../enrichment/hub.js";

describe("Provider Routing Regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("SearchIndexWorker should hard-lock to SiliconFlow fromStrictEnv by default", () => {
    const worker = new SearchIndexWorker({} as any);
    expect(SiliconFlowProvider.fromStrictEnv).toHaveBeenCalled();
  });

  it("SearchIndexWorker should honor explicit provider if passed", () => {
    const customProvider = { name: "custom" } as any;
    const worker = new SearchIndexWorker({} as any, { provider: customProvider });
    expect(SiliconFlowProvider.fromStrictEnv).not.toHaveBeenCalled();
  });

  it("runProfileEnrichmentWorker should pass custom provider to EnrichmentHub", async () => {
    const spyProvider = {
      name: "spy-provider",
      chat: vi.fn().mockResolvedValue({ content: "{}" }),
      embed: vi.fn(),
      embedBatch: vi.fn()
    } as any;

    await runProfileEnrichmentWorker({
      provider: spyProvider,
      limit: 1
    });

    expect(EnrichmentHub).toHaveBeenCalledWith(expect.anything(), spyProvider);
  });
});
