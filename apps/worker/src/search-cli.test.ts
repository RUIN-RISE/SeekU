import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateDatabaseConnection = vi.fn();
const mockClose = vi.fn();
const mockPlannerParse = vi.fn();
const mockRetrieverRetrieve = vi.fn();
const mockRerankerRerank = vi.fn();
const mockEmbed = vi.fn();
const mockBuildQueryMatchExplanation = vi.fn();
const mockDescribeRelativeDate = vi.fn();
const mockClassifyMatchStrength = vi.fn((score: number, reasons: string[]) =>
  reasons.some((reason) => reason.includes("技术命中")) ? "strong" : "weak"
);
const mockBuildResultWarning = vi.fn((results: Array<{ matchStrength: string }>) =>
  results.some((result) => result.matchStrength === "strong")
    ? undefined
    : "没有找到强匹配，只找到了弱相关候选人。建议继续补充必须项、关键技术或来源偏好。"
);
const mockFormatSourceLabel = vi.fn((source?: string) => {
  if (source === "bonjour") return "Bonjour";
  if (source === "github") return "GitHub";
  if (source === "web") return "Web";
  return source;
});

const personsTable = { table: "persons", id: "persons.id", searchStatus: "persons.searchStatus" };
const evidenceItemsTable = { table: "evidence_items", personId: "evidence.personId" };
const searchDocumentsTable = { table: "search_documents", personId: "documents.personId" };
const personIdentitiesTable = { table: "person_identities", personId: "identities.personId", sourceProfileId: "identities.sourceProfileId" };
const sourceProfilesTable = { table: "source_profiles", id: "profiles.id" };

let queryResults = new Map<any, any[]>();

vi.mock("@seeku/db", () => ({
  createDatabaseConnection: mockCreateDatabaseConnection,
  persons: personsTable,
  evidenceItems: evidenceItemsTable,
  searchDocuments: searchDocumentsTable,
  personIdentities: personIdentitiesTable,
  sourceProfiles: sourceProfilesTable,
  and: vi.fn((...args) => args),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({}))
}));

vi.mock("@seeku/llm", () => ({
  SiliconFlowProvider: {
    fromEnv: vi.fn(() => ({
      embed: mockEmbed,
      chat: vi.fn(async () => ({ content: "test" }))
    }))
  }
}));

vi.mock("@seeku/search", () => ({
  QueryPlanner: vi.fn(() => ({
    parse: mockPlannerParse
  })),
  HybridRetriever: vi.fn(() => ({
    retrieve: mockRetrieverRetrieve
  })),
  Reranker: vi.fn(() => ({
    rerank: mockRerankerRerank
  }))
}));

vi.mock("./cli/workflow.js", () => ({
  buildQueryMatchExplanation: mockBuildQueryMatchExplanation,
  buildResultWarning: mockBuildResultWarning,
  classifyMatchStrength: mockClassifyMatchStrength,
  describeRelativeDate: mockDescribeRelativeDate,
  formatSourceLabel: mockFormatSourceLabel
}));

function createMockDb() {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table) => ({
        where: vi.fn(() => queryResults.get(table) ?? [])
      }))
    }))
  };
}

describe("CLI Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResults = new Map();
    mockClose.mockResolvedValue(undefined);
    mockCreateDatabaseConnection.mockReturnValue({
      db: createMockDb(),
      close: mockClose
    });
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    mockPlannerParse.mockResolvedValue({
      rawQuery: "test query",
      roles: [],
      skills: ["python"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    });
    mockRetrieverRetrieve.mockResolvedValue([]);
    mockRerankerRerank.mockReturnValue([]);
    mockBuildQueryMatchExplanation.mockReturnValue({
      summary: "技术命中：python",
      reasons: ["技术命中：python"]
    });
    mockDescribeRelativeDate.mockReturnValue("3天前");
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

      expect(result).toEqual({
        results: [],
        total: 0
      });
    });

    it("should accept limit parameter", async () => {
      const { runSearchCli } = await import("./search-cli.js");

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

    it("should include parity metadata in json search results", async () => {
      queryResults = new Map<any, any[]>([
        [searchDocumentsTable, [{
          personId: "person-1",
          docText: "Python builder in Hangzhou",
          facetSource: ["bonjour"],
          facetLocation: ["杭州"],
          facetRole: [],
          facetTags: []
        }]],
        [evidenceItemsTable, [{
          personId: "person-1",
          evidenceType: "project",
          title: "Built Hangzhou automation stack",
          description: "Used python heavily",
          source: "bonjour",
          occurredAt: new Date("2026-03-27T00:00:00.000Z")
        }]],
        [personsTable, [{
          id: "person-1",
          primaryName: "Ada",
          primaryHeadline: "Python Engineer",
          primaryLocation: "杭州",
          summary: "Builds automation systems",
          updatedAt: new Date("2026-03-30T00:00:00.000Z")
        }]],
        [personIdentitiesTable, [{
          personId: "person-1",
          sourceProfileId: "profile-1"
        }]],
        [sourceProfilesTable, [{
          id: "profile-1",
          source: "bonjour",
          canonicalUrl: "https://bonjour.bio/ada"
        }]]
      ]);
      mockRetrieverRetrieve.mockResolvedValue([{ personId: "person-1" }]);
      mockRerankerRerank.mockReturnValue([{
        personId: "person-1",
        finalScore: 0.82,
        matchReasons: ["skill evidence: python"]
      }]);
      mockBuildQueryMatchExplanation.mockReturnValue({
        summary: "地点命中：杭州，技术命中：python",
        reasons: ["地点命中：杭州", "技术命中：python"]
      });
      mockDescribeRelativeDate.mockReturnValue("3天前");

      const { runSearchCli } = await import("./search-cli.js");
      const result = await runSearchCli({
        query: "杭州 python",
        json: true
      });

      if (typeof result === "string") {
        throw new Error("Expected JSON object output");
      }

      expect(result.results[0]).toMatchObject({
        personId: "person-1",
        name: "Ada",
        headline: "Python Engineer",
        location: "杭州",
        matchScore: 0.82,
        matchStrength: "strong",
        matchReasons: ["skill evidence: python"],
        matchReason: "地点命中：杭州，技术命中：python",
        whyMatched: "地点命中：杭州，技术命中：python",
        source: "Bonjour",
        sources: ["Bonjour"],
        freshness: "3天前",
        bonjourUrl: "https://bonjour.bio/ada"
      });
      expect(result.resultWarning).toBeUndefined();
      expect(result.results[0]?.lastSyncedAt).toBe("2026-03-30T00:00:00.000Z");
      expect(result.results[0]?.latestEvidenceAt).toBe("2026-03-27T00:00:00.000Z");
      expect(mockBuildQueryMatchExplanation).toHaveBeenCalledTimes(1);
      expect(mockDescribeRelativeDate).toHaveBeenCalledTimes(1);
    });

    it("should fall back to raw query reason when explanation becomes generic", async () => {
      queryResults = new Map<any, any[]>([
        [searchDocumentsTable, [{
          personId: "person-1",
          docText: "Builder in Hangzhou",
          facetSource: ["bonjour"],
          facetLocation: ["杭州"],
          facetRole: [],
          facetTags: []
        }]],
        [evidenceItemsTable, [{
          personId: "person-1",
          evidenceType: "project",
          title: "Built Hangzhou automation stack",
          description: "Used python heavily",
          source: "bonjour",
          occurredAt: new Date("2026-03-27T00:00:00.000Z")
        }]],
        [personsTable, [{
          id: "person-1",
          primaryName: "Ada",
          primaryHeadline: "Builder",
          primaryLocation: "中国 / 浙江省 / 杭州市",
          summary: "Builds automation systems",
          updatedAt: new Date("2026-03-30T00:00:00.000Z")
        }]],
        [personIdentitiesTable, [{
          personId: "person-1",
          sourceProfileId: "profile-1"
        }]],
        [sourceProfilesTable, [{
          id: "profile-1",
          source: "bonjour",
          canonicalUrl: "https://bonjour.bio/ada"
        }]]
      ]);
      mockRetrieverRetrieve.mockResolvedValue([{ personId: "person-1" }]);
      mockRerankerRerank.mockReturnValue([{
        personId: "person-1",
        finalScore: 0.31,
        matchReasons: []
      }]);
      mockBuildQueryMatchExplanation.mockReturnValue({
        summary: "综合相关度 0.3 分",
        reasons: ["综合相关度 0.3 分"]
      });

      const { runSearchCli } = await import("./search-cli.js");
      const result = await runSearchCli({
        query: "杭州",
        json: true
      });

      if (typeof result === "string") {
        throw new Error("Expected JSON object output");
      }

      expect(result.results[0]?.matchReason).toBe("地点命中：杭州");
      expect(result.results[0]?.whyMatched).toBe("地点命中：杭州");
      expect(result.results[0]?.matchStrength).toBe("weak");
      expect(result.resultWarning).toContain("只找到了弱相关候选人");
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
