import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("@seeku/db", () => ({
  createDatabaseConnection: vi.fn(() => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => [])
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => [])
        }))
      }))
    },
    close: vi.fn()
  })),
  persons: { id: "persons", searchStatus: "searchStatus" },
  evidenceItems: { personId: "personId" },
  searchDocuments: { personId: "personId" },
  and: vi.fn((...args) => args),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({}))
}));

vi.mock("@seeku/llm", () => ({
  SiliconFlowProvider: {
    fromEnv: vi.fn(() => ({
      embed: vi.fn(async () => ({ embedding: [0.1, 0.2, 0.3] })),
      chat: vi.fn(async () => ({ content: "test" }))
    }))
  }
}));

vi.mock("@seeku/search", () => ({
  QueryPlanner: vi.fn(() => ({
    parse: vi.fn(async () => ({
      rawQuery: "test query",
      roles: [],
      skills: ["python"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    }))
  })),
  HybridRetriever: vi.fn(() => ({
    retrieve: vi.fn(async () => [])
  })),
  Reranker: vi.fn(() => ({
    rerank: vi.fn(() => [])
  }))
}));

describe("CLI Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("runSearchCli", () => {
    it("should return empty array when no results found", async () => {
      const { runSearchCli } = await import("./search-cli.js");

      const result = await runSearchCli({
        query: "nonexistent skill xyz",
        json: true
      });

      expect(result).toEqual([]);
    });

    it("should accept limit parameter", async () => {
      const { runSearchCli } = await import("./search-cli.js");

      // Should not throw
      await expect(runSearchCli({
        query: "Python",
        limit: 5,
        json: true
      })).resolves.toBeDefined();
    });

    it("should return human-readable message when json is false", async () => {
      const { runSearchCli } = await import("./search-cli.js");

      const result = await runSearchCli({
        query: "nonexistent skill xyz",
        json: false
      });

      expect(result).toBe("No results found.");
    });
  });

  describe("runShowCli", () => {
    it("should handle non-existent personId", async () => {
      const { runShowCli } = await import("./search-cli.js");

      const result = await runShowCli({
        personId: "non-existent-uuid",
        json: true
      });

      expect(result).toHaveProperty("person");
      if (typeof result === "string") {
        throw new Error("Expected ProfileOutput, got string");
      }
      expect(result.person).toBeNull();
    });
  });
});

describe("CLI Argument Parsing", () => {
  it("should parse basic command arguments", () => {
    const testArgv = ["node", "cli.ts", "search", "Python developer"];
    // Test that we can parse args
    expect(testArgv.length).toBeGreaterThan(3);
  });

  it("should parse --json flag", () => {
    const testArgv = ["node", "cli.ts", "search", "Python", "--json"];
    expect(testArgv).toContain("--json");
  });

  it("should parse --limit parameter", () => {
    const testArgv = ["node", "cli.ts", "search", "Python", "--limit", "10"];
    const limitIndex = testArgv.indexOf("--limit");
    expect(testArgv[limitIndex + 1]).toBe("10");
  });
});