"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  WebChatSession,
  extractConditions,
  reviseConditions,
  createEmptyConditions,
  type ChatMessage,
  type SearchConditions
} from "@/lib/chat-session";
import type {
  AgentPanelCandidateSnapshot,
  AgentPanelSearchConditions,
  AgentPanelSessionEvent,
  AgentPanelSessionSnapshot,
  AgentPanelSessionStatus
} from "@/lib/agent-panel";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const MISSION_PAGE_SIZE = 10;
const MAX_MISSION_ROUNDS = 3;

export type MissionPhase =
  | "running_search"
  | "narrowing"
  | "comparing"
  | "summarizing"
  | "stopped";

export type MissionStatus = "running" | "converging" | "stopped";

export type MissionStopReason =
  | "enough_shortlist"
  | "enough_compare"
  | "low_marginal_gain"
  | "needs_user_clarification";

export type MissionCorrectionType =
  | "tighten"
  | "retarget"
  | "stop_or_pause_intent";

interface SearchResultCard {
  personId: string;
  name: string;
  headline: string | null;
  disambiguation?: string;
  matchScore: number;
  matchStrength: "strong" | "medium" | "weak";
  matchReasons: string[];
}

interface SearchResponse {
  results: SearchResultCard[];
  total: number;
  intent?: {
    rawQuery: string;
    roles: string[];
    skills: string[];
    locations: string[];
  };
  resultWarning?: string;
}

export interface CopilotMissionCorrection {
  id: string;
  type: MissionCorrectionType;
  message: string;
  appliedAt: string;
}

export interface CopilotMission {
  missionId: string;
  goal: string;
  status: MissionStatus;
  phase: MissionPhase;
  roundCount: number;
  startedAt: string;
  stoppedAt?: string;
  latestSummary: string;
  stopReason?: MissionStopReason;
  corrections: CopilotMissionCorrection[];
}

interface UseChatSessionReturn {
  messages: ChatMessage[];
  currentConditions: SearchConditions;
  isProcessing: boolean;
  mission: CopilotMission | null;
  snapshot: AgentPanelSessionSnapshot;
  events: AgentPanelSessionEvent[];
  sendMessage: (input: string) => Promise<void>;
  reset: () => void;
}

interface MissionRuntimeState {
  token: number;
  offset: number;
  aggregatedResults: SearchResultCard[];
  lastTopIds: string[];
  correction?: {
    type: MissionCorrectionType;
    message: string;
  };
}

/**
 * React hook for managing chat session state with search integration
 */
export function useChatSession(): UseChatSessionReturn {
  // Use refs to persist the session across renders
  const sessionRef = useRef<WebChatSession | null>(null);
  const isFirstRender = useRef(true);

  // Initialize session on first render
  if (sessionRef.current === null) {
    sessionRef.current = new WebChatSession();
  }

  // State for React reactivity
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConditions, setCurrentConditions] = useState<SearchConditions>(createEmptyConditions());
  const [isProcessing, setIsProcessing] = useState(false);
  const [mission, setMission] = useState<CopilotMission | null>(null);
  const [snapshot, setSnapshot] = useState<AgentPanelSessionSnapshot>(() => buildEmptySnapshot());
  const [events, setEvents] = useState<AgentPanelSessionEvent[]>([]);
  const sequenceRef = useRef(0);
  const missionRuntimeRef = useRef<MissionRuntimeState | null>(null);
  const conditionsRef = useRef<SearchConditions>(createEmptyConditions());
  const missionRef = useRef<CopilotMission | null>(null);
  const searchHistoryRef = useRef<Array<{ conditions: AgentPanelSearchConditions; resultCount: number; timestamp: string }>>([]);
  const compareSetRef = useRef<AgentPanelCandidateSnapshot[]>([]);
  const shortlistRef = useRef<AgentPanelCandidateSnapshot[]>([]);
  const recommendedCandidateRef = useRef<AgentPanelSessionSnapshot["recommendedCandidate"]>(null);
  const uncertaintyRef = useRef<string[]>([]);

  // Load from localStorage on first render (client-side only)
  useEffect(() => {
    if (isFirstRender.current && typeof window !== "undefined") {
      sessionRef.current?.loadFromStorage();
      setMessages(sessionRef.current?.messages ?? []);
      const loadedConditions = sessionRef.current?.currentConditions ?? createEmptyConditions();
      setCurrentConditions(loadedConditions);
      conditionsRef.current = loadedConditions;
      setSnapshot(buildEmptySnapshot(loadedConditions));
      isFirstRender.current = false;
    }
  }, []);

  // Save to localStorage when messages or conditions change
  useEffect(() => {
    if (!isFirstRender.current && typeof window !== "undefined") {
      sessionRef.current?.saveToStorage();
    }
  }, [messages, currentConditions]);

  const emitEvent = useCallback((event: Omit<AgentPanelSessionEvent, "sequence" | "timestamp">) => {
    const nextEvent: AgentPanelSessionEvent = {
      ...event,
      sequence: ++sequenceRef.current,
      timestamp: new Date().toISOString()
    };
    setEvents((previous) => [...previous.slice(-39), nextEvent]);
    return nextEvent;
  }, []);

  const syncSnapshot = useCallback((overrides: Partial<AgentPanelSessionSnapshot> = {}) => {
    setSnapshot((previous) => ({
      ...previous,
      currentConditions: toAgentPanelConditions(conditionsRef.current),
      currentShortlist: shortlistRef.current,
      activeCompareSet: compareSetRef.current,
      recommendedCandidate: recommendedCandidateRef.current,
      openUncertainties: uncertaintyRef.current,
      searchHistory: searchHistoryRef.current,
      ...overrides
    }));
  }, []);

  const updateMission = useCallback((updater: (current: CopilotMission | null) => CopilotMission | null) => {
    const next = updater(missionRef.current);
    missionRef.current = next;
    setMission(next);
  }, []);

  const addAssistantMessage = useCallback((content: string, toolResult?: ChatMessage["toolResult"], conditions?: SearchConditions) => {
    sessionRef.current?.addMessage({
      role: "assistant",
      content,
      toolResult,
      conditions
    });
    setMessages([...(sessionRef.current?.messages ?? [])]);
  }, []);

  const setMissionPhase = useCallback((phase: MissionPhase, summary: string) => {
    updateMission((current) => current ? {
      ...current,
      phase,
      latestSummary: summary,
      status: phase === "stopped" ? "stopped" : phase === "comparing" ? "converging" : "running",
      stoppedAt: phase === "stopped" ? new Date().toISOString() : current.stoppedAt
    } : current);
  }, [updateMission]);

  const runMissionStep = useCallback(async (token: number) => {
    const runtime = missionRuntimeRef.current;
    if (!runtime || runtime.token !== token) {
      return;
    }

    const activeMission = missionRef.current;
    if (!activeMission || activeMission.phase === "stopped") {
      return;
    }

    const round = activeMission.roundCount + 1;
    const query = buildSearchQuery(conditionsRef.current);
    const correctionMessage = runtime.correction?.message;

    setMissionPhase("running_search", correctionMessage
      ? `正在按新的方向重新扩大搜索范围：${correctionMessage}`
      : `正在执行第 ${round} 轮大范围候选搜索。`);

    emitEvent({
      sessionId: snapshot.sessionId,
      type: "search_started",
      status: "searching",
      summary: correctionMessage
        ? `收到纠偏，按新方向重启搜索：${correctionMessage}`
        : `第 ${round} 轮搜索已开始。`,
      data: {
        round,
        query
      }
    });

    const response = await callSearchAPI(query, MISSION_PAGE_SIZE, runtime.offset);
    const deduped = mergeResults(runtime.aggregatedResults, response.results);
    runtime.aggregatedResults = deduped;
    runtime.offset += MISSION_PAGE_SIZE;
    runtime.correction = undefined;

    const shortlist = deduped.slice(0, Math.min(5, deduped.length)).map(toCandidateSnapshot);
    const compareSet = shortlist.filter((candidate) => candidate.matchScore >= 0.75).slice(0, 3);
    const topIds = shortlist.slice(0, 3).map((candidate) => candidate.personId);
    const newTop = topIds.filter((id) => !runtime.lastTopIds.includes(id)).length;
    runtime.lastTopIds = topIds;

    shortlistRef.current = shortlist;
    compareSetRef.current = compareSet;
    recommendedCandidateRef.current = compareSet.length >= 2
      ? {
          candidate: compareSet[0],
          rationale: "当前 compare 集合已经收敛到可汇报的前几位候选人。",
          createdAt: new Date().toISOString(),
          confidenceLevel: compareSet.length >= 3 ? "high" : "medium"
        }
      : null;
    uncertaintyRef.current = compareSet.length >= 2
      ? []
      : ["候选池还在扩张，compare 还没完全稳定。"];
    searchHistoryRef.current = [
      ...searchHistoryRef.current,
      {
        conditions: toAgentPanelConditions(conditionsRef.current),
        resultCount: response.results.length,
        timestamp: new Date().toISOString()
      }
    ];

    updateMission((current) => current ? { ...current, roundCount: round } : current);
    syncSnapshot({
      status: compareSet.length >= 2 ? "comparing" : "shortlist",
      statusSummary: compareSet.length >= 2
        ? `第 ${round} 轮后 compare 已具备条件。`
        : `第 ${round} 轮后 shortlist 已更新为 ${shortlist.length} 位候选人。`,
      confidenceStatus: {
        level: compareSet.length >= 2 ? "medium" : "low",
        rationale: compareSet.length >= 2 ? "已经有可比较的候选集合。" : "还需要继续扩和收敛。",
        updatedAt: new Date().toISOString()
      }
    });

    emitEvent({
      sessionId: snapshot.sessionId,
      type: "shortlist_updated",
      status: "shortlist",
      summary: `第 ${round} 轮后 shortlist 更新为 ${shortlist.length} 位候选人。`,
      data: {
        shortlist,
        round
      }
    });

    if (compareSet.length >= 2) {
      emitEvent({
        sessionId: snapshot.sessionId,
        type: "compare_updated",
        status: "comparing",
        summary: `第 ${round} 轮后 compare 集合已稳定到 ${compareSet.length} 位。`,
        data: {
          compareSet,
          round
        }
      });
    }

    const stopReason = pickStopReason({
      round,
      shortlist,
      compareSet,
      newTop
    });

    if (stopReason) {
      const stopSummary = summarizeStopReason(stopReason, shortlist, compareSet);
      setMissionPhase("summarizing", stopSummary);
      updateMission((current) => current ? {
        ...current,
        stopReason
      } : current);
      addAssistantMessage(stopSummary, {
        results: shortlist.map((candidate) => ({
          personId: candidate.personId,
          name: candidate.name,
          headline: candidate.headline ?? null,
          matchScore: candidate.matchScore,
          matchReasons: candidate.queryReasons ?? []
        })),
        total: shortlist.length
      }, conditionsRef.current);
      setMissionPhase("stopped", stopSummary);
      syncSnapshot({
        status: "waiting-input",
        statusSummary: stopSummary,
        confidenceStatus: {
          level: compareSet.length >= 2 ? "medium" : "low",
          rationale: stopReason,
          updatedAt: new Date().toISOString()
        }
      });
      return;
    }

    setMissionPhase(compareSet.length >= 2 ? "comparing" : "narrowing", compareSet.length >= 2
      ? `第 ${round} 轮后进入 compare 判断。`
      : `第 ${round} 轮后继续收敛 shortlist。`);

    window.setTimeout(() => {
      void runMissionStep(token);
    }, 200);
  }, [addAssistantMessage, emitEvent, setMissionPhase, snapshot.sessionId, syncSnapshot, updateMission]);

  const startMission = useCallback(async (goal: string, conditions: SearchConditions) => {
    const missionId = `mission-${Date.now()}`;
    const startedAt = new Date().toISOString();

    const nextMission: CopilotMission = {
      missionId,
      goal,
      status: "running",
      phase: "running_search",
      roundCount: 0,
      startedAt,
      latestSummary: "正在启动大范围候选搜索任务。",
      corrections: []
    };

    missionRef.current = nextMission;
    setMission(nextMission);
    missionRuntimeRef.current = {
      token: Date.now(),
      offset: 0,
      aggregatedResults: [],
      lastTopIds: []
    };
    shortlistRef.current = [];
    compareSetRef.current = [];
    recommendedCandidateRef.current = null;
    uncertaintyRef.current = ["任务刚启动，正在扩大搜索范围。"];
    searchHistoryRef.current = [];

    addAssistantMessage("我会先做一轮更大范围的候选探索，再逐步收敛成 shortlist。过程中你可以随时插话纠偏。");
    syncSnapshot({
      status: "searching",
      statusSummary: "Mission 已启动，正在扩大搜索范围。",
      userGoal: goal,
      confidenceStatus: {
        level: "low",
        rationale: "Mission 刚启动，结果还未收敛。",
        updatedAt: startedAt
      }
    });

    window.setTimeout(() => {
      if (missionRuntimeRef.current) {
        void runMissionStep(missionRuntimeRef.current.token);
      }
    }, 100);
  }, [addAssistantMessage, runMissionStep, syncSnapshot]);

  const handleMissionCorrection = useCallback(async (input: string) => {
    const classification = classifyMissionCorrection(input);

    if (classification === "stop_or_pause_intent") {
      const shortlist = shortlistRef.current;
      const compareSet = compareSetRef.current;
      const summary = summarizeStopReason(compareSet.length >= 2 ? "enough_compare" : "enough_shortlist", shortlist, compareSet);
      addAssistantMessage(`收到，我先停在这里并给你当前结果。\n\n${summary}`, {
        results: shortlist.map((candidate) => ({
          personId: candidate.personId,
          name: candidate.name,
          headline: candidate.headline ?? null,
          matchScore: candidate.matchScore,
          matchReasons: candidate.queryReasons ?? []
        })),
        total: shortlist.length
      }, conditionsRef.current);
      setMissionPhase("stopped", summary);
      updateMission((current) => current ? {
        ...current,
        stopReason: compareSet.length >= 2 ? "enough_compare" : "enough_shortlist"
      } : current);
      syncSnapshot({
        status: "waiting-input",
        statusSummary: summary
      });
      return;
    }

    const revised = await reviseConditions(
      conditionsRef.current,
      input,
      classification === "tighten" ? "tighten" : "edit"
    );
    conditionsRef.current = revised;
    setCurrentConditions(revised);
    sessionRef.current?.setCurrentConditions(revised);

    updateMission((current) => current ? {
      ...current,
      latestSummary: `收到纠偏：${input}`,
      corrections: [
        ...current.corrections,
        {
          id: `correction-${Date.now()}`,
          type: classification,
          message: input,
          appliedAt: new Date().toISOString()
        }
      ]
    } : current);

    missionRuntimeRef.current = missionRuntimeRef.current
      ? {
          ...missionRuntimeRef.current,
          offset: 0,
          aggregatedResults: [],
          lastTopIds: [],
          correction: {
            type: classification,
            message: input
          }
        }
      : null;

    addAssistantMessage(`收到，我会按这个方向继续当前 mission：${input}`);
    emitEvent({
      sessionId: snapshot.sessionId,
      type: "conditions_updated",
      status: "searching",
      summary: `Mission 已收到纠偏：${input}`,
      data: {
        conditions: revised,
        correctionType: classification
      }
    });
    syncSnapshot({
      status: "searching",
      statusSummary: `Mission 已收到纠偏：${input}`
    });
  }, [addAssistantMessage, emitEvent, setMissionPhase, snapshot.sessionId, syncSnapshot, updateMission]);

  /**
   * Send a message and handle the search flow
   */
  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim() || !sessionRef.current) return;

    setIsProcessing(true);

    try {
      // Add user message
      const userMessage = sessionRef.current.addMessage({
        role: "user",
        content: input.trim()
      });
      setMessages([...sessionRef.current.messages]);

      if (missionRef.current && missionRef.current.phase !== "stopped") {
        await handleMissionCorrection(input.trim());
        return;
      }

      const conditions = await extractConditions(input.trim());
      conditionsRef.current = conditions;
      sessionRef.current.setCurrentConditions(conditions);
      setCurrentConditions(conditions);
      syncSnapshot({
        currentConditions: toAgentPanelConditions(conditions),
        userGoal: input.trim(),
        status: "searching",
        statusSummary: "正在启动 mission。"
      });

      await startMission(input.trim(), conditions);
    } catch (error) {
      console.error("Failed to process message:", error);

      // Add error message
      sessionRef.current?.addMessage({
        role: "assistant",
        content: "抱歉，处理您的请求时遇到错误。请重试或换一种表达方式。"
      });
      setMessages([...(sessionRef.current?.messages ?? [])]);
    } finally {
      setIsProcessing(false);
    }
  }, [handleMissionCorrection, startMission, syncSnapshot]);

  /**
   * Reset the session
   */
  const reset = useCallback(() => {
    sessionRef.current?.reset();
    setMessages([]);
    setCurrentConditions(createEmptyConditions());
    conditionsRef.current = createEmptyConditions();
    setMission(null);
    missionRef.current = null;
    missionRuntimeRef.current = null;
    searchHistoryRef.current = [];
    shortlistRef.current = [];
    compareSetRef.current = [];
    recommendedCandidateRef.current = null;
    uncertaintyRef.current = [];
    setEvents([]);
    sequenceRef.current = 0;
    setSnapshot(buildEmptySnapshot());
  }, []);

  return {
    messages,
    currentConditions,
    isProcessing,
    mission,
    snapshot,
    events,
    sendMessage,
    reset
  };
}

/**
 * Build search query string from conditions
 */
function buildSearchQuery(conditions: SearchConditions): string {
  const parts: string[] = [];

  if (conditions.skills.length > 0) {
    parts.push(conditions.skills.join(" "));
  }

  if (conditions.locations.length > 0) {
    parts.push(`在 ${conditions.locations.join(" 或 ")}`);
  }

  if (conditions.experience) {
    parts.push(conditions.experience);
  }

  if (conditions.role) {
    parts.push(conditions.role);
  }

  if (conditions.mustHave.length > 0) {
    parts.push(`必须 ${conditions.mustHave.join("、")}`);
  }

  if (conditions.niceToHave.length > 0) {
    parts.push(`优先 ${conditions.niceToHave.join("、")}`);
  }

  if (conditions.exclude.length > 0) {
    parts.push(`排除 ${conditions.exclude.join("、")}`);
  }

  return parts.join(" ") || "搜索候选人";
}

/**
 * Call the search API
 */
async function callSearchAPI(query: string, limit = 10, offset = 0): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      offset
    })
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Format assistant message based on search results
 */
function formatAssistantMessage(
  response: SearchResponse,
  conditions: SearchConditions,
  isFirstQuery: boolean
): string {
  const total = response.total;

  if (isFirstQuery) {
    if (total === 0) {
      return "抱歉，没有找到匹配的候选人。您可以尝试放宽条件或换一种表达方式。";
    }

    const locationStr = conditions.locations.length > 0 ? conditions.locations.join("、") : "";
    const skillStr = conditions.skills.length > 0 ? conditions.skills.join("、") : "";

    let message = `找到 ${total} 位候选人`;
    if (locationStr) message += `（${locationStr}）`;
    if (skillStr) message += `，技能包含 ${skillStr}`;
    if (total <= 3) {
      message += "，以下是全部候选人：";
    } else {
      message += "，以下是前几位：";
    }

    return message;
  } else {
    // Refinement response
    if (total === 0) {
      return "添加条件后没有匹配的候选人。建议放宽条件。";
    }

    const addedConditions = conditions.mustHave.length > 0
      ? `，添加条件"${conditions.mustHave.join("、")}"`
      : "";

    return `筛选后找到 ${total} 位候选人${addedConditions}，以下是结果：`;
  }
}

function toCandidateSnapshot(result: SearchResultCard): AgentPanelCandidateSnapshot {
  return {
    personId: result.personId,
    name: result.name,
    headline: result.headline,
    location: null,
    company: null,
    experienceYears: null,
    matchScore: result.matchScore,
    queryReasons: result.matchReasons,
    sources: ["search"]
  };
}

function buildEmptySnapshot(conditions: SearchConditions = createEmptyConditions()): AgentPanelSessionSnapshot {
  return {
    sessionId: "local-frontstage",
    status: "idle",
    statusSummary: "等待启动 mission。",
    userGoal: null,
    currentConditions: toAgentPanelConditions(conditions),
    currentShortlist: [],
    activeCompareSet: [],
    confidenceStatus: {
      level: "low",
      rationale: "当前还没有启动 mission。",
      updatedAt: new Date().toISOString()
    },
    recommendedCandidate: null,
    openUncertainties: [],
    clarificationCount: 0,
    searchHistory: []
  };
}

function toAgentPanelConditions(conditions: SearchConditions): AgentPanelSearchConditions {
  return {
    skills: [...conditions.skills],
    locations: [...conditions.locations],
    experience: conditions.experience,
    role: conditions.role,
    sourceBias: conditions.sourceBias,
    mustHave: [...conditions.mustHave],
    niceToHave: [...conditions.niceToHave],
    exclude: [...conditions.exclude],
    preferFresh: conditions.preferFresh,
    candidateAnchor: conditions.candidateAnchor
      ? { ...conditions.candidateAnchor }
      : undefined,
    limit: conditions.limit
  };
}

function mergeResults(current: SearchResultCard[], next: SearchResultCard[]): SearchResultCard[] {
  const byId = new Map<string, SearchResultCard>();
  for (const candidate of [...current, ...next]) {
    const previous = byId.get(candidate.personId);
    if (!previous || previous.matchScore < candidate.matchScore) {
      byId.set(candidate.personId, candidate);
    }
  }
  return [...byId.values()].sort((left, right) => right.matchScore - left.matchScore);
}

function pickStopReason(input: {
  round: number;
  shortlist: AgentPanelCandidateSnapshot[];
  compareSet: AgentPanelCandidateSnapshot[];
  newTop: number;
}): MissionStopReason | null {
  if (input.compareSet.length >= 2 && input.round >= 2) {
    return "enough_compare";
  }
  if (input.shortlist.length >= 5 && input.round >= 2) {
    return "enough_shortlist";
  }
  if (input.round >= MAX_MISSION_ROUNDS || (input.round >= 2 && input.newTop === 0)) {
    return "low_marginal_gain";
  }
  return null;
}

function summarizeStopReason(
  stopReason: MissionStopReason,
  shortlist: AgentPanelCandidateSnapshot[],
  compareSet: AgentPanelCandidateSnapshot[]
): string {
  switch (stopReason) {
    case "enough_compare":
      return `我先停在这里：compare 已经收敛到 ${compareSet.length} 位强候选，可以开始判断了。`;
    case "enough_shortlist":
      return `我先停在这里：已经形成 ${shortlist.length} 位可信 shortlist，继续扩搜的边际收益不高。`;
    case "needs_user_clarification":
      return "我先停在这里：方向还不够稳定，继续搜只会放大噪声。你可以再收紧一句方向。";
    default:
      return "我先停在这里：继续扩搜没有明显带来更强的新候选，当前 shortlist 已经是更好的汇报点。";
  }
}

function classifyMissionCorrection(input: string): MissionCorrectionType {
  if (/先给我结果|先停一下|先停|停一下|直接汇报|先总结/.test(input)) {
    return "stop_or_pause_intent";
  }
  if (/更想|改成|换成|不看泛|转向/.test(input)) {
    return "retarget";
  }
  return "tighten";
}

export type {
  UseChatSessionReturn,
  ChatMessage,
  SearchConditions,
  SearchResponse,
  SearchResultCard
};
