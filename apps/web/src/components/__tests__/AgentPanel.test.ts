import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentPanelView } from "../AgentPanel.js";
import type { AgentPanelSessionSnapshot } from "@/lib/agent-panel";

const SNAPSHOT: AgentPanelSessionSnapshot = {
  sessionId: "session-1",
  status: "shortlist",
  statusSummary: "当前 shortlist 有 4 位候选人。",
  userGoal: "找多智能体工程负责人",
  currentConditions: {
    skills: ["python", "agents"],
    locations: ["上海"],
    experience: undefined,
    role: "engineering manager",
    sourceBias: "github",
    mustHave: ["builder"],
    niceToHave: [],
    exclude: [],
    preferFresh: true,
    candidateAnchor: undefined,
    limit: 10
  },
  currentShortlist: [
    {
      personId: "person-1",
      name: "Ada",
      headline: "Engineering Manager",
      location: "上海",
      company: "Seeku",
      experienceYears: 8,
      matchScore: 0.91,
      profile: {
        summary: "负责多智能体系统与搜索平台。",
        highlights: ["带过 agent 平台团队"]
      },
      queryReasons: ["角色贴合"],
      sources: ["GitHub"]
    },
    {
      personId: "person-2",
      name: "Lin",
      headline: "Staff Engineer",
      location: "杭州",
      company: "Builder Lab",
      experienceYears: 10,
      matchScore: 0.88,
      profile: {
        summary: "长期带队做 infra。",
        highlights: ["亲手写过 runtime"]
      },
      queryReasons: ["近期执行强"],
      sources: ["GitHub"]
    }
  ],
  activeCompareSet: [
    {
      personId: "compare-1",
      name: "C1",
      headline: "A",
      location: "上海",
      company: null,
      experienceYears: null,
      matchScore: 0.83,
      sources: ["GitHub"]
    },
    {
      personId: "compare-2",
      name: "C2",
      headline: "B",
      location: "上海",
      company: null,
      experienceYears: null,
      matchScore: 0.82,
      sources: ["GitHub"]
    },
    {
      personId: "compare-3",
      name: "C3",
      headline: "C",
      location: "上海",
      company: null,
      experienceYears: null,
      matchScore: 0.81,
      sources: ["GitHub"]
    }
  ],
  confidenceStatus: {
    level: "medium",
    rationale: "还差最近活跃度证据。",
    updatedAt: "2026-04-17T02:00:00.000Z"
  },
  recommendedCandidate: null,
  openUncertainties: ["最近 90 天活跃度还不稳"],
  clarificationCount: 2,
  searchHistory: []
};

describe("AgentPanelView", () => {
  it("renders the main dual-column sections", () => {
    render(React.createElement(AgentPanelView, {
      sessionId: "session-1",
      snapshot: SNAPSHOT,
      events: [],
      connectionStatus: "live",
      expandedCandidate: null,
      latestNotice: null,
      errorMessage: null,
      pendingCommandKey: null,
      sendIntervention: vi.fn(async () => undefined),
      retryConnection: vi.fn(),
      isCommandPending: () => false
    }));

    expect(screen.getByText("Session Snapshot")).toBeTruthy();
    expect(screen.getByText("Recommendation")).toBeTruthy();
    expect(screen.getByText("Shortlist")).toBeTruthy();
    expect(screen.getByText("Compare Set")).toBeTruthy();
    expect(screen.getByText("更偏工程经理")).toBeTruthy();
  });

  it("disables add-to-compare when the compare set is already full", () => {
    render(React.createElement(AgentPanelView, {
      sessionId: "session-1",
      snapshot: SNAPSHOT,
      events: [],
      connectionStatus: "live",
      expandedCandidate: null,
      latestNotice: null,
      errorMessage: null,
      pendingCommandKey: null,
      sendIntervention: vi.fn(async () => undefined),
      retryConnection: vi.fn(),
      isCommandPending: () => false
    }));

    const button = screen.getByLabelText("加入 compare Ada");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders missing-session guidance and allows manual retry", () => {
    const retryConnection = vi.fn();

    render(React.createElement(AgentPanelView, {
      sessionId: "missing-session",
      snapshot: null,
      events: [],
      connectionStatus: "missing",
      expandedCandidate: null,
      latestNotice: null,
      errorMessage: "当前 session 不存在。",
      pendingCommandKey: null,
      sendIntervention: vi.fn(async () => undefined),
      retryConnection,
      isCommandPending: () => false
    }));

    fireEvent.click(screen.getByText("重连"));

    expect(screen.getByText("当前没有可展示的 session")).toBeTruthy();
    expect(retryConnection).toHaveBeenCalledTimes(1);
  });

  it("keeps the last snapshot visible while reconnecting", () => {
    render(React.createElement(AgentPanelView, {
      sessionId: "session-1",
      snapshot: SNAPSHOT,
      events: [],
      connectionStatus: "reconnecting",
      expandedCandidate: null,
      latestNotice: null,
      errorMessage: "实时事件流已断开，正在尝试重连。",
      pendingCommandKey: null,
      sendIntervention: vi.fn(async () => undefined),
      retryConnection: vi.fn(),
      isCommandPending: () => false
    }));

    expect(screen.getByText("正在恢复实时事件流")).toBeTruthy();
    expect(screen.getByText("Session Snapshot")).toBeTruthy();
    expect(screen.getByText("正在重连")).toBeTruthy();
  });
});
