import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiDimensionProfile, SearchConditions } from "../types.js";
import { setConfidenceStatus, setRecommendedCandidate } from "../agent-state.js";
import { buildResultWarning } from "../result-warning.js";
import {
  SearchWorkflow,
  buildConditionAudit,
  buildCandidateSourceMetadata,
  buildQueryMatchExplanation,
  classifyMatchStrength
} from "../workflow.js";
import { RecoveryHandler } from "../recovery-handler.js";
import { ComparisonController } from "../comparison-controller.js";
import { ShortlistController } from "../shortlist-controller.js";
import {
  computeComparisonDecisionScore,
  buildComparisonRecommendation
} from "../agent-tools.js";

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

function stubDimension(score: number, verdict: "strong" | "mixed" | "weak", summary: string) {
  return { score, verdict, summary, evidenceTrace: [] as string[] };
}

function createComparisonEntry(overrides: Record<string, unknown> = {}) {
  return {
    goalFit: stubDimension(70, "mixed", "部分匹配"),
    evidenceStrength: stubDimension(65, "mixed", "证据一般"),
    technicalRelevance: stubDimension(70, "mixed", "技术相关"),
    sourceQualityRecency: stubDimension(65, "mixed", "来源一般"),
    uncertainty: { level: "low" as const, summary: "可控" },
    whySelected: "",
    whyNotSelected: "",
    evidenceTrace: [] as string[],
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
    displayBanner: vi.fn(),
    displayWelcomeTips: vi.fn(),
    displayInitialSearch: vi.fn(),
    displayClarifiedDraft: vi.fn(),
    displayShortlist: vi.fn(),
    resetShortlistViewport: vi.fn(),
    displayNoResults: vi.fn(),
    displayHelp: vi.fn(),
    displayCommandPalette: vi.fn(),
    displayPoolEmpty: vi.fn(),
    displayPool: vi.fn(),
    displayHistory: vi.fn(),
    displayFilters: vi.fn(),
    displayExportEmpty: vi.fn(),
    displayExportSuccess: vi.fn(),
    displayUndo: vi.fn(),
    displayPoolCleared: vi.fn(),
    renderShellHeader: vi.fn(),
    promptCompareAction: vi.fn(),
    promptShortlistAction: vi.fn(),
    promptDetailAction: vi.fn()
  };
  const mockChat = {
    askInitial: vi.fn(),
    askFreeform: vi.fn(),
    extractConditions: vi.fn(),
    reviseConditions: vi.fn(),
    detectMissing: vi.fn(() => [])
  };
  const mockRenderer = {
    renderComparison: vi.fn(() => "COMPARE VIEW"),
    renderProfile: vi.fn(() => "PROFILE"),
    renderWhyMatched: vi.fn(() => "WHY")
  };
  const mockExporter = {
    export: vi.fn()
  };
  const mockSpinner = {
    start: vi.fn(),
    stop: vi.fn(),
    fail: vi.fn()
  };

  (workflow as any).tui = mockTui;
  (workflow as any).chat = mockChat;
  (workflow as any).renderer = mockRenderer;
  (workflow as any).exporter = mockExporter;
  (workflow as any).spinner = mockSpinner;
  (workflow as any).refreshCandidateQueryExplanation = vi.fn();
  (workflow as any).profileManager.ensureProfiles = vi.fn(async () => undefined);
  (workflow as any).formatConditionsAsPrompt = vi.fn(() => "杭州 python");

  // Re-create recoveryHandler so it uses the mock chat/spinner instead of
  // the broken instances created during SearchWorkflow construction with {} deps.
  (workflow as any).recoveryHandler = new RecoveryHandler({
    conditionRevisionService: (workflow as any).conditionRevisionService,
    chat: mockChat,
    spinner: mockSpinner,
    scorer: (workflow as any).scorer,
    getSessionState: () => (workflow as any).sessionState,
    applySessionState: (next: any) => (workflow as any).applySessionState(next),
    setSessionStatus: (status: string, summary?: string | null, why?: any) => (workflow as any).setSessionStatus(status, summary, why),
    appendTranscriptEntry: (role: string, content: string) => (workflow as any).appendTranscriptEntry(role as any, content),
    getSessionId: () => (workflow as any).sessionId
  });

  (workflow as any).comparisonController = new ComparisonController({
    profileManager: (workflow as any).profileManager,
    tools: (workflow as any).tools,
    renderer: mockRenderer as any,
    tui: mockTui as any,
    chat: mockChat as any,
    getSessionState: () => (workflow as any).sessionState,
    applySessionState: (next: any) => (workflow as any).applySessionState(next),
    setSessionStatus: (status: string, summary?: string | null, why?: any) => (workflow as any).setSessionStatus(status, summary, why),
    emitSessionEvent: (type: string, summary: string, data: Record<string, unknown>) => (workflow as any).emitSessionEvent(type, summary, data),
    refreshCandidateQueryExplanation: (candidate: any, conditions: any) => (workflow as any).refreshCandidateQueryExplanation(candidate, conditions),
    decorateComparisonResult: (result: any, conditions: any) => (workflow as any).recoveryHandler.applyBoundaryContextToComparisonResult(result, conditions),
    buildCompareRefinePrompt: (conditions: any) => (workflow as any).recoveryHandler.buildCompareRefinePrompt(conditions)
  });

  // Re-create shortlistController so it uses mock instances.
  (workflow as any).shortlistController = new ShortlistController({
    tui: mockTui as any,
    chat: mockChat as any,
    renderer: mockRenderer as any,
    exporter: mockExporter as any,
    comparisonController: (workflow as any).comparisonController,
    profileManager: (workflow as any).profileManager,
    searchExecutor: (workflow as any).searchExecutor,
    recoveryHandler: (workflow as any).recoveryHandler,
    scorer: (workflow as any).scorer,
    tools: (workflow as any).tools,
    getSessionState: () => (workflow as any).sessionState,
    applySessionState: (next: any) => (workflow as any).applySessionState(next)
  });
  vi.spyOn((workflow as any).shortlistController, "sortCandidates");

  return {
    workflow,
    mockTui,
    mockChat,
    mockRenderer,
    mockExporter,
    mockSpinner,
    runClarifyLoop: (workflow as any).runClarifyLoop.bind(workflow) as (
      initialInput: string
    ) => Promise<SearchConditions | null>,
    runSearchLoop: (workflow as any).runSearchLoop.bind(workflow) as (
      initialConditions: SearchConditions
    ) => Promise<any>,
    handleShortlistCommand: (workflow as any).shortlistController.handleShortlistCommand.bind((workflow as any).shortlistController) as (
      command: any,
      candidates: any[],
      conditions: SearchConditions,
      state: { sortMode: string; visibleCount: number; selectedIndex: number }
    ) => Promise<any>,
    handleSearchRecovery: (workflow as any).recoveryHandler.handleSearchRecovery.bind((workflow as any).recoveryHandler) as (
      candidates: any[],
      conditions: SearchConditions,
      effectiveQuery: string,
      searchDiagnostics?: any
    ) => Promise<any>,
    showCandidateDetail: (workflow as any).shortlistController.showCandidateDetail.bind((workflow as any).shortlistController) as (
      selected: any,
      conditions: SearchConditions
    ) => Promise<any>
  };
}

describe("SearchWorkflow agent policy integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("asks for one freeform clarification when the draft lacks search-ready signals", async () => {
    const { workflow, mockChat, runClarifyLoop } = createWorkflowHarness();

    mockChat.extractConditions.mockResolvedValue({
      skills: [],
      locations: ["杭州"],
      experience: undefined,
      role: undefined,
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false,
      limit: 10
    });
    mockChat.askFreeform.mockResolvedValue("更偏 Python 后端");
    mockChat.reviseConditions.mockResolvedValue({
      ...BASE_CONDITIONS,
      skills: ["python"],
      role: "backend"
    });

    const result = await runClarifyLoop("杭州");

    expect(mockChat.askFreeform).toHaveBeenCalledTimes(1);
    expect(mockChat.reviseConditions).toHaveBeenCalledWith(
      expect.objectContaining({ locations: ["杭州"] }),
      "更偏 Python 后端",
      "edit"
    );
    expect(result).toMatchObject({
      skills: ["python"],
      role: "backend"
    });
  });

  it("marks explicit quit as user_exit termination", async () => {
    const { workflow, mockChat } = createWorkflowHarness();

    mockChat.askInitial = vi.fn().mockResolvedValue("杭州 python backend");
    vi.spyOn(workflow as any, "runClarifyLoop").mockResolvedValue(BASE_CONDITIONS);
    vi.spyOn(workflow as any, "runSearchLoop").mockResolvedValue({ type: "quit" });

    await workflow.execute();

    expect(workflow.getTerminationReason()).toBe("user_exit");
  });

  it("skips extra clarification and searches early when the draft already has role or skill signals", async () => {
    const { mockChat, runClarifyLoop } = createWorkflowHarness();

    mockChat.extractConditions.mockResolvedValue(BASE_CONDITIONS);

    const result = await runClarifyLoop("杭州 python backend");

    expect(mockChat.askFreeform).not.toHaveBeenCalled();
    expect(result).toMatchObject(BASE_CONDITIONS);
  });

  it("auto-enters compare when shortlist already contains 2-3 comparable candidates", async () => {
    const { workflow, runSearchLoop } = createWorkflowHarness();
    const first = createCandidate({ personId: "person-1", matchStrength: "strong" });
    const second = createCandidate({ personId: "person-2", name: "Lin", matchStrength: "medium" });
    const third = createCandidate({ personId: "person-3", name: "Grace", matchStrength: "medium" });
    const compareSpy = vi.spyOn((workflow as any).comparisonController, "presentComparison").mockResolvedValue("back");
    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);

    (workflow as any).tools.searchCandidates = vi.fn(async () => ({
      query: "杭州 python",
      conditions: BASE_CONDITIONS,
      candidates: [first, second, third]
    }));
    (workflow as any).shortlistController.runShortlistLoop = vi.fn(async () => ({ type: "quit" }));

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(compareSpy).toHaveBeenCalledWith(
      [first, second, third],
      [first, second, third],
      BASE_CONDITIONS,
      expect.objectContaining({
        clearProfilesBeforeCompare: false
      })
    );
    expect(result).toEqual({ type: "quit" });
  });

  it("stays in shortlist flow when results are usable but still not compare-ready", async () => {
    const { workflow, runSearchLoop } = createWorkflowHarness();
    const first = createCandidate({ personId: "person-1", matchStrength: "medium" });
    const second = createCandidate({ personId: "person-2", name: "Lin", matchStrength: "weak" });
    const compareSpy = vi.spyOn((workflow as any).comparisonController, "presentComparison").mockResolvedValue("back");
    const shortlistSpy = vi.fn(async () => ({ type: "quit" }));
    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);

    (workflow as any).tools.searchCandidates = vi.fn(async () => ({
      query: "杭州 python",
      conditions: BASE_CONDITIONS,
      candidates: [first, second]
    }));
    (workflow as any).shortlistController.runShortlistLoop = shortlistSpy;

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(compareSpy).not.toHaveBeenCalled();
    expect(shortlistSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ type: "quit" });
  });

  it("asks one targeted recovery clarification before retrying when intent is missing", async () => {
    const { workflow, mockChat, runSearchLoop } = createWorkflowHarness();
    const weakCandidate = createCandidate({
      personId: "person-1",
      matchStrength: "weak",
      matchScore: 0.31,
      queryReasons: ["地点命中：杭州"]
    });
    const strongCandidate = createCandidate({
      personId: "person-2",
      matchStrength: "strong",
      matchScore: 0.86,
      queryReasons: ["角色贴合：backend", "技术命中：python"]
    });
    const shortlistSpy = vi.fn(async () => ({ type: "quit" }));

    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi
      .fn()
      .mockResolvedValueOnce({
        query: "杭州",
        conditions: {
          ...BASE_CONDITIONS,
          role: undefined,
          skills: [],
          mustHave: []
        },
        candidates: [weakCandidate]
      })
      .mockResolvedValueOnce({
        query: "杭州 python backend",
        conditions: BASE_CONDITIONS,
        candidates: [strongCandidate]
      });
    (workflow as any).shortlistController.runShortlistLoop = shortlistSpy;
    mockChat.askFreeform.mockResolvedValue("更偏 Python 后端");
    mockChat.reviseConditions.mockResolvedValue(BASE_CONDITIONS);

    const result = await runSearchLoop({
      ...BASE_CONDITIONS,
      role: undefined,
      skills: [],
      mustHave: []
    });

    expect(mockChat.askFreeform).toHaveBeenCalledTimes(1);
    expect((workflow as any).tools.searchCandidates).toHaveBeenCalledTimes(2);
    expect(shortlistSpy).toHaveBeenCalledWith(
      [strongCandidate],
      BASE_CONDITIONS,
      "overall",
      expect.objectContaining({ lowConfidence: false })
    );
    expect(result).toEqual({ type: "quit" });
  });

  it("rewrites once and then emits a low-confidence shortlist when retrieval stays weak", async () => {
    const { workflow, mockChat, runSearchLoop } = createWorkflowHarness();
    const weakFirst = createCandidate({
      personId: "person-1",
      matchStrength: "weak",
      matchScore: 0.28,
      queryReasons: ["地点命中：杭州"]
    });
    const weakSecond = createCandidate({
      personId: "person-2",
      matchStrength: "weak",
      matchScore: 0.34,
      queryReasons: ["地点命中：杭州"]
    });
    const shortlistSpy = vi.fn(async () => ({ type: "quit" }));

    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi
      .fn()
      .mockResolvedValueOnce({
        query: "杭州 python backend",
        conditions: BASE_CONDITIONS,
        candidates: [weakFirst]
      })
      .mockResolvedValueOnce({
        query: "杭州 python backend rewrite",
        conditions: {
          ...BASE_CONDITIONS,
          mustHave: ["python backend"]
        },
        candidates: [weakSecond]
      });
    (workflow as any).shortlistController.runShortlistLoop = shortlistSpy;
    mockChat.reviseConditions.mockResolvedValue({
      ...BASE_CONDITIONS,
      mustHave: ["python backend"]
    });

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(mockChat.reviseConditions).toHaveBeenCalledWith(
      BASE_CONDITIONS,
      expect.stringContaining("不要改变用户显式 must-have"),
      "tighten",
      expect.any(Object)
    );
    expect(shortlistSpy).toHaveBeenCalledWith(
      [weakSecond],
      expect.objectContaining({ mustHave: ["python backend"] }),
      "overall",
      expect.objectContaining({
        lowConfidence: true,
        resultWarning: expect.stringContaining("低置信 shortlist")
      })
    );
    expect(result).toEqual({ type: "quit" });
  });

  it("surfaces query-too-broad as a boundary hint during rewrite recovery", async () => {
    const { workflow, mockChat, handleSearchRecovery } = createWorkflowHarness();
    const metAudit = [{ label: "Python", status: "met", detail: "命中技能" }] as const;

    (workflow as any).setSessionStatus("searching", "准备执行 recovery。");
    mockChat.reviseConditions.mockResolvedValue({
      ...BASE_CONDITIONS,
      mustHave: ["python backend"]
    });

    const result = await handleSearchRecovery(
      [
        createCandidate({
          personId: "person-1",
          matchStrength: "weak",
          matchScore: 0.56,
          queryReasons: ["命中 python", "命中 backend"],
          conditionAudit: [...metAudit]
        }),
        createCandidate({
          personId: "person-2",
          name: "Lin",
          matchStrength: "weak",
          matchScore: 0.55,
          queryReasons: ["命中 python", "命中 backend"],
          conditionAudit: [...metAudit]
        }),
        createCandidate({
          personId: "person-3",
          name: "Grace",
          matchStrength: "weak",
          matchScore: 0.53,
          queryReasons: ["命中 python", "命中 backend"],
          conditionAudit: [...metAudit],
          sources: ["GitHub"]
        })
      ],
      BASE_CONDITIONS,
      "杭州 python backend"
    );

    expect(result.type).toBe("retry");
    expect(workflow.getSessionSnapshot().openUncertainties[0]).toContain("搜索条件偏宽");
  });

  it("surfaces source-coverage-gap when recovery can no longer rewrite", async () => {
    const { workflow, handleSearchRecovery } = createWorkflowHarness();
    (workflow as any).setSessionStatus("searching", "准备执行 recovery。");
    (workflow as any).sessionState = {
      ...(workflow as any).sessionState,
      recoveryState: {
        ...(workflow as any).sessionState.recoveryState,
        rewriteCount: 1
      }
    };
    const searchDiagnostics = {
      filterDropoff: {
        status: "available",
        dominantFilter: "unknown",
        dropoffByFilter: {}
      },
      sourceCounterfactual: {
        status: "available",
        restrictedSource: "bonjour",
        unrestrictedRetrievedCount: 0
      }
    };

    const result = await handleSearchRecovery([], BASE_CONDITIONS, "杭州 python backend", searchDiagnostics);

    expect(result).toEqual({ type: "stop" });
    expect(workflow.getSessionSnapshot().openUncertainties[0]).toContain("当前库里可能没有完全匹配的人");
  });

  it("preserves boundary uncertainty and uses a tailored refine prompt after stop", async () => {
    const { workflow, mockChat, runSearchLoop } = createWorkflowHarness();
    const boundaryHint = "当前库里可能没有完全匹配的人，这不一定是搜索条件的问题。";

    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi.fn(async () => ({
      query: "杭州 python backend",
      conditions: BASE_CONDITIONS,
      candidates: []
    }));
    (workflow as any).recoveryHandler.handleSearchRecovery = vi.fn(async () => {
      (workflow as any).sessionState = {
        ...(workflow as any).sessionState,
        recoveryState: {
          ...(workflow as any).sessionState.recoveryState,
          boundaryDiagnosticCode: "source_coverage_gap"
        },
        openUncertainties: [boundaryHint]
      };
      return { type: "stop" as const };
    });
    mockChat.askFreeform.mockResolvedValue(undefined);

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("当前库里可能没有完全匹配的人")
    );
    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("放宽地点 / 去掉 must-have")
    );
    expect(workflow.getSessionSnapshot().openUncertainties[0]).toContain("当前库里可能没有完全匹配的人");
    expect(result).toEqual({ type: "restart" });
  });

  it("restarts when stop recovery receives no user input", async () => {
    const { workflow, mockChat, runSearchLoop } = createWorkflowHarness();

    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi.fn(async () => ({
      query: "obscure tech stack",
      conditions: BASE_CONDITIONS,
      candidates: []
    }));
    (workflow as any).recoveryHandler.handleSearchRecovery = vi.fn(async () => {
      (workflow as any).sessionState = {
        ...(workflow as any).sessionState,
        recoveryState: {
          ...(workflow as any).sessionState.recoveryState,
          boundaryDiagnosticCode: undefined
        },
        openUncertainties: ["这轮没有找到足够合适的候选人。"]
      };
      return { type: "stop" as const };
    });
    mockChat.askFreeform.mockResolvedValue(undefined);

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(result).toEqual({ type: "restart" });
    expect(mockChat.askFreeform).toHaveBeenCalledTimes(1);
  });

  it("uses boundary diagnostic code (not uncertainty text) to drive refine prompt after stop", async () => {
    const { workflow, mockChat, runSearchLoop } = createWorkflowHarness();

    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi.fn(async () => ({
      query: "python backend",
      conditions: BASE_CONDITIONS,
      candidates: []
    }));
    (workflow as any).recoveryHandler.handleSearchRecovery = vi.fn(async () => {
      (workflow as any).sessionState = {
        ...(workflow as any).sessionState,
        recoveryState: {
          ...(workflow as any).sessionState.recoveryState,
          boundaryDiagnosticCode: "query_too_broad"
        },
        openUncertainties: ["其他原因，和搜索条件无关。"]
      };
      return { type: "stop" as const };
    });
    mockChat.askFreeform.mockResolvedValue(undefined);

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("搜索条件偏宽")
    );
    expect(mockChat.askFreeform).not.toHaveBeenCalledWith(
      expect.stringContaining("其他原因")
    );
    expect(result).toEqual({ type: "restart" });
  });
});

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

  it("shows the slash command palette alongside shortlist help", async () => {
    const { handleShortlistCommand, mockTui } = createWorkflowHarness();

    const result = await handleShortlistCommand(
      { type: "help" },
      [createCandidate()],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect(mockTui.resetShortlistViewport).toHaveBeenCalledTimes(1);
    expect(mockTui.displayHelp).toHaveBeenCalledTimes(1);
    expect(mockTui.displayCommandPalette).toHaveBeenCalledWith("shortlist");
    expect(result.type).toBe("continue");
  });

  it("uses a boundary-aware refine prompt for low-confidence shortlist", async () => {
    const { workflow, handleShortlistCommand, mockChat } = createWorkflowHarness();
    const candidates = [createCandidate()];
    (workflow as any).sessionState = {
      ...(workflow as any).sessionState,
      recoveryState: {
        ...(workflow as any).sessionState.recoveryState,
        phase: "low_confidence_shortlist",
        boundaryDiagnosticCode: "source_coverage_gap"
      },
      openUncertainties: [
        "当前库里可能没有完全匹配的人，这不一定是搜索条件的问题。"
      ]
    };
    mockChat.askFreeform.mockResolvedValue("放宽地点");

    const result = await handleShortlistCommand(
      { type: "refine" },
      candidates,
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 1, selectedIndex: 0 }
    );

    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("当前库里可能没有完全匹配的人")
    );
    expect(result).toEqual({
      type: "done",
      result: {
        type: "refine",
        prompt: "放宽地点"
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

    expect((workflow as any).shortlistController.sortCandidates).toHaveBeenCalledWith(
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
      expect((workflow as any).profileManager.shouldPreloadProfiles()).toBe(false);
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
      createComparisonEntry({
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
      }),
      createComparisonEntry({
        shortlistIndex: 2,
        candidate: second,
        profile: second.profile,
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 84,
        recommendation: "建议继续对照：信息还需要补充判断",
        nextStep: "返回 shortlist 后执行 v 2 补充判断"
      })
    ];
    const comparisonResult = {
      entries: comparisonEntries,
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "当前还不足以形成有效对比，先补齐 2-3 位候选人再判断。",
        rationale: "候选集不足，compare 还不具备决策意义。",
        largestUncertainty: "当前 compare set 不完整。",
        suggestedRefinement: "先补一位更接近目标的候选人进入 compare。"
      }
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).comparePool = [first, second];
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: comparisonEntries,
      result: comparisonResult
    }));
    mockTui.promptCompareAction.mockResolvedValue("back");

    const result = await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect((workflow as any).profileManager.ensureProfiles).toHaveBeenCalledWith(
      [first, second],
      BASE_CONDITIONS,
      "正在准备候选人对比..."
    );
    expect((workflow as any).tools.prepareComparison).toHaveBeenCalledWith({
      targets: [first, second],
      allCandidates: [first, second]
    });
    expect(mockRenderer.renderComparison).toHaveBeenCalledWith(comparisonResult, BASE_CONDITIONS);
    expect(mockTui.promptCompareAction).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("COMPARE VIEW");
    expect((workflow as any).sessionState.confidenceStatus.level).toBe("low");
    expect((workflow as any).sessionState.recommendedCandidate).toBeNull();
    expect((workflow as any).sessionState.openUncertainties).toEqual([
      "当前 compare set 不完整。"
    ]);
    expect(result.type).toBe("continue");
  });

  it("supports slash back command inside compare view", async () => {
    const { workflow, handleShortlistCommand, mockTui } = createWorkflowHarness();
    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Lin"
    });

    (workflow as any).comparePool = [first, second];
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: [
        createComparisonEntry({ shortlistIndex: 1, candidate: first, profile: first.profile }),
        createComparisonEntry({ shortlistIndex: 2, candidate: second, profile: second.profile })
      ]
    }));
    mockTui.promptCompareAction.mockResolvedValue({
      type: "stage",
      command: "back",
      args: ""
    });

    const result = await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect(result.type).toBe("continue");
  });

  it("returns a refine outcome directly from compare view", async () => {
    const { workflow, handleShortlistCommand, mockTui, mockChat } = createWorkflowHarness();
    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Lin",
      sources: ["GitHub"]
    });
    const comparisonResult = {
      entries: [
        createComparisonEntry({
          shortlistIndex: 1,
          candidate: first,
          profile: first.profile,
          topEvidence: [],
          decisionTag: "继续比较",
          decisionScore: 84,
          recommendation: "还需要更多证据判断",
          nextStep: "回到 shortlist 继续 refine"
        }),
        createComparisonEntry({
          shortlistIndex: 2,
          candidate: second,
          profile: second.profile,
          topEvidence: [],
          decisionTag: "继续比较",
          decisionScore: 83,
          recommendation: "还需要更多证据判断",
          nextStep: "回到 shortlist 继续 refine"
        })
      ],
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "我还没有足够证据推荐单一候选人。",
        rationale: "当前 compare 结果缺少结构化 outcome。",
        largestUncertainty: "compare outcome 缺失。",
        suggestedRefinement: "先补一位更接近目标的候选人进入 compare。"
      }
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).comparePool = [first, second];
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: comparisonResult.entries,
      result: comparisonResult
    }));
    mockTui.promptCompareAction.mockResolvedValue("refine");
    mockChat.askFreeform.mockResolvedValue("补一位 infra backend");

    const result = await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("先补一位更接近目标的候选人进入 compare")
    );
    expect(result).toEqual({
      type: "done",
      result: {
        type: "refine",
        prompt: "补一位 infra backend"
      }
    });
    logSpy.mockRestore();
  });

  it("uses a candidate-scoped boundary prompt in detail refine mode", async () => {
    const { workflow, showCandidateDetail, mockChat, mockTui, mockRenderer } = createWorkflowHarness();
    const candidate = createCandidate({ name: "Ada" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).sessionState = {
      ...(workflow as any).sessionState,
      recoveryState: {
        ...(workflow as any).sessionState.recoveryState,
        phase: "low_confidence_shortlist",
        boundaryDiagnosticCode: "query_too_broad"
      },
      openUncertainties: [
        "搜索条件偏宽，候选人分数没有拉开。补一个更具体的角色或技能会更有帮助。"
      ]
    };
    (workflow as any).profileManager.loadProfileForCandidate = vi.fn(async () => candidate.profile);
    mockTui.promptDetailAction
      .mockResolvedValueOnce("refine");
    mockChat.askFreeform.mockResolvedValue("更偏 infra backend");

    const result = await showCandidateDetail(candidate, BASE_CONDITIONS);

    expect(mockRenderer.renderProfile).toHaveBeenCalled();
    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("想基于 Ada 继续收敛？")
    );
    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("搜索条件偏宽")
    );
    expect(result).toEqual({
      type: "refine",
      prompt: "更偏 infra backend"
    });
    logSpy.mockRestore();
  });

  it("supports slash why command inside detail view", async () => {
    const { workflow, showCandidateDetail, mockTui, mockRenderer } = createWorkflowHarness();
    const candidate = createCandidate({ name: "Ada" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).profileManager.loadProfileForCandidate = vi.fn(async () => candidate.profile);
    mockTui.promptDetailAction
      .mockResolvedValueOnce({ type: "stage", command: "why", args: "" })
      .mockResolvedValueOnce({ type: "stage", command: "back", args: "" });

    const result = await showCandidateDetail(candidate, BASE_CONDITIONS);

    expect(mockRenderer.renderWhyMatched).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ type: "back" });
    logSpy.mockRestore();
  });

  it("clears any stale recommendation and stays in low-confidence compare mode until evidence is assessed", async () => {
    const { workflow, handleShortlistCommand, mockRenderer, mockTui } = createWorkflowHarness();
    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Grace",
      bonjourUrl: undefined,
      sources: ["GitHub"]
    });
    const comparisonEntries = [
      createComparisonEntry({
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
        decisionScore: 93,
        recommendation: "建议优先打开：地点完全匹配，项目证据更扎实",
        nextStep: "返回 shortlist 后先执行 v 1，再用 o 1 打开 Bonjour"
      }),
      createComparisonEntry({
        shortlistIndex: 2,
        candidate: second,
        profile: second.profile,
        topEvidence: [
          {
            evidenceType: "repository",
            title: "graph-rag",
            sourceLabel: "GitHub",
            freshnessLabel: "3天前"
          }
        ],
        decisionTag: "继续比较",
        decisionScore: 84,
        recommendation: "建议继续对照：还需要更多证据判断",
        nextStep: "返回 shortlist 后执行 v 2 补充判断"
      })
    ];
    const comparisonResult = {
      entries: comparisonEntries,
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "我还没有足够证据推荐单一候选人。",
        rationale: "当前 compare 结果缺少结构化 outcome。",
        largestUncertainty: "compare outcome 缺失。"
        ,
        suggestedRefinement: "先补一位更接近目标的候选人进入 compare。"
      }
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).comparePool = [first, second];
    (workflow as any).sessionState = setConfidenceStatus((workflow as any).sessionState, {
      level: "medium",
      rationale: "previous review claimed enough evidence",
      updatedAt: new Date("2026-03-30T12:00:00.000Z")
    });
    (workflow as any).sessionState = setRecommendedCandidate((workflow as any).sessionState, first, {
      rationale: "stale recommendation before recomparing"
    }).state;
    expect((workflow as any).sessionState.recommendedCandidate?.candidate.personId).toBe("person-1");

    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: comparisonEntries,
      result: comparisonResult
    }));
    mockTui.promptCompareAction.mockResolvedValue("back");

    const result = await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect((workflow as any).tools.prepareComparison).toHaveBeenCalledWith({
      targets: [first, second],
      allCandidates: [first, second]
    });
    expect(mockRenderer.renderComparison).toHaveBeenCalledWith(comparisonResult, BASE_CONDITIONS);
    expect(logSpy).toHaveBeenCalledWith("COMPARE VIEW");
    expect((workflow as any).sessionState.confidenceStatus.level).toBe("low");
    expect((workflow as any).sessionState.recommendedCandidate).toBeNull();
    expect((workflow as any).sessionState.openUncertainties).toEqual([
      "compare outcome 缺失。"
    ]);
    expect(result.type).toBe("continue");
  });

  it("preserves boundary hints in compare no-recommendation output", async () => {
    const { workflow, handleShortlistCommand, mockRenderer, mockTui } = createWorkflowHarness();
    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Grace",
      bonjourUrl: undefined,
      sources: ["GitHub"]
    });
    const comparisonEntries = [
      createComparisonEntry({
        shortlistIndex: 1,
        candidate: first,
        profile: first.profile,
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 83,
        recommendation: "还需要更多证据判断",
        nextStep: "回到 shortlist 继续 refine"
      }),
      createComparisonEntry({
        shortlistIndex: 2,
        candidate: second,
        profile: second.profile,
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 82,
        recommendation: "还需要更多证据判断",
        nextStep: "回到 shortlist 继续 refine"
      })
    ];
    const comparisonResult = {
      entries: comparisonEntries,
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "我还没有足够证据推荐单一候选人。",
        rationale: "当前 compare 结果缺少结构化 outcome。",
        largestUncertainty: "compare outcome 缺失。"
      }
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).comparePool = [first, second];
    (workflow as any).sessionState = {
      ...(workflow as any).sessionState,
      recoveryState: {
        ...(workflow as any).sessionState.recoveryState,
        phase: "low_confidence_shortlist",
        boundaryDiagnosticCode: "query_too_broad"
      },
      openUncertainties: [
        "搜索条件偏宽，候选人分数没有拉开。补一个更具体的角色或技能会更有帮助。"
      ]
    };
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: comparisonEntries,
      result: comparisonResult
    }));
    mockTui.promptCompareAction.mockResolvedValue("back");

    const result = await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect(mockRenderer.renderComparison).toHaveBeenCalledTimes(1);
    const firstRenderCall = mockRenderer.renderComparison.mock.calls.at(0);
    if (!firstRenderCall) {
      throw new Error("expected renderComparison to be called");
    }
    const renderedComparison = (firstRenderCall as unknown[])[0] as any;
    expect(renderedComparison.outcome.largestUncertainty).toContain("搜索条件偏宽");
    expect(renderedComparison.outcome.suggestedRefinement).toContain("搜索条件偏宽");
    expect((workflow as any).sessionState.openUncertainties[0]).toContain("搜索条件偏宽");
    expect(result.type).toBe("continue");
    logSpy.mockRestore();
  });

  it("reruns search immediately when auto-compare chooses refine", async () => {
    const { workflow, runSearchLoop, mockChat, mockTui } = createWorkflowHarness();
    const first = createCandidate({ personId: "person-1", matchStrength: "strong" });
    const second = createCandidate({ personId: "person-2", name: "Lin", matchStrength: "medium", sources: ["GitHub"] });
    const refinedCandidate = createCandidate({ personId: "person-3", name: "Grace", matchStrength: "medium" });

    (workflow as any).profileManager.shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi
      .fn()
      .mockResolvedValueOnce({
        query: "杭州 python backend",
        conditions: BASE_CONDITIONS,
        candidates: [first, second]
      })
      .mockResolvedValueOnce({
        query: "杭州 infra backend",
        conditions: {
          ...BASE_CONDITIONS,
          mustHave: ["infra backend"]
        },
        candidates: [refinedCandidate]
      });
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: [],
      result: {
        entries: [],
        outcome: {
          confidence: "low-confidence" as const,
          recommendationMode: "no-recommendation" as const,
          recommendation: "我还没有足够证据推荐单一候选人。",
          rationale: "需要更聚焦的检索条件。",
          largestUncertainty: "当前 compare 还不够稳。",
          suggestedRefinement: "先把角色收敛到 infra backend 再重试。"
        }
      }
    }));
    mockTui.promptCompareAction.mockResolvedValue("refine");
    mockChat.askFreeform.mockResolvedValue("更偏 infra backend");
    mockChat.reviseConditions.mockResolvedValue({
      ...BASE_CONDITIONS,
      mustHave: ["infra backend"]
    });
    (workflow as any).shortlistController.runShortlistLoop = vi.fn(async () => ({ type: "quit" }));

    const result = await runSearchLoop(BASE_CONDITIONS);

    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("先把角色收敛到 infra backend 再重试")
    );
    expect(mockChat.reviseConditions).toHaveBeenCalledWith(
      BASE_CONDITIONS,
      "更偏 infra backend",
      "edit",
      expect.any(Object)
    );
    expect((workflow as any).tools.searchCandidates).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ type: "quit" });
  });

  it("reuses compare suggested refinement for shortlist refine after compare", async () => {
    const { workflow, handleShortlistCommand, mockRenderer, mockTui, mockChat } = createWorkflowHarness();
    const first = createCandidate();
    const second = createCandidate({
      personId: "person-2",
      name: "Grace",
      sources: ["GitHub"]
    });
    const comparisonResult = {
      entries: [
        createComparisonEntry({
          shortlistIndex: 1,
          candidate: first,
          profile: first.profile,
          topEvidence: [],
          decisionTag: "继续比较",
          decisionScore: 83,
          recommendation: "还需要更多证据判断",
          nextStep: "回到 shortlist 继续 refine"
        }),
        createComparisonEntry({
          shortlistIndex: 2,
          candidate: second,
          profile: second.profile,
          topEvidence: [],
          decisionTag: "继续比较",
          decisionScore: 82,
          recommendation: "还需要更多证据判断",
          nextStep: "回到 shortlist 继续 refine"
        })
      ],
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "我还没有足够证据推荐单一候选人。",
        rationale: "当前 compare 结果缺少结构化 outcome。",
        largestUncertainty: "compare outcome 缺失。",
        suggestedRefinement: "先补一位更接近目标的候选人进入 compare。"
      }
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    (workflow as any).comparePool = [first, second];
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: comparisonResult.entries,
      result: comparisonResult
    }));
    mockTui.promptCompareAction.mockResolvedValue("back");
    mockChat.askFreeform.mockResolvedValue("补一位更接近目标的候选人");

    await handleShortlistCommand(
      { type: "compare" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    const refineResult = await handleShortlistCommand(
      { type: "refine" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect(mockChat.askFreeform).toHaveBeenCalledWith(
      expect.stringContaining("先补一位更接近目标的候选人进入 compare")
    );
    expect(refineResult).toEqual({
      type: "done",
      result: {
        type: "refine",
        prompt: "补一位更接近目标的候选人"
      }
    });
    logSpy.mockRestore();
  });

  it("does not relax source filtering after an empty retrieval", async () => {
    const workflow = new SearchWorkflow({} as any, {
      embed: vi.fn(async () => ({ embedding: [0.1, 0.2, 0.3] }))
    } as any);
    const retrieve = vi.fn(async () => []);
    const fallbackSearch = vi.fn(async () => ({ candidates: [], diagnostics: undefined }));

    (workflow as any).planner = {
      parse: vi.fn(async () => ({
        rawQuery: "github python",
        roles: [],
        skills: ["python"],
        locations: [],
        mustHaves: [],
        niceToHaves: [],
        sourceBias: "github"
      }))
    };
    (workflow as any).retriever = {
      retrieve
    };
    (workflow as any).searchExecutor.deps.retriever = { retrieve };
    (workflow as any).searchExecutor.deps.planner = {
      parse: vi.fn(async () => ({
        rawQuery: "github python",
        roles: [],
        skills: ["python"],
        locations: [],
        mustHaves: [],
        niceToHaves: [],
        sourceBias: "github"
      }))
    };
    (workflow as any).searchExecutor.performFallbackSearch = fallbackSearch;
    (workflow as any).searchExecutor.mergeIntentWithConditions = vi.fn((intent: any) => intent);

    const result = await (workflow as any).performSearch("github python", {
      ...BASE_CONDITIONS,
      sourceBias: "github"
    });

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBias: "github" }),
      expect.objectContaining({ embedding: [0.1, 0.2, 0.3] })
    );
    expect(fallbackSearch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBias: "github" }),
      expect.anything()
    );
    expect(result.candidates).toEqual([]);
  });

  it("aborts in-flight embedding when workflow is interrupted", async () => {
    const workflow = new SearchWorkflow({} as any, {
      embed: vi.fn(async (_text: string, options?: { signal?: AbortSignal }) => {
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return await new Promise((resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        });
      })
    } as any);

    (workflow as any).executionAbortController = new AbortController();
    (workflow as any).searchExecutor.deps.planner = {
      parse: vi.fn(async () => ({
        rawQuery: "python 杭州",
        roles: [],
        skills: ["python"],
        locations: ["杭州"],
        mustHaves: [],
        niceToHaves: []
      }))
    };
    (workflow as any).searchExecutor.deps.retriever = {
      retrieve: vi.fn(async () => [])
    };
    (workflow as any).searchExecutor.mergeIntentWithConditions = vi.fn((intent: any) => intent);

    const execution = (workflow as any).performSearch("python 杭州", BASE_CONDITIONS);
    await Promise.resolve();
    workflow.interrupt("interrupted");

    await expect(execution).rejects.toThrow("Workflow interrupted.");
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
      createComparisonEntry({
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
      }),
      createComparisonEntry({
        shortlistIndex: 2,
        candidate: second,
        profile: second.profile,
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 84,
        recommendation: "建议继续对照：信息还需要补充判断",
        nextStep: "返回 shortlist 后执行 v 2 补充判断"
      })
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
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: comparisonEntries
    }));
    mockExporter.export.mockResolvedValue(artifact);

    const result = await handleShortlistCommand(
      { type: "export", exportTarget: "pool", exportFormat: "md" },
      [first, second],
      BASE_CONDITIONS,
      { sortMode: "overall", visibleCount: 2, selectedIndex: 0 }
    );

    expect((workflow as any).profileManager.ensureProfiles).toHaveBeenCalledWith(
      [first, second],
      BASE_CONDITIONS,
      "正在准备对比池导出..."
    );
    expect(mockExporter.export).toHaveBeenCalledWith(expect.objectContaining({
      target: "pool",
      format: "md",
      querySummary: "角色 backend，技术栈 python，地点 杭州，来源 bonjour，偏好最近活跃"
    }));
    expect((workflow as any).tools.prepareComparison).toHaveBeenCalledWith({
      targets: [first, second],
      allCandidates: [first, second]
    });
    const exportRequest = mockExporter.export.mock.calls[0]?.[0];
    expect(exportRequest.records[0]).toMatchObject({
      shortlistIndex: 1,
      source: "Bonjour",
      whyMatched: "地点命中：杭州；角色贴合：backend；技术命中：python；来源过滤命中：Bonjour；近期活跃：2天前；相关证据：Built Hangzhou automation stack",
      decisionTag: "优先深看",
      recommendation: "建议优先打开：地点完全匹配，资料也较新",
      nextStep: "返回 shortlist 后先执行 v 1，再用 o 1 打开 Bonjour"
    });
    expect(exportRequest.records[0].topEvidence).toEqual([
      {
        evidenceType: "project",
        title: "Built Hangzhou automation stack",
        sourceLabel: "Bonjour",
        freshnessLabel: "2天前"
      }
    ]);
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

  it('does not match ASCII terms inside unrelated words like "FAIL"', () => {
    const explanation = buildQueryMatchExplanation(
      {
        primaryName: "Ada",
        primaryHeadline: "FAIL pipeline maintainer",
        primaryLocation: "杭州",
        summary: "Maintains failover systems"
      },
      {
        docText: "Keeps FAIL-safe backend services reliable",
        facetRole: ["backend"],
        facetTags: ["reliability"],
        facetLocation: ["杭州"]
      },
      [],
      {
        skills: ["AI"],
        locations: [],
        experience: undefined,
        role: undefined,
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        score: 0.32
      }
    );

    expect(explanation.reasons).not.toContain("技术命中：AI");
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

describe("compare source visibility", () => {
  it("lets a stronger github/web candidate outrank a bonjour-only candidate without hardcoded bonuses", () => {
    const bonjourProfile = createProfile({
      dimensions: {
        techMatch: 79,
        locationMatch: 70,
        careerStability: 68,
        projectDepth: 69,
        academicImpact: 35,
        communityReputation: 40
      },
      overallScore: 76
    });
    const githubProfile = createProfile({
      dimensions: {
        techMatch: 80,
        locationMatch: 70,
        careerStability: 68,
        projectDepth: 70,
        academicImpact: 35,
        communityReputation: 40
      },
      overallScore: 77
    });

    const bonjourCandidate = { ...createCandidate({
      matchScore: 0.69,
      sources: ["Bonjour"],
      bonjourUrl: "https://bonjour.bio/ada",
      lastSyncedAt: undefined,
      latestEvidenceAt: undefined
    }), profile: bonjourProfile };
    const githubCandidate = { ...createCandidate({
      personId: "person-2",
      name: "Lin",
      matchScore: 0.7,
      sources: ["GitHub", "Web"],
      bonjourUrl: undefined,
      lastSyncedAt: undefined,
      latestEvidenceAt: undefined
    }), profile: githubProfile };

    const bonjourScore = computeComparisonDecisionScore(bonjourCandidate as any);
    const githubScore = computeComparisonDecisionScore(githubCandidate as any);

    expect(githubScore).toBeGreaterThan(bonjourScore);
  });

  it("uses source-neutral fallback recommendation text", () => {
    const candidate = {
      ...createCandidate({
        queryReasons: [],
        matchReason: undefined,
        sources: ["Bonjour"],
        bonjourUrl: "https://bonjour.bio/ada",
        lastSyncedAt: undefined,
        latestEvidenceAt: undefined
      }),
      profile: createProfile({
        dimensions: {
          techMatch: 40,
          locationMatch: 50,
          careerStability: 45,
          projectDepth: 30,
          academicImpact: 20,
          communityReputation: 25
        },
        overallScore: 42
      })
    };
    const okAssessment = { score: 70, verdict: "mixed" as const, summary: "一般", evidenceTrace: [] };
    const recommendation = buildComparisonRecommendation(
      candidate as any,
      "继续比较",
      undefined,
      okAssessment,
      okAssessment,
      okAssessment,
      { level: "low", summary: "可控" }
    );

    expect(recommendation).toContain("建议继续对照");
    expect(recommendation).not.toContain("Bonjour 资料完整");
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
        expect.objectContaining({ label: "来源过滤", status: "unmet" })
      ])
    );
  });

  it('does not mark "AI" as met when the context only contains "FAIL"', () => {
    const audit = buildConditionAudit(
      {
        primaryName: "Ada",
        primaryHeadline: "FAIL pipeline maintainer",
        primaryLocation: "杭州",
        summary: "Maintains failover systems"
      },
      {
        docText: "Keeps FAIL-safe backend services reliable",
        facetRole: ["backend"],
        facetTags: ["reliability"],
        facetLocation: ["杭州"]
      },
      [],
      {
        skills: ["AI"],
        locations: [],
        experience: undefined,
        role: undefined,
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      }
    );

    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "技能 AI", status: "unknown" })
      ])
    );
    expect(audit).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "技能 AI", status: "met" })
      ])
    );
  });
});

describe("search recovery signals", () => {
  it("resolves candidate anchor from current shortlist context before recovery diagnosis", () => {
    const { workflow } = createWorkflowHarness();
    const shortlist = [
      createCandidate({ personId: "person-1", name: "Ada" }),
      createCandidate({ personId: "person-2", name: "Lin" })
    ];

    (workflow as any).sessionState = {
      ...(workflow as any).sessionState,
      currentShortlist: shortlist,
      activeCompareSet: []
    };

    const resolution = (workflow as any).recoveryHandler.resolveAnchorResolution(
      {
        ...BASE_CONDITIONS,
        candidateAnchor: { shortlistIndex: 2, name: "Lin" }
      },
      []
    );

    expect(resolution).toEqual({
      status: "resolved",
      resolvedPersonId: "person-2"
    });
  });

  it("attributes post-retrieval hard-filter dropoff by filter type", () => {
    const { workflow } = createWorkflowHarness();
    const evaluation = (workflow as any).searchExecutor.evaluateSearchStateFilters(
      {
        id: "person-1",
        primaryName: "Ada",
        primaryHeadline: "Backend Engineer",
        primaryLocation: "杭州",
        summary: "做过 python 服务端"
      },
      {
        personId: "person-1",
        facetSource: ["GitHub"],
        facetRole: [],
        facetTags: ["python"],
        facetLocation: ["杭州"],
        docText: "python backend engineer"
      },
      [],
      {
        ...BASE_CONDITIONS,
        mustHave: ["distributed systems"],
        sourceBias: "bonjour"
      }
    );

    const diagnostics = (workflow as any).searchExecutor.buildFilterDropoffDiagnostics({
      must_have: evaluation.failedFilters.filter((item: string) => item === "must_have").length,
      source_bias: evaluation.failedFilters.filter((item: string) => item === "source_bias").length
    });

    expect(evaluation).toEqual({
      matches: false,
      failedFilters: ["must_have", "source_bias"]
    });
    expect(diagnostics).toEqual({
      status: "available",
      dominantFilter: "must_have",
      dropoffByFilter: {
        must_have: 1,
        source_bias: 1
      }
    });
  });
});
