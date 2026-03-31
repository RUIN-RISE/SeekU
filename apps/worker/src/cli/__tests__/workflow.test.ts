import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiDimensionProfile, SearchConditions } from "../types.js";
import {
  SearchWorkflow,
  buildConditionAudit,
  buildCandidateSourceMetadata,
  buildQueryMatchExplanation,
  buildResultWarning,
  classifyMatchStrength
} from "../workflow.js";

const BASE_CONDITIONS: SearchConditions = {
  skills: ["python"],
  locations: ["杭州"],
  experience: undefined,
  role: "backend",
  sourceBias: "bonjour",
  mustHave: [],
  niceToHave: [],
  exclude: [],
  preferFresh: true,
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
      person: {
        id: "person-1",
        primaryName: "Ada",
        primaryHeadline: "Python Backend Engineer",
        primaryLocation: "杭州",
        updatedAt: new Date("2026-03-30T00:00:00.000Z")
      },
      document: {
        personId: "person-1",
        facetSource: ["bonjour"],
        facetLocation: ["杭州"]
      },
      evidence: [
        {
          personId: "person-1",
          evidenceType: "project",
          title: "Built Hangzhou automation stack",
          description: "Used python heavily",
          source: "bonjour",
          occurredAt: new Date("2026-03-29T00:00:00.000Z")
        }
      ]
    },
    ...overrides
  } as any;
}

function createWorkflowHarness() {
  const workflow = new SearchWorkflow({} as any, {} as any);
  const mockTui = {
    resetShortlistViewport: vi.fn(),
    displayHelp: vi.fn(),
    displayPoolEmpty: vi.fn(),
    displayPool: vi.fn(),
    displayHistory: vi.fn(),
    displayFilters: vi.fn(),
    displayExportEmpty: vi.fn(),
    displayExportSuccess: vi.fn(),
    displayUndo: vi.fn(),
    displayPoolCleared: vi.fn(),
    promptCompareAction: vi.fn(),
    promptDetailAction: vi.fn()
  };
  const mockChat = {
    askFreeform: vi.fn()
  };
  const mockRenderer = {
    renderComparison: vi.fn(() => "COMPARE VIEW")
  };
  const mockExporter = {
    export: vi.fn()
  };

  (workflow as any).tui = mockTui;
  (workflow as any).chat = mockChat;
  (workflow as any).renderer = mockRenderer;
  (workflow as any).exporter = mockExporter;
  (workflow as any).refreshCandidateQueryExplanation = vi.fn();
  (workflow as any).ensureProfiles = vi.fn(async () => undefined);
  (workflow as any).sortCandidates = vi.fn(async () => undefined);
  (workflow as any).formatConditionsAsPrompt = vi.fn(() => "杭州 python");

  return {
    workflow,
    mockTui,
    mockChat,
    mockRenderer,
    mockExporter,
    handleShortlistCommand: (workflow as any).handleShortlistCommand.bind(workflow) as (
      command: any,
      candidates: any[],
      conditions: SearchConditions,
      state: { sortMode: string; visibleCount: number; selectedIndex: number }
    ) => Promise<any>
  };
}

describe("SearchWorkflow shortlist command handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns refine outcome from freeform prompt", async () => {
    const { handleShortlistCommand, mockChat, mockTui } = createWorkflowHarness();
    const candidates = [createCandidate()];
    mockChat.askFreeform.mockResolvedValue("去掉销售");

    const result = await handleShortlistCommand(
      { type: "refine" },
      candidates,
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect(mockTui.resetShortlistViewport).toHaveBeenCalledTimes(1);
    expect(mockChat.askFreeform).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      type: "done",
      result: {
        type: "refine",
        prompt: "去掉销售"
      }
    });
  });

  it("reranks shortlist in-place for sort commands", async () => {
    const { workflow, handleShortlistCommand } = createWorkflowHarness();
    const candidates = [createCandidate()];

    const result = await handleShortlistCommand(
      { type: "sort", sortMode: "fresh" },
      candidates,
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect((workflow as any).sortCandidates).toHaveBeenCalledWith(
      candidates,
      "fresh",
      BASE_CONDITIONS
    );
    expect(result.type).toBe("continue");
    expect(result.sortMode).toBe("fresh");
    expect(result.reuseViewport).toBe(true);
    expect(result.statusMessage?.text).toContain("rerank-only");
  });

  it("toggles the selected candidate in and out of the compare pool", async () => {
    const { workflow, handleShortlistCommand } = createWorkflowHarness();
    const candidates = [createCandidate()];

    const addResult = await handleShortlistCommand(
      { type: "togglePool", indexes: [1] },
      candidates,
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect(addResult.type).toBe("continue");
    expect(addResult.statusMessage).toMatchObject({
      tone: "success",
      text: expect.stringContaining("已加入对比池")
    });
    expect((workflow as any).comparePool).toHaveLength(1);

    const removeResult = await handleShortlistCommand(
      { type: "togglePool", indexes: [1] },
      candidates,
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect(removeResult.type).toBe("continue");
    expect(removeResult.statusMessage).toMatchObject({
      tone: "success",
      text: expect.stringContaining("已移出对比池")
    });
    expect((workflow as any).comparePool).toHaveLength(0);
  });

  it("shows a clear warning when compare pool is empty", async () => {
    const { handleShortlistCommand } = createWorkflowHarness();
    const candidates = [createCandidate()];

    const result = await handleShortlistCommand(
      { type: "compare" },
      candidates,
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect(result.type).toBe("continue");
    expect(result.reuseViewport).toBe(true);
    expect(result.statusMessage).toMatchObject({
      tone: "warning",
      text: expect.stringContaining("对比池为空")
    });
  });

  it("skips background profile preloading in interactive tty mode", () => {
    const { workflow } = createWorkflowHarness();
    const originalIsTTY = process.stdin.isTTY;

    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true
    });

    try {
      expect((workflow as any).shouldPreloadProfiles()).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalIsTTY
      });
    }
  });

  it("supports compare view back path from the pool", async () => {
    const { workflow, handleShortlistCommand, mockRenderer, mockTui } = createWorkflowHarness();
    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Lin",
      bonjourUrl: "https://bonjour.bio/lin"
    });
    const comparisonEntries = [
      {
        shortlistIndex: 1,
        candidate: first,
        profile: first.profile,
        topEvidence: [
          {
            evidenceType: "project",
            title: "Built Hangzhou automation stack",
            sourceLabel: "Bonjour",
            freshnessLabel: "2天前"
          }
        ],
        decisionTag: "优先深看",
        decisionScore: 92,
        recommendation: "建议优先打开：地点完全匹配，资料也较新",
        nextStep: "返回 shortlist 后先执行 v 1，再用 o 1 打开 Bonjour"
      },
      {
        shortlistIndex: 2,
        candidate: second,
        profile: second.profile,
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 84,
        recommendation: "建议继续对照：信息还需要补充判断",
        nextStep: "返回 shortlist 后执行 v 2 补充判断"
      }
    ];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).comparePool = [first, second];
    (workflow as any).buildComparisonEntries = vi.fn(() => comparisonEntries);
    mockTui.promptCompareAction.mockResolvedValue("back");

    const result = await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect((workflow as any).ensureProfiles).toHaveBeenCalledWith(
      [first, second],
      BASE_CONDITIONS,
      "正在准备候选人对比..."
    );
    expect(mockRenderer.renderComparison).toHaveBeenCalledWith(comparisonEntries, BASE_CONDITIONS);
    expect(mockTui.promptCompareAction).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("COMPARE VIEW");
    expect(result.type).toBe("continue");
  });

  it("exports pool records with comparison metadata", async () => {
    const { workflow, handleShortlistCommand, mockExporter, mockTui } = createWorkflowHarness();
    const first = createCandidate({
      queryReasons: ["地点命中：杭州", "技术命中：python", "相关证据：Built Hangzhou automation stack"],
      matchReason: "地点命中：杭州，技术命中：python"
    });
    const second = createCandidate({
      personId: "person-2",
      name: "Lin",
      queryReasons: ["技术命中：python"],
      matchReason: "技术命中：python"
    });
    const comparisonEntries = [
      {
        shortlistIndex: 1,
        candidate: first,
        profile: first.profile,
        topEvidence: [
          {
            evidenceType: "project",
            title: "Built Hangzhou automation stack",
            sourceLabel: "Bonjour",
            freshnessLabel: "2天前"
          }
        ],
        decisionTag: "优先深看",
        decisionScore: 92,
        recommendation: "建议优先打开：地点完全匹配，资料也较新",
        nextStep: "返回 shortlist 后先执行 v 1，再用 o 1 打开 Bonjour"
      },
      {
        shortlistIndex: 2,
        candidate: second,
        profile: second.profile,
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 84,
        recommendation: "建议继续对照：信息还需要补充判断",
        nextStep: "返回 shortlist 后执行 v 2 补充判断"
      }
    ];
    const artifact = {
      target: "pool",
      format: "md",
      generatedAt: "2026-03-31T00:00:00.000Z",
      outputDir: "/tmp/shortlists/20260331-000000-000",
      querySummary: "杭州 python",
      count: 2,
      files: [],
      records: []
    };

    (workflow as any).comparePool = [first, second];
    (workflow as any).buildComparisonEntries = vi.fn(() => comparisonEntries);
    mockExporter.export.mockResolvedValue(artifact);

    const result = await handleShortlistCommand(
      { type: "export", exportTarget: "pool", exportFormat: "md" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect((workflow as any).ensureProfiles).toHaveBeenCalledWith(
      [first, second],
      BASE_CONDITIONS,
      "正在准备对比池导出..."
    );
    expect(mockExporter.export).toHaveBeenCalledWith(expect.objectContaining({
      target: "pool",
      format: "md",
      querySummary: "杭州 python"
    }));
    const exportRequest = mockExporter.export.mock.calls[0]?.[0];
    expect(exportRequest.records[0]).toMatchObject({
      shortlistIndex: 1,
      source: "Bonjour",
      whyMatched: "地点命中：杭州；技术命中：python；相关证据：Built Hangzhou automation stack",
      decisionTag: "优先深看",
      recommendation: "建议优先打开：地点完全匹配，资料也较新",
      nextStep: "返回 shortlist 后先执行 v 1，再用 o 1 打开 Bonjour"
    });
    expect(mockTui.displayExportSuccess).toHaveBeenCalledWith(artifact);
    expect(result.type).toBe("continue");
  });
});

describe("classifyMatchStrength", () => {
  it("marks multi-signal substantive matches as strong", () => {
    expect(
      classifyMatchStrength(0.78, ["技术命中：python", "相关证据：维护自动化工具链"])
    ).toBe("strong");
  });

  it("marks location-only matches as weak", () => {
    expect(classifyMatchStrength(0.31, ["地点命中：杭州"])).toBe("weak");
  });

  it("marks single substantive matches as medium when score is modest", () => {
    expect(classifyMatchStrength(0.48, ["技术命中：python"])).toBe("medium");
  });
});

describe("buildResultWarning", () => {
  it("warns when no strong matches are present", () => {
    expect(buildResultWarning([{ matchStrength: "medium" }, { matchStrength: "weak" }])).toContain(
      "没有找到强匹配"
    );
  });

  it("uses explicit weak-result wording when all results are weak", () => {
    expect(buildResultWarning([{ matchStrength: "weak" }, { matchStrength: "weak" }])).toContain(
      "只找到了弱相关候选人"
    );
  });
});

describe("buildQueryMatchExplanation", () => {
  it("keeps a short summary while preserving full reasons", () => {
    const explanation = buildQueryMatchExplanation(
      {
        primaryName: "Ada",
        primaryHeadline: "Senior Backend Engineer",
        primaryLocation: "杭州",
        summary: "长期做推理和自动化系统"
      },
      {
        docText: "Senior backend engineer working on python cuda inference systems",
        facetRole: ["backend"],
        facetTags: ["python", "cuda"],
        facetLocation: ["杭州"]
      },
      [
        {
          title: "CUDA inference stack",
          description: "Built python inference tooling",
          evidenceType: "project"
        }
      ],
      {
        skills: ["python", "cuda"],
        locations: ["杭州"],
        experience: "senior",
        role: "backend",
        sourceBias: "github",
        mustHave: ["cuda", "inference"],
        niceToHave: [],
        exclude: [],
        preferFresh: true,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        score: 0.82,
        retrievalReasons: [
          "skill evidence: python",
          "must-have matched: inference",
          "project: CUDA inference stack",
          "strong semantic similarity",
          "strong keyword overlap"
        ],
        sources: ["GitHub"],
        referenceDate: new Date("2026-03-30T00:00:00.000Z"),
        experienceMatched: true
      }
    );

    expect(explanation.summary).toBe("地点命中：杭州，角色贴合：backend");
    expect(explanation.reasons.length).toBeGreaterThan(5);
    expect(explanation.reasons).toContain("检索技能命中：python");
    expect(explanation.reasons).toContain("语义相似度高");
    expect(explanation.reasons).toContain("关键词重合度高");
  });
});

describe("buildCandidateSourceMetadata", () => {
  it("merges identity sources and promotes github, website, and project links", () => {
    const metadata = buildCandidateSourceMetadata(
      [
        { sourceProfileId: "sp-bonjour" },
        { sourceProfileId: "sp-github" },
        { sourceProfileId: "sp-web" }
      ] as any,
      new Map([
        ["sp-bonjour", { source: "bonjour", canonicalUrl: "https://bonjour.bio/ada" }],
        ["sp-github", { source: "github", canonicalUrl: "https://github.com/ada" }],
        ["sp-web", { source: "web", canonicalUrl: "https://ada.dev" }]
      ]),
      [
        {
          evidenceType: "project",
          title: "Inference Platform",
          description: "Production inference service",
          url: "https://ada.dev/projects/inference",
          occurredAt: new Date("2026-03-29T00:00:00.000Z")
        }
      ] as any,
      ["bonjour"]
    );

    expect(metadata.sources).toEqual(["Bonjour", "GitHub", "Web"]);
    expect(metadata.bonjourUrl).toBe("https://bonjour.bio/ada");
    expect(metadata.primaryLinks).toEqual([
      { type: "bonjour", label: "Bonjour", url: "https://bonjour.bio/ada" },
      { type: "github", label: "GitHub", url: "https://github.com/ada" },
      { type: "website", label: "个人站点", url: "https://ada.dev" },
      { type: "project", label: "作品页：Inference Platform", url: "https://ada.dev/projects/inference" }
    ]);
  });
});

describe("buildConditionAudit", () => {
  it("returns met, unmet, and unknown states together", () => {
    const audit = buildConditionAudit(
      {
        primaryName: "Ada",
        primaryHeadline: "Python Backend Engineer",
        primaryLocation: "杭州",
        summary: "Builds backend systems"
      },
      {
        docText: "Python backend engineer working on serving systems",
        facetRole: ["backend"],
        facetTags: ["python"],
        facetLocation: ["杭州"]
      },
      [
        {
          evidenceType: "project",
          title: "Serving stack",
          description: "Python service platform"
        }
      ],
      {
        skills: ["python", "cuda"],
        locations: ["杭州"],
        experience: undefined,
        role: "backend",
        sourceBias: "github",
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        sources: ["Bonjour"]
      }
    );

    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "地点", status: "met" }),
        expect.objectContaining({ label: "角色", status: "met" }),
        expect.objectContaining({ label: "技能 python", status: "met" }),
        expect.objectContaining({ label: "技能 cuda", status: "unknown" }),
        expect.objectContaining({ label: "来源偏好", status: "unmet" })
      ])
    );
  });
});
