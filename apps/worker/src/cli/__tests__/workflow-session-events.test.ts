import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiDimensionProfile, SearchConditions } from "../types.js";
import { SearchWorkflow } from "../workflow.js";
import { RecoveryHandler } from "../recovery-handler.js";
import { ComparisonController } from "../comparison-controller.js";
import { ShortlistController } from "../shortlist-controller.js";

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
    matchStrength: "strong",
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
    displayInitialSearch: vi.fn(),
    displayClarifiedDraft: vi.fn(),
    resetShortlistViewport: vi.fn(),
    displayShortlist: vi.fn(),
    promptShortlistAction: vi.fn(),
    promptCompareAction: vi.fn(),
    displayNoResults: vi.fn(),
    displayPoolCleared: vi.fn()
  };
  const mockChat = {
    askFreeform: vi.fn(),
    extractConditions: vi.fn(),
    reviseConditions: vi.fn(),
    detectMissing: vi.fn(() => [])
  };
  const mockRenderer = {
    renderComparison: vi.fn(() => "COMPARE VIEW")
  };
  const mockSpinner = {
    start: vi.fn(),
    stop: vi.fn(),
    fail: vi.fn()
  };

  (workflow as any).tui = mockTui;
  (workflow as any).chat = mockChat;
  (workflow as any).renderer = mockRenderer;
  (workflow as any).spinner = mockSpinner;
  (workflow as any).refreshCandidateQueryExplanation = vi.fn();
  (workflow as any).profileManager.ensureProfiles = vi.fn(async () => undefined);

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

  (workflow as any).shortlistController = new ShortlistController({
    tui: mockTui as any,
    chat: mockChat as any,
    renderer: mockRenderer as any,
    exporter: (workflow as any).exporter,
    comparisonController: (workflow as any).comparisonController,
    profileManager: (workflow as any).profileManager,
    searchExecutor: (workflow as any).searchExecutor,
    recoveryHandler: (workflow as any).recoveryHandler,
    scorer: (workflow as any).scorer,
    tools: (workflow as any).tools,
    getSessionState: () => (workflow as any).sessionState,
    applySessionState: (next: any) => (workflow as any).applySessionState(next)
  });

  return {
    workflow,
    mockTui,
    mockChat,
    runClarifyLoop: (workflow as any).runClarifyLoop.bind(workflow) as (
      initialInput: string
    ) => Promise<SearchConditions | null>,
    runSearchLoop: (workflow as any).runSearchLoop.bind(workflow) as (
      initialConditions: SearchConditions
    ) => Promise<any>,
    presentComparison: (workflow as any).comparisonController.presentComparison.bind((workflow as any).comparisonController) as (
      targets: any[],
      allCandidates: any[],
      conditions: SearchConditions,
      options: { clearProfilesBeforeCompare: boolean; loadingMessage: string }
    ) => Promise<any>
  };
}

describe("SearchWorkflow session events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds a snapshot that can reconstruct the current session state after search", async () => {
    const { workflow, mockChat, runClarifyLoop, runSearchLoop } = createWorkflowHarness();
    const first = createCandidate({ personId: "person-1", matchStrength: "medium" });
    const second = createCandidate({ personId: "person-2", name: "Lin", matchStrength: "weak" });

    mockChat.extractConditions.mockResolvedValue(BASE_CONDITIONS);
    await runClarifyLoop("杭州 python backend");

    (workflow as any).shouldPreloadProfiles = vi.fn(() => false);
    (workflow as any).tools.searchCandidates = vi.fn(async () => ({
      query: "杭州 python backend",
      conditions: BASE_CONDITIONS,
      candidates: [first, second]
    }));
    (workflow as any).shortlistController.runShortlistLoop = vi.fn(async () => ({ type: "quit" }));

    await runSearchLoop(BASE_CONDITIONS);

    const snapshot = workflow.getSessionSnapshot();
    expect(snapshot.userGoal).toBe("杭州 python backend");
    expect(snapshot.currentConditions).toMatchObject(BASE_CONDITIONS);
    expect(snapshot.currentShortlist).toHaveLength(2);
    expect(snapshot.currentShortlist[0]).toMatchObject({
      personId: "person-1",
      lastSyncedAt: "2026-03-30T00:00:00.000Z",
      latestEvidenceAt: "2026-03-29T00:00:00.000Z"
    });
    expect(snapshot.searchHistory).toHaveLength(1);
    expect(snapshot.runtime.status).toBe("shortlist");
  });

  it("emits compare and recommendation events in a stable order", async () => {
    const { workflow, mockTui, presentComparison } = createWorkflowHarness();
    const first = createCandidate({ personId: "person-1", matchStrength: "strong" });
    const second = createCandidate({ personId: "person-2", name: "Lin", matchStrength: "medium" });

    mockTui.promptCompareAction.mockResolvedValue("back");
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: [],
      result: {
        entries: [],
        outcome: {
          confidence: "high-confidence",
          recommendationMode: "clear-recommendation",
          recommendedCandidateId: "person-1",
          recommendation: "Ada 更适合当前目标。",
          rationale: "证据更强且角色贴合度更高。",
          largestUncertainty: "仍需补充最近 90 天活跃度。"
        }
      }
    }));

    await presentComparison(
      [first, second],
      [first, second],
      BASE_CONDITIONS,
      {
        clearProfilesBeforeCompare: false,
        loadingMessage: "正在准备候选人对比..."
      }
    );

    const eventTypes = workflow.getSessionEvents().map((event) => event.type);
    const compareStartedIndex = eventTypes.indexOf("compare_started");
    const compareUpdatedIndex = eventTypes.indexOf("compare_updated");
    const confidenceUpdatedIndex = eventTypes.indexOf("confidence_updated");
    const uncertaintyUpdatedIndex = eventTypes.indexOf("uncertainty_updated");
    const recommendationUpdatedIndex = eventTypes.indexOf("recommendation_updated");

    expect(compareStartedIndex).toBeGreaterThanOrEqual(0);
    expect(compareUpdatedIndex).toBeGreaterThan(compareStartedIndex);
    expect(confidenceUpdatedIndex).toBeGreaterThan(compareUpdatedIndex);
    expect(uncertaintyUpdatedIndex).toBeGreaterThan(confidenceUpdatedIndex);
    expect(recommendationUpdatedIndex).toBeGreaterThan(uncertaintyUpdatedIndex);

    const recommendationEvent = workflow.getSessionEvents().find((event) => event.type === "recommendation_updated");
    expect(recommendationEvent?.data).toMatchObject({
      recommendedCandidate: {
        candidate: {
          personId: "person-1"
        }
      }
    });
  });

  it("emits compare-to-refine events in order and clears compare suggestion after rerun", async () => {
    const { workflow, mockChat, mockTui, runSearchLoop } = createWorkflowHarness();
    const first = createCandidate({ personId: "person-1", matchStrength: "strong" });
    const second = createCandidate({
      personId: "person-2",
      name: "Lin",
      matchStrength: "medium",
      sources: ["GitHub"]
    });
    const refined = createCandidate({
      personId: "person-3",
      name: "Grace",
      matchStrength: "medium"
    });

    (workflow as any).shouldPreloadProfiles = vi.fn(() => false);
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
        candidates: [refined]
      });
    (workflow as any).tools.prepareComparison = vi.fn(async () => ({
      targets: [first, second],
      entries: [],
      result: {
        entries: [],
        outcome: {
          confidence: "low-confidence",
          recommendationMode: "no-recommendation",
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

    await runSearchLoop(BASE_CONDITIONS);

    const eventTypes = workflow.getSessionEvents().map((event) => event.type);
    const firstSearchStarted = eventTypes.indexOf("search_started");
    const compareStarted = eventTypes.indexOf("compare_started");
    const conditionsUpdatedIndexes = eventTypes
      .map((type, index) => ({ type, index }))
      .filter((entry) => entry.type === "conditions_updated")
      .map((entry) => entry.index);
    const searchStartedIndexes = eventTypes
      .map((type, index) => ({ type, index }))
      .filter((entry) => entry.type === "search_started")
      .map((entry) => entry.index);

    expect(firstSearchStarted).toBeGreaterThanOrEqual(0);
    expect(compareStarted).toBeGreaterThan(firstSearchStarted);
    expect(searchStartedIndexes).toHaveLength(2);
    expect(searchStartedIndexes[1]).toBeGreaterThan(compareStarted);
    expect(conditionsUpdatedIndexes.length).toBeGreaterThanOrEqual(2);
    expect(conditionsUpdatedIndexes[conditionsUpdatedIndexes.length - 1]).toBeGreaterThan(compareStarted);

    const snapshot = workflow.getSessionSnapshot();
    expect(snapshot.currentConditions.mustHave).toEqual(["infra backend"]);
    expect(snapshot.recoveryState.compareSuggestedRefinement).toBeUndefined();
  });

  it("serializes runtime whyCodes and primaryWhyCode in snapshot", async () => {
    const { workflow, mockChat, runClarifyLoop } = createWorkflowHarness();
    mockChat.extractConditions.mockResolvedValue(BASE_CONDITIONS);

    await runClarifyLoop("杭州 python backend");

    const snapshot = workflow.getSessionSnapshot();
    expect(snapshot.runtime).toBeDefined();
    expect(Array.isArray(snapshot.runtime.whyCodes)).toBe(true);
    expect(typeof snapshot.runtime.lastStatusAt).toBe("string");
  });

  it("sets primaryWhyCode when blocked with goal_missing", async () => {
    const workflow = new SearchWorkflow({} as any, {} as any);
    (workflow as any).tui = { displayBanner: vi.fn() };
    (workflow as any).spinner = { start: vi.fn(), stop: vi.fn() };
    (workflow as any).chat = { askFreeform: vi.fn().mockResolvedValue("") };

    await (workflow as any).bootstrapMission("");

    const snapshot = workflow.getSessionSnapshot();
    expect(snapshot.runtime.status).toBe("blocked");
    expect(snapshot.runtime.primaryWhyCode).toBe("goal_missing");
    expect(snapshot.runtime.whyCodes).toEqual(["goal_missing"]);
    expect(snapshot.runtime.whySummary).toBe("用户未提供初始搜索目标。");
  });

  it("sets primaryWhyCode when blocked with conditions_insufficient", async () => {
    const workflow = new SearchWorkflow({} as any, {} as any);
    (workflow as any).tui = { displayBanner: vi.fn() };
    (workflow as any).spinner = { start: vi.fn(), stop: vi.fn() };
    (workflow as any).chat = {
      askFreeform: vi.fn().mockResolvedValue(""),
      extractConditions: vi.fn().mockResolvedValue({
        skills: [],
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
      })
    };

    await (workflow as any).bootstrapMission("随便找找");

    const snapshot = workflow.getSessionSnapshot();
    expect(snapshot.runtime.status).toBe("blocked");
    expect(snapshot.runtime.primaryWhyCode).toBe("conditions_insufficient");
    expect(snapshot.runtime.whyCodes).toEqual(["conditions_insufficient"]);
    expect(snapshot.runtime.whySummary).toBe("当前搜索条件不足以形成有效查询。");
  });

  it("clears why fields when transitioning to status without explicit why", async () => {
    const { workflow, mockChat, runClarifyLoop } = createWorkflowHarness();
    mockChat.extractConditions.mockResolvedValue(BASE_CONDITIONS);

    await runClarifyLoop("杭州 python backend");

    const snapshot = workflow.getSessionSnapshot();
    expect(snapshot.runtime.status).toBe("searching");
    expect(snapshot.runtime.primaryWhyCode).toBeUndefined();
    expect(snapshot.runtime.whyCodes).toEqual([]);
    expect(snapshot.runtime.whySummary).toBeNull();
  });
});
