import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalUI } from "../tui.js";
import type { AgentSessionSnapshot, AgentTranscriptEntry } from "../agent-session-events.js";
import type { ResumePanelItem } from "../resume-resolver.js";
import type { TaskResumeItem } from "../resume-panel-types.js";
import type { WorkboardViewModel } from "../workboard-view-model.js";
import type { PersistedCliSessionRecord } from "../session-ledger.js";

describe("TerminalUI banner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses truthful data-source copy", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayBanner();

    const banner = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(stdoutSpy).toHaveBeenCalled();
    expect(banner).toContain("Bonjour 主资料");
    expect(banner).toContain("GitHub 证据（分批覆盖中）");
    expect(banner).not.toContain("GitHub Engine");
  });

  it("marks low-confidence shortlist output distinctly", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    ui.displayShortlist(
      [{
        personId: "person-1",
        name: "Ada",
        headline: "Python Backend Engineer",
        location: "杭州",
        company: null,
        experienceYears: null,
        matchScore: 31,
        matchStrength: "weak",
        matchReason: "地点命中：杭州",
        queryReasons: ["地点命中：杭州"],
        sources: ["Bonjour"]
      }] as any,
      {
        skills: ["python"],
        locations: ["杭州"],
        experience: undefined,
        role: "backend",
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        sortMode: "overall",
        showingCount: 1,
        totalCount: 1,
        lowConfidence: true,
        uncertaintySummary: "当前结果仍然偏弱，需要继续 refine。"
      }
    );

    const output = stdoutSpy.mock.calls.map((call) => call.join("")).join("\n");
    expect(output).toContain("参考 shortlist");
    expect(output).toContain("有部分匹配");
    expect(output).toContain("原因");
  });
});

describe("TerminalUI compare prompt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts refine and short aliases in compare prompt", async () => {
    const ui = new TerminalUI();
    const promptLine = vi.spyOn(ui as any, "promptLine")
      .mockResolvedValueOnce("refine")
      .mockResolvedValueOnce("r");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(ui.promptCompareAction()).resolves.toBe("refine");
    await expect(ui.promptCompareAction()).resolves.toBe("refine");

    expect(promptLine).toHaveBeenNthCalledWith(1, "compare>", "back");
    expect(promptLine).toHaveBeenNthCalledWith(2, "compare>", "back");
    expect(logSpy).toHaveBeenCalled();
  });

  it("keeps back, clear, and quit behavior stable", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("clear")
      .mockResolvedValueOnce("q");

    await expect(ui.promptCompareAction()).resolves.toBe("back");
    await expect(ui.promptCompareAction()).resolves.toBe("clear");
    await expect(ui.promptCompareAction()).resolves.toBe("quit");
  });
});

describe("TerminalUI workboard mode indicator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const BASE_SNAPSHOT: AgentSessionSnapshot = {
    sessionId: "test-session",
    runtime: {
      status: "searching",
      statusSummary: "正在搜索匹配候选人。",
      primaryWhyCode: "retrieval_all_weak",
      whyCodes: ["retrieval_all_weak"],
      whySummary: "当前结果偏弱，准备继续扩搜。",
      terminationReason: undefined,
      lastStatusAt: "2026-04-22T01:00:00.000Z"
    },
    userGoal: "找杭州的 AI 工程师",
    currentConditions: {
      skills: [],
      locations: [],
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false,
      limit: 10
    },
    currentShortlist: [],
    activeCompareSet: [],
    confidenceStatus: { level: "low", updatedAt: "2026-04-22T01:00:00.000Z" },
    recommendedCandidate: null,
    openUncertainties: [],
    recoveryState: { phase: "idle", clarificationCount: 0, rewriteCount: 0, lowConfidenceEmitted: false },
    clarificationCount: 0,
    searchHistory: []
  };

  it("displays runtime status in workboard Now field", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayWorkboardSnapshot(BASE_SNAPSHOT);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("Searching candidates");
  });

  it("displays whySummary in workboard Why field", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayWorkboardSnapshot(BASE_SNAPSHOT);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("当前结果偏弱，准备继续扩搜。");
  });

  it("displays statusSummary in workboard Movement field", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayWorkboardSnapshot(BASE_SNAPSHOT);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("正在搜索匹配候选人。");
  });

  it("maps all status values to human-readable Now labels", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const statuses: Array<[string, string]> = [
      ["clarifying", "Clarifying goal"],
      ["searching", "Searching candidates"],
      ["recovering", "Recovering weak results"],
      ["shortlist", "Narrowing shortlist"],
      ["comparing", "Comparing finalists"],
      ["completed", "Session completed"],
      ["blocked", "Blocked"],
      ["waiting-input", "Waiting for input"]
    ];

    for (const [status, expectedLabel] of statuses) {
      logSpy.mockClear();
      ui.displayWorkboardSnapshot({
        ...BASE_SNAPSHOT,
        runtime: { ...BASE_SNAPSHOT.runtime, status: status as any }
      });
      const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(output).toContain(expectedLabel);
    }
  });

  it("shows Focus from userGoal when shortlist is empty", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayWorkboardSnapshot(BASE_SNAPSHOT);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("找杭州的 AI 工程师");
  });

  it("handles null snapshot gracefully", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayWorkboardSnapshot(null);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("暂无 workboard 快照");
  });
});

describe("TerminalUI resume preview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const BASE_RECORD: PersistedCliSessionRecord = {
    sessionId: "test-session",
    origin: "cli",
    posture: "stopped",
    transcript: [],
    latestSnapshot: {
      sessionId: "test-session",
      runtime: {
        status: "completed",
        statusSummary: "搜索完成。",
        primaryWhyCode: undefined,
        whyCodes: [],
        whySummary: null,
        terminationReason: "completed",
        lastStatusAt: "2026-04-22T01:00:00.000Z"
      },
      userGoal: null,
      currentConditions: {
        skills: [],
        locations: [],
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        limit: 10
      },
      currentShortlist: [],
      activeCompareSet: [],
      confidenceStatus: { level: "low", updatedAt: "2026-04-22T01:00:00.000Z" },
      recommendedCandidate: null,
      openUncertainties: [],
      recoveryState: { phase: "idle", clarificationCount: 0, rewriteCount: 0, lowConfidenceEmitted: false },
      clarificationCount: 0,
      searchHistory: []
    },
    createdAt: "2026-04-22T01:00:00.000Z",
    updatedAt: "2026-04-22T01:00:00.000Z"
  };

  it("displays runtime mode and termination reason in resume preview", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayResumePreview(BASE_RECORD);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("completed");
    expect(output).toContain("搜索完成。");
    expect(output).toContain("Stopped");
  });

  it("displays runtime mode and why in read-only preview", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayReadOnlyPreview(BASE_RECORD);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("Mode");
    expect(output).toContain("completed");
  });

  it("shows whySummary when available in record summary", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const record: PersistedCliSessionRecord = {
      ...BASE_RECORD,
      latestSnapshot: {
        ...BASE_RECORD.latestSnapshot!,
        runtime: {
          ...BASE_RECORD.latestSnapshot!.runtime,
          status: "searching",
          primaryWhyCode: "retrieval_all_weak",
          whySummary: "当前结果偏弱，准备继续扩搜。",
          terminationReason: "interrupted"
        }
      }
    };

    ui.displayResumePreview(record);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("searching");
    expect(output).toContain("当前结果偏弱");
    expect(output).toContain("interrupted");
  });
});

describe("TerminalUI resume panel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("labels resumable items with resume tag", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: ResumePanelItem[] = [{
      sessionId: "test-1",
      label: "searching · 正在搜索",
      kind: "interrupted_work_item",
      resumability: "resumable",
      priority: 400,
      updatedAt: "2026-04-22T01:00:00.000Z",
      status: "searching",
      statusSummary: "正在搜索匹配候选人。",
      primaryWhyCode: "retrieval_all_weak",
      whySummary: "当前结果偏弱。",
      cacheOnly: false,
      record: {} as any
    }];

    ui.displayResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("resume");
    expect(output).toContain("interrupted_work_item");
    expect(output).toContain("retrieval_all_weak");
  });

  it("labels read-only items distinctly", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: ResumePanelItem[] = [{
      sessionId: "test-2",
      label: "completed · 搜索完成",
      kind: "stopped_session",
      resumability: "read_only",
      priority: 200,
      updatedAt: "2026-04-22T01:00:00.000Z",
      status: "completed",
      statusSummary: "搜索完成。",
      whySummary: null,
      cacheOnly: false,
      record: {} as any
    }];

    ui.displayResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("read-only");
  });
});

describe("TerminalUI displayRestoredSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders mixed message and event transcript entries", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const transcript: AgentTranscriptEntry[] = [
      {
        type: "message",
        id: "msg-1",
        role: "user",
        content: "找杭州的 AI 工程师",
        timestamp: "2026-04-22T01:00:00.000Z"
      },
      {
        type: "event",
        event: {
          sessionId: "test-session",
          sequence: 1,
          type: "search_started",
          status: "searching",
          summary: "开始搜索候选人。",
          timestamp: "2026-04-22T01:00:01.000Z",
          data: {}
        }
      },
      {
        type: "message",
        id: "msg-2",
        role: "assistant",
        content: "找到了 3 位候选人。",
        timestamp: "2026-04-22T01:00:05.000Z"
      }
    ];

    ui.displayRestoredSession(transcript);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("找杭州的 AI 工程师");
    expect(output).toContain("search_started");
    expect(output).toContain("开始搜索候选人。");
    expect(output).toContain("找到了 3 位候选人。");
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it("handles empty transcript gracefully", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayRestoredSession([]);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("当前没有可显示的历史消息");
  });
});

// ============================================================================
// B6: displayTaskResumePanel TUI regression tests
// ============================================================================

function makeTaskResumeItem(overrides: Partial<TaskResumeItem> = {}): TaskResumeItem {
  return {
    kind: "work_item",
    sessionId: "s-1",
    title: "找 AI 工程师",
    subtitle: "短名单就绪",
    stage: "shortlist_ready",
    blocked: false,
    updatedAt: "2026-04-22T10:00:00.000Z",
    resumability: "resumable",
    record: {} as any,
    ...overrides
  };
}

describe("B6: displayTaskResumePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders work_item with title and next action", () => {
    const ui = new TerminalUI();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: TaskResumeItem[] = [
      makeTaskResumeItem({ title: "找 AI 工程师", nextActionTitle: "比较候选人" })
    ];

    ui.displayTaskResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("找 AI 工程师");
    expect(output).toContain("比较候选人");
    expect(output).toContain("可继续");
  });

  it("renders degraded_work_item with degraded label", () => {
    const ui = new TerminalUI();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: TaskResumeItem[] = [
      makeTaskResumeItem({ kind: "degraded_work_item", sessionId: "s-deg" })
    ];

    ui.displayTaskResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("degraded");
  });

  it("renders legacy_session with legacy label", () => {
    const ui = new TerminalUI();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: TaskResumeItem[] = [
      makeTaskResumeItem({ kind: "legacy_session", sessionId: "s-leg" })
    ];

    ui.displayTaskResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("legacy");
  });

  it("renders blocked item with blocker label", () => {
    const ui = new TerminalUI();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: TaskResumeItem[] = [
      makeTaskResumeItem({ blocked: true, blockerLabel: "搜索条件过宽" })
    ];

    ui.displayTaskResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("阻塞");
    expect(output).toContain("搜索条件过宽");
  });

  it("renders cacheOnly item with local cache hint", () => {
    const ui = new TerminalUI();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: TaskResumeItem[] = [
      makeTaskResumeItem({ cacheOnly: true })
    ];

    ui.displayTaskResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("local cache");
  });

  it("numbers items from [2] and preserves [1] for new task", () => {
    const ui = new TerminalUI();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const items: TaskResumeItem[] = [
      makeTaskResumeItem({ sessionId: "s-a" }),
      makeTaskResumeItem({ sessionId: "s-b" })
    ];

    ui.displayTaskResumePanel(items);

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("新开任务");
    expect(output).toContain("[1]");
    expect(output).toContain("[2]");
    expect(output).toContain("[3]");
  });
});

// ============================================================================
// B6: displayTaskWorkboard TUI regression tests
// ============================================================================

function makeWorkboardViewModel(overrides: Partial<WorkboardViewModel> = {}): WorkboardViewModel {
  return {
    title: "找 AI 工程师",
    stage: "shortlist_ready",
    stageLabel: "短名单就绪",
    blocked: false,
    summary: "已有 3 位候选人进入短名单",
    nextActionTitle: "比较候选人",
    nextActionDescription: "从短名单中选取 2-3 人进入比较",
    nextActionPrompt: "比较 A 和 B",
    updatedAtLabel: "2 分钟前",
    isLegacySession: false,
    ...overrides
  };
}

describe("B6: displayTaskWorkboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders normal task-centric workboard", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayTaskWorkboard(makeWorkboardViewModel());

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("找 AI 工程师");
    expect(output).toContain("短名单就绪");
    expect(output).toContain("已有 3 位候选人进入短名单");
    expect(output).toContain("比较候选人");
    expect(output).toContain("Task Workboard");
  });

  it("renders blocked task with blocker label", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayTaskWorkboard(makeWorkboardViewModel({
      blocked: true,
      blockerLabel: "搜索条件过宽"
    }));

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("阻塞");
    expect(output).toContain("搜索条件过宽");
  });

  it("renders legacy workboard", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayTaskWorkboard(makeWorkboardViewModel({
      isLegacySession: true,
      title: "找杭州后端"
    }));

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("legacy session");
    expect(output).toContain("找杭州后端");
  });

  it("renders degraded workboard", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayTaskWorkboard(makeWorkboardViewModel({
      isDegraded: true,
      title: "Session abcdef01"
    }));

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("degraded");
    expect(output).toContain("工作项关联丢失");
  });

  it("renders sourceLabel when present", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayTaskWorkboard(makeWorkboardViewModel({
      sourceLabel: "快照推导"
    }));

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("来源");
    expect(output).toContain("快照推导");
  });

  it("omits sourceLabel line when absent", () => {
    const ui = new TerminalUI();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayTaskWorkboard(makeWorkboardViewModel({
      sourceLabel: undefined
    }));

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).not.toContain("来源");
  });
});

// ============================================================================
// Phase 4: / command interception tests
// ============================================================================

describe("Phase 4: / command interception in prompts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("promptClarifyAction intercepts /help as immediate command", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/help");

    const result = await ui.promptClarifyAction();
    expect(result).toEqual({ type: "immediate", command: "help", args: "" });
  });

  it("promptClarifyAction intercepts /quit as immediate command", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/quit");

    const result = await ui.promptClarifyAction();
    expect(result).toEqual({ type: "immediate", command: "quit", args: "" });
  });

  it("promptClarifyAction passes natural language through unchanged", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("1");

    const result = await ui.promptClarifyAction();
    expect(result).toBe("search");
  });

  it("promptCompareAction intercepts /help as immediate command", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/help");

    const result = await ui.promptCompareAction();
    expect(result).toEqual({ type: "immediate", command: "help", args: "" });
  });

  it("promptCompareAction intercepts /back as stage command", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/back");

    const result = await ui.promptCompareAction();
    expect(result).toEqual({ type: "stage", command: "back", args: "" });
  });

  it("promptDetailAction intercepts /why as stage command", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/why");

    const result = await ui.promptDetailAction("TestCandidate");
    expect(result).toEqual({ type: "stage", command: "why", args: "" });
  });

  it("promptDetailAction intercepts / (palette) as help", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/");

    const result = await ui.promptDetailAction("TestCandidate");
    expect(result).toEqual({ type: "immediate", command: "help", args: "" });
  });

  it("promptClarifyAction intercepts / (palette) as help", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine").mockResolvedValueOnce("/");

    const result = await ui.promptClarifyAction();
    expect(result).toEqual({ type: "immediate", command: "help", args: "" });
  });

  it("parses slash sort commands into shortlist sortMode", () => {
    const ui = new TerminalUI();

    const result = (ui as any).parseShortlistCommand("/sort fresh");

    expect(result).toEqual({ type: "sort", sortMode: "fresh" });
  });

  it("parses slash export commands into shortlist export target and format", () => {
    const ui = new TerminalUI();

    const result = (ui as any).parseShortlistCommand("/export pool md");

    expect(result).toEqual({
      type: "export",
      exportTarget: "pool",
      exportFormat: "md"
    });
  });

  it("parses /memory as memory command in shortlist", () => {
    const ui = new TerminalUI();
    const result = (ui as any).parseShortlistCommand("/memory");
    expect(result).toEqual({ type: "memory" });
  });

  it("parses /mem as memory command in shortlist", () => {
    const ui = new TerminalUI();
    const result = (ui as any).parseShortlistCommand("/mem");
    expect(result).toEqual({ type: "memory" });
  });

  it("parses /m as memory command in shortlist", () => {
    const ui = new TerminalUI();
    const result = (ui as any).parseShortlistCommand("/m");
    expect(result).toEqual({ type: "memory" });
  });

  it("keeps bare m as show more in shortlist", () => {
    const ui = new TerminalUI();
    const result = (ui as any).parseShortlistCommand("m");
    expect(result).toEqual({ type: "showMore" });
  });

  it("parses /task as a global command in shortlist", () => {
    const ui = new TerminalUI();
    const result = (ui as any).parseShortlistCommand("/task");
    expect(result).toEqual({ type: "globalCommand", command: "task" });
  });

  it("parses /tasks as a global command in shortlist", () => {
    const ui = new TerminalUI();
    const result = (ui as any).parseShortlistCommand("/tasks");
    expect(result).toEqual({ type: "globalCommand", command: "tasks" });
  });
});
