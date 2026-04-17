import type { SearchResponse } from "../useChatSession.js";

export interface MissionReplayCandidateInput {
  personId: string;
  name: string;
  headline?: string | null;
  matchScore: number;
  matchReasons?: string[];
}

export interface MissionReplayCase {
  id: string;
  prompt: string;
  rounds: MissionReplayCandidateInput[][];
  expectedStopReason: "enough_shortlist" | "enough_compare" | "low_marginal_gain" | "needs_user_clarification";
  expectedPhase: "stopped";
  expectedFocus: "shortlist" | "compare" | "clarification";
  expectedSummaryIncludes: string[];
  expectedUncertaintyIncludes: string[];
}

export type MissionReplayFailureBucket =
  | "false_stop"
  | "late_stop"
  | "wrong_stage_report"
  | "ui_semantic_mismatch";

export interface MissionReplayEvidence {
  stopReason: string | undefined;
  phase: string | undefined;
  summary: string;
  uncertainty: string[];
  compareCount: number;
  shortlistCount: number;
}

export interface MissionReplayResult {
  caseId: string;
  passed: boolean;
  mismatches: MissionReplayFailureBucket[];
  evidence: MissionReplayEvidence;
}

export function createReplaySearchResponse(
  results: MissionReplayCandidateInput[],
  total = results.length
): SearchResponse {
  return {
    results: results.map((candidate) => ({
      personId: candidate.personId,
      name: candidate.name,
      headline: candidate.headline ?? null,
      matchScore: candidate.matchScore,
      matchStrength: candidate.matchScore >= 0.85 ? "strong" : candidate.matchScore >= 0.7 ? "medium" : "weak",
      matchReasons: candidate.matchReasons ?? ["技能匹配"]
    })),
    total
  };
}

export function replayResponsesForCase(input: MissionReplayCase): SearchResponse[] {
  return input.rounds.map((round) => createReplaySearchResponse(round, 20));
}

export function classifyReplayResult(
  testCase: MissionReplayCase,
  evidence: MissionReplayEvidence
): MissionReplayResult {
  const mismatches = new Set<MissionReplayFailureBucket>();

  if (evidence.stopReason !== testCase.expectedStopReason) {
    mismatches.add("false_stop");
  }

  if (evidence.phase !== testCase.expectedPhase) {
    mismatches.add("late_stop");
  }

  for (const snippet of testCase.expectedSummaryIncludes) {
    if (!evidence.summary.includes(snippet)) {
      mismatches.add("wrong_stage_report");
    }
  }

  for (const snippet of testCase.expectedUncertaintyIncludes) {
    if (!evidence.uncertainty.some((item) => item.includes(snippet))) {
      mismatches.add("ui_semantic_mismatch");
    }
  }

  if (testCase.expectedFocus === "compare" && evidence.compareCount < 2) {
    mismatches.add("ui_semantic_mismatch");
  }

  if (testCase.expectedFocus === "clarification" && evidence.compareCount > 0) {
    mismatches.add("ui_semantic_mismatch");
  }

  return {
    caseId: testCase.id,
    passed: mismatches.size === 0,
    mismatches: [...mismatches],
    evidence
  };
}

export const MISSION_REPLAY_CASES: MissionReplayCase[] = [
  {
    id: "compare-ready-search",
    prompt: "找上海的 AI 工程师",
    rounds: [
      [
        { personId: "p1", name: "Ada", matchScore: 0.91 },
        { personId: "p2", name: "Lin", matchScore: 0.84 }
      ],
      [
        { personId: "p3", name: "Mina", matchScore: 0.89 },
        { personId: "p4", name: "Rui", matchScore: 0.81 }
      ]
    ],
    expectedStopReason: "enough_compare",
    expectedPhase: "stopped",
    expectedFocus: "compare",
    expectedSummaryIncludes: ["当前 compare 集合", "还不建议直接定第一名"],
    expectedUncertaintyIncludes: ["当前 compare 已可看"]
  },
  {
    id: "converging-shortlist",
    prompt: "找上海的 AI 工程师",
    rounds: [
      [
        { personId: "p1", name: "Ada", matchScore: 0.92 },
        { personId: "p2", name: "Lin", matchScore: 0.74 }
      ],
      [
        { personId: "p3", name: "Mina", matchScore: 0.73 },
        { personId: "p4", name: "Rui", matchScore: 0.72 }
      ],
      [
        { personId: "p5", name: "Tao", matchScore: 0.71 }
      ]
    ],
    expectedStopReason: "enough_shortlist",
    expectedPhase: "stopped",
    expectedFocus: "shortlist",
    expectedSummaryIncludes: ["给你一版 shortlist", "先不要急着定第一名"],
    expectedUncertaintyIncludes: ["当前 shortlist 已经可看"]
  },
  {
    id: "thin-but-stable",
    prompt: "找偏 agent runtime 的工程师",
    rounds: [
      [
        { personId: "p1", name: "Ada", matchScore: 0.74 },
        { personId: "p2", name: "Lin", matchScore: 0.73 }
      ],
      [
        { personId: "p3", name: "Mina", matchScore: 0.72 }
      ],
      []
    ],
    expectedStopReason: "low_marginal_gain",
    expectedPhase: "stopped",
    expectedFocus: "shortlist",
    expectedSummaryIncludes: ["边际收益已经不高", "当前 shortlist"],
    expectedUncertaintyIncludes: ["当前 shortlist 可以先看"]
  },
  {
    id: "scattered-clarification",
    prompt: "帮我发散找多智能体负责人",
    rounds: [
      [
        { personId: "p1", name: "Ada", matchScore: 0.74 },
        { personId: "p2", name: "Lin", matchScore: 0.7 }
      ],
      [],
      [
        { personId: "p3", name: "Mina", matchScore: 0.73 },
        { personId: "p4", name: "Rui", matchScore: 0.72 }
      ]
    ],
    expectedStopReason: "needs_user_clarification",
    expectedPhase: "stopped",
    expectedFocus: "clarification",
    expectedSummaryIncludes: ["方向还不够稳定", "再收紧一句方向"],
    expectedUncertaintyIncludes: ["请再补一句更紧的方向"]
  }
];
