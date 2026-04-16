import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiDimensionProfile, SearchConditions } from "../types.js";

const mockRunSearchCli = vi.fn();
const mockRunShowCli = vi.fn();
const mockDescribeRelativeDate = vi.fn((date: Date) => {
  const day = date.toISOString().slice(8, 10);
  return `${day}天前`;
});

vi.mock("../../search-cli.js", () => ({
  runSearchCli: mockRunSearchCli,
  runShowCli: mockRunShowCli
}));

vi.mock("../workflow.js", () => ({
  describeRelativeDate: mockDescribeRelativeDate
}));

const BASE_CONDITIONS: SearchConditions = {
  skills: ["python"],
  locations: ["杭州"],
  experience: undefined,
  role: "backend",
  sourceBias: "bonjour",
  mustHave: [],
  niceToHave: [],
  exclude: [],
  preferFresh: false,
  candidateAnchor: undefined,
  limit: 10
};

function createProfile(overrides: Partial<MultiDimensionProfile> = {}): MultiDimensionProfile {
  return {
    dimensions: {
      techMatch: 88,
      locationMatch: 96,
      careerStability: 74,
      projectDepth: 83,
      academicImpact: 40,
      communityReputation: 55
    },
    overallScore: 86,
    highlights: ["主导过搜索平台重构"],
    summary: "长期做搜索与自动化系统建设。",
    ...overrides
  };
}

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    name: "Ada",
    headline: "Python Backend Engineer",
    location: "杭州",
    company: null,
    experienceYears: null,
    matchScore: 0.82,
    profile: createProfile(),
    matchReason: "地点命中：杭州，技术命中：python",
    queryReasons: ["地点命中：杭州", "技术命中：python"],
    sources: ["Bonjour"],
    bonjourUrl: "https://bonjour.bio/ada",
    lastSyncedAt: new Date("2026-03-30T00:00:00.000Z"),
    latestEvidenceAt: new Date("2026-03-29T00:00:00.000Z"),
    _hydrated: {
      evidence: [
        {
          evidenceType: "project",
          title: "Built Hangzhou automation stack",
          description: "Used python heavily",
          source: "bonjour",
          occurredAt: new Date("2026-03-29T00:00:00.000Z")
        },
        {
          evidenceType: "repository",
          title: "ranking-service",
          description: "GitHub repo",
          source: "github",
          occurredAt: new Date("2026-03-28T00:00:00.000Z")
        }
      ]
    },
    ...overrides
  } as any;
}

describe("agent-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("packages search results through the search tool contract", async () => {
    mockRunSearchCli.mockResolvedValue({
      results: [{ personId: "person-1", name: "Ada" }],
      total: 1,
      resultWarning: undefined
    });

    const { searchCandidates } = await import("../agent-tools.js");
    const result = await searchCandidates({ query: "python 杭州", limit: 5 });

    expect(mockRunSearchCli).toHaveBeenCalledWith({
      query: "python 杭州",
      limit: 5,
      json: true
    });
    expect(result).toEqual({
      query: "python 杭州",
      limit: 5,
      results: [{ personId: "person-1", name: "Ada" }],
      total: 1,
      resultWarning: undefined
    });
  });

  it("packages inspect results through the inspect tool contract", async () => {
    mockRunShowCli.mockResolvedValue({
      person: { id: "person-1", primaryName: "Ada" },
      evidence: [{ evidenceType: "project", title: "Built ranking stack" }]
    });

    const { inspectCandidate } = await import("../agent-tools.js");
    const result = await inspectCandidate({ personId: "person-1" });

    expect(mockRunShowCli).toHaveBeenCalledWith({
      personId: "person-1",
      json: true
    });
    expect(result).toEqual({
      personId: "person-1",
      person: { id: "person-1", primaryName: "Ada" },
      evidence: [{ evidenceType: "project", title: "Built ranking stack" }]
    });
  });

  it("builds refine context and resolves candidate anchor by prompt", async () => {
    const {
      buildRefineContextCandidates,
      resolveCandidateAnchorWithContext
    } = await import("../agent-tools.js");

    const context = buildRefineContextCandidates([
      createCandidate(),
      createCandidate({
        personId: "person-2",
        name: "Grace",
        sources: ["GitHub"],
        profile: createProfile({ summary: "偏后端基础设施。" })
      })
    ]);

    expect(context).toMatchObject([
      {
        shortlistIndex: 1,
        personId: "person-1",
        name: "Ada",
        summary: "长期做搜索与自动化系统建设。"
      },
      {
        shortlistIndex: 2,
        personId: "person-2",
        name: "Grace",
        summary: "偏后端基础设施。"
      }
    ]);

    expect(resolveCandidateAnchorWithContext("像 2 号但更偏后端", BASE_CONDITIONS, context))
      .toMatchObject({
        candidateAnchor: {
          shortlistIndex: 2,
          personId: "person-2",
          name: "Grace"
        }
      });

    expect(resolveCandidateAnchorWithContext("更像 Ada 一点", BASE_CONDITIONS, context))
      .toMatchObject({
        candidateAnchor: {
          shortlistIndex: 1,
          personId: "person-1",
          name: "Ada"
        }
      });
  });

  it("prepares compare entries with recommendation-ready metadata", async () => {
    const { prepareComparisonEntries } = await import("../agent-tools.js");

    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Grace",
      matchScore: 0.74,
      queryReasons: ["技术命中：python"],
      bonjourUrl: undefined,
      sources: ["GitHub"],
      profile: createProfile({
        overallScore: 72,
        dimensions: {
          techMatch: 80,
          locationMatch: 88,
          careerStability: 70,
          projectDepth: 65,
          academicImpact: 20,
          communityReputation: 42
        }
      }),
      _hydrated: {
        evidence: [
          {
            evidenceType: "repository",
            title: "graph-rag",
            description: "GitHub project",
            source: "github",
            occurredAt: new Date("2026-03-25T00:00:00.000Z")
          }
        ]
      }
    });
    const third = createCandidate({
      personId: "person-3",
      name: "Linus",
      matchScore: 0.51,
      queryReasons: [],
      sources: ["Web"],
      bonjourUrl: undefined,
      lastSyncedAt: undefined,
      latestEvidenceAt: undefined,
      profile: createProfile({
        overallScore: 54,
        dimensions: {
          techMatch: 52,
          locationMatch: 40,
          careerStability: 58,
          projectDepth: 44,
          academicImpact: 18,
          communityReputation: 30
        }
      }),
      _hydrated: {
        evidence: [
          {
            evidenceType: "social",
            title: "Forum profile",
            description: "Sparse public profile",
            source: "web",
            occurredAt: new Date("2026-01-01T00:00:00.000Z")
          }
        ]
      }
    });

    const entries = prepareComparisonEntries(
      [first, second, third],
      [first, second, third],
      BASE_CONDITIONS
    );

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      shortlistIndex: 1,
      decisionTag: "优先深看",
      recommendation: expect.stringContaining("建议优先打开"),
      nextStep: "返回 shortlist 后先执行 v 1，再用 o 1 打开 Bonjour"
    });
    expect(entries[0].topEvidence[0]).toMatchObject({
      evidenceType: "project",
      sourceLabel: "Bonjour",
      freshnessLabel: "29天前"
    });
    expect(entries[1]).toMatchObject({
      shortlistIndex: 2,
      decisionTag: "继续比较",
      recommendation: expect.stringContaining("建议继续对照"),
      nextStep: "返回 shortlist 后执行 v 2 补充判断"
    });
    expect(entries[2]).toMatchObject({
      shortlistIndex: 3,
      decisionTag: "补充候选",
      recommendation: expect.stringContaining("建议作为备选"),
      nextStep: "保留在 pool 中，必要时再查看 #3"
    });
  });

  it("keeps compare evidence traceable, ordered, and capped to top three supported items", async () => {
    const { prepareComparisonEntries } = await import("../agent-tools.js");

    const candidate = createCandidate({
      _hydrated: {
        evidence: [
          {
            evidenceType: "social",
            title: "Community thread",
            description: "Discussed backend tooling",
            source: "web",
            occurredAt: new Date("2026-03-27T00:00:00.000Z")
          },
          {
            evidenceType: "repository",
            title: "ranking-service",
            description: "GitHub repo",
            source: "github",
            occurredAt: new Date("2026-03-28T00:00:00.000Z")
          },
          {
            evidenceType: "project",
            title: "Agentic search workspace",
            description: "Built python-heavy workflows",
            source: "bonjour",
            occurredAt: new Date("2026-03-29T00:00:00.000Z")
          },
          {
            evidenceType: "experience",
            title: "Search infra lead",
            description: "Owned retrieval stack",
            source: "bonjour",
            occurredAt: new Date("2026-03-26T00:00:00.000Z")
          },
          {
            evidenceType: "project",
            title: "   ",
            description: "   ",
            source: "bonjour",
            occurredAt: new Date("2026-03-30T00:00:00.000Z")
          }
        ]
      }
    });
    const support = createCandidate({
      personId: "person-2",
      name: "Grace",
      matchScore: 0.78
    });

    const [entry] = prepareComparisonEntries([candidate], [candidate, support], BASE_CONDITIONS);

    expect(entry.topEvidence).toEqual([
      {
        evidenceType: "project",
        title: "Agentic search workspace",
        sourceLabel: "Bonjour",
        freshnessLabel: "29天前"
      },
      {
        evidenceType: "repository",
        title: "ranking-service",
        sourceLabel: "GitHub",
        freshnessLabel: "30天前"
      },
      {
        evidenceType: "experience",
        title: "Search infra lead",
        sourceLabel: "Bonjour",
        freshnessLabel: "32天前"
      }
    ]);
  });
});
