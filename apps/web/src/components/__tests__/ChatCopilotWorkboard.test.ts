import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatCopilotWorkboardView } from "../ChatCopilotWorkboard.js";
import type { DealFlowResponse } from "@/lib/api";
import type { AgentPanelSessionEvent, AgentPanelSessionSnapshot } from "@/lib/agent-panel";

const SNAPSHOT: AgentPanelSessionSnapshot = {
  sessionId: "session-1",
  status: "searching",
  statusSummary: "正在搜索候选人",
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
      queryReasons: ["角色贴合", "近期执行强"],
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
      queryReasons: ["亲手做过 runtime"],
      sources: ["GitHub"]
    }
  ],
  activeCompareSet: [],
  confidenceStatus: {
    level: "medium",
    rationale: "还差最近活跃度证据。",
    updatedAt: "2026-04-17T02:00:00.000Z"
  },
  recommendedCandidate: null,
  openUncertainties: ["最近 90 天活跃度还不稳"],
  clarificationCount: 1,
  searchHistory: []
};

const EVENTS: AgentPanelSessionEvent[] = [
  {
    sessionId: "session-1",
    sequence: 1,
    timestamp: "2026-04-17T02:05:00.000Z",
    type: "shortlist_updated",
    status: "shortlist",
    summary: "shortlist 已更新到 2 位候选人。",
    data: {
      shortlist: SNAPSHOT.currentShortlist
    }
  }
];

const DEAL_FLOW: DealFlowResponse = {
  artifact: {
    generatedForDate: "2026-04-17",
    generatedAt: "2026-04-17T08:00:00.000Z",
    totalCandidates: 2,
    bucketCounts: {
      new: 1,
      "high-confidence": 1,
      "needs-validation": 0,
      revisit: 0
    },
    topToday: [
      {
        personId: "deal-1",
        name: "Mina",
        headline: "Agent infra lead",
        bucket: "high-confidence",
        confidence: "high",
        totalScore: 0.93,
        whyMatched: "Agent infra 方向高度一致。",
        whyNow: "最近公开输出明显增多，值得今天就推进。",
        approachPath: "从她最近的 infra 开源项目切入。",
        directionSummary: "AI agents / infra",
        directionTags: ["ai_agents", "ai_infra"],
        overlapTags: ["ai_agents"],
        sourceBadges: ["GitHub"],
        evidencePreview: [
          {
            id: "e-1",
            type: "repository",
            title: "agent-runtime",
            description: "近期持续提交 agent infra 相关代码。",
            url: "https://example.com/e-1"
          }
        ],
        state: {
          seenCount: 1,
          detailViewCount: 0,
          repeatViewCount: 0,
          lastFeedbackKind: null
        }
      }
    ],
    moreOpportunities: [
      {
        personId: "deal-2",
        name: "Rui",
        headline: "Developer tools founder",
        bucket: "new",
        confidence: "medium",
        totalScore: 0.81,
        whyMatched: "builder 气质和 agent 工具方向相近。",
        whyNow: "近期项目活跃，适合保持温度。",
        approachPath: "先从 developer tools 话题切入。",
        directionSummary: "Developer tools",
        directionTags: ["developer_tools"],
        overlapTags: ["developer_tools"],
        sourceBadges: ["GitHub"],
        evidencePreview: [],
        state: {
          seenCount: 1,
          detailViewCount: 0,
          repeatViewCount: 0,
          lastFeedbackKind: null
        }
      }
    ]
  },
  goalModel: {
    explicitGoal: "Find AI agents builders",
    summary: "Current goal centers on AI agents and developer tooling.",
    driftStatus: "aligned",
    dominantDirectionTags: ["ai_agents", "developer_tools"],
    signalSources: ["explicit_goal"]
  },
  viewer: {
    viewerId: "viewer-1",
    feedbackCounts: {
      interested: 0,
      not_interested: 0,
      contacted: 0,
      revisit: 0
    },
    interactionCounts: {
      detail_view: 0,
      repeat_view: 0,
      evidence_expand: 0,
      dwell: 0
    },
    surfacedCandidates: 2
  },
  driftNote: "最近行为与长期方向保持一致。"
};

describe("ChatCopilotWorkboardView", () => {
  it("renders narrated workboard sections for a live session", () => {
    render(
      React.createElement(ChatCopilotWorkboardView, {
        sessionId: "session-1",
        snapshot: SNAPSHOT,
        events: EVENTS,
        connectionStatus: "live",
        errorMessage: null,
        retryConnection: vi.fn(),
        dealFlowData: DEAL_FLOW,
        dealFlowError: null,
        isDealFlowLoading: false
      })
    );

    expect(screen.getByText("Narrated Workboard")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("Why")).toBeTruthy();
    expect(screen.getByText("Movement")).toBeTruthy();
    expect(screen.getByText("Focus")).toBeTruthy();
    expect(screen.getByText("Searching candidates")).toBeTruthy();
    expect(screen.getByText("Top picks right now")).toBeTruthy();
    expect(screen.getByText("Mina")).toBeTruthy();
    expect(screen.getByText("Today #1")).toBeTruthy();
    expect(screen.getByText(/最近公开输出明显增多/)).toBeTruthy();
    expect(screen.getByText("Lead Evidence")).toBeTruthy();
    expect(screen.getByText("More Opportunities")).toBeTruthy();
    expect(screen.getByText("Rui")).toBeTruthy();
    expect(screen.getByRole("link", { name: "在 Deal Flow 中查看并反馈" }).getAttribute("href")).toBe("/deal-flow?personId=deal-1");
    expect(screen.getByRole("link", { name: "打开完整 Deal Flow 深入查看" }).getAttribute("href")).toBe("/deal-flow");
  });

  it("shows idle guidance when no session is attached", () => {
    render(
      React.createElement(ChatCopilotWorkboardView, {
        snapshot: null,
        events: [],
        connectionStatus: "connecting",
        errorMessage: null,
        retryConnection: vi.fn(),
        dealFlowData: DEAL_FLOW,
        dealFlowError: null,
        isDealFlowLoading: false
      })
    );

    expect(screen.getByText("等待绑定可见 session")).toBeTruthy();
    expect(screen.getByText("Session not attached")).toBeTruthy();
    expect(screen.getByText("未绑定")).toBeTruthy();
    expect(screen.getByText("Mina")).toBeTruthy();
    expect(screen.getByText("Lead Evidence")).toBeTruthy();
  });

  it("shows missing-session state without fabricating output", () => {
    render(
      React.createElement(ChatCopilotWorkboardView, {
        sessionId: "missing-session",
        snapshot: null,
        events: [],
        connectionStatus: "missing",
        errorMessage: "当前 session 不存在。",
        retryConnection: vi.fn(),
        dealFlowData: null,
        dealFlowError: null,
        isDealFlowLoading: false
      })
    );

    expect(screen.getByText("当前没有活跃 session")).toBeTruthy();
    expect(screen.getByText("当前 session 不存在。")).toBeTruthy();
    expect(screen.getByText("Session not attached")).toBeTruthy();
  });
});
