import type { AgentPanelCandidateSnapshot } from "@/lib/agent-panel";

export const MIN_MISSION_EXPLORATION_ROUNDS = 3;
export const MAX_MISSION_ROUNDS = 4;

export type MissionStopReason =
  | "enough_shortlist"
  | "enough_compare"
  | "low_marginal_gain"
  | "needs_user_clarification";

export type MissionStopAssessment =
  | "exploration_floor_not_met"
  | "reportable_not_final"
  | "clarification_blocked";

export interface MissionStopPolicyInput {
  round: number;
  shortlist: AgentPanelCandidateSnapshot[];
  compareSet: AgentPanelCandidateSnapshot[];
  newTop: number;
}

export interface MissionStopDecision {
  stopReason: MissionStopReason | null;
  assessment: MissionStopAssessment;
  shouldRecommend: boolean;
  statusSummary: string;
  confidenceLevel: "low" | "medium";
  confidenceRationale: string;
  uncertainties: string[];
}

export function evaluateMissionStopPolicy(input: MissionStopPolicyInput): MissionStopDecision {
  const compareReady = input.compareSet.length >= 2;
  const shortlistCredible = input.shortlist.length >= 4 && input.newTop <= 1;
  const shortlistStableButThin = input.shortlist.length >= 3 && input.newTop === 0;
  const explorationFloorMet = input.round >= MIN_MISSION_EXPLORATION_ROUNDS;

  if (!explorationFloorMet) {
    if (compareReady) {
      return {
        stopReason: null,
        assessment: "exploration_floor_not_met",
        shouldRecommend: false,
        statusSummary: `第 ${input.round} 轮后已经形成可汇报 compare，但会继续补一轮，避免过早停止。`,
        confidenceLevel: "medium",
        confidenceRationale: "当前已有可比较候选，但还没过最小探索下限。",
        uncertainties: ["已经出现可看 compare，但系统会再补一轮确认，避免过早停止。"]
      };
    }

    return {
      stopReason: null,
      assessment: "exploration_floor_not_met",
      shouldRecommend: false,
      statusSummary: `第 ${input.round} 轮后 shortlist 已更新为 ${input.shortlist.length} 位候选人，继续补一轮确认。`,
      confidenceLevel: input.shortlist.length >= 3 ? "medium" : "low",
      confidenceRationale: input.shortlist.length >= 3
        ? "已经有一版可看的 shortlist，但还没过最小探索下限。"
        : "还需要继续扩和收敛。",
      uncertainties: input.shortlist.length >= 3
        ? ["当前结果已经可看，但系统会先补够最小探索下限。"]
        : ["候选池还在扩张，shortlist 还没完全稳定。"]
    };
  }

  if (compareReady) {
    return {
      stopReason: "enough_compare",
      assessment: "reportable_not_final",
      shouldRecommend: false,
      statusSummary: `第 ${input.round} 轮后 compare 已可汇报，我先停下来给你看当前集合。`,
      confidenceLevel: "medium",
      confidenceRationale: "当前 compare 已可汇报，但还不建议直接定第一名。",
      uncertainties: ["当前 compare 已可看，但默认先不直接推荐第一名。"]
    };
  }

  if (shortlistCredible) {
    return {
      stopReason: "enough_shortlist",
      assessment: "reportable_not_final",
      shouldRecommend: false,
      statusSummary: `第 ${input.round} 轮后 shortlist 已足够可看，我先停下来给你一版当前结果。`,
      confidenceLevel: "medium",
      confidenceRationale: "当前 shortlist 已可汇报，但还不建议直接定第一名。",
      uncertainties: ["当前 shortlist 已经可看，但默认先不直接推荐第一名。"]
    };
  }

  if (shortlistStableButThin) {
    return {
      stopReason: "low_marginal_gain",
      assessment: "reportable_not_final",
      shouldRecommend: false,
      statusSummary: `第 ${input.round} 轮后新增收益已经很低，我先停下来给你当前 shortlist。`,
      confidenceLevel: "low",
      confidenceRationale: "结果已经可以检查，但继续自动搜索的边际收益不高。",
      uncertainties: ["当前 shortlist 可以先看，但证据还不够强，不建议直接定第一名。"]
    };
  }

  if (input.round >= MAX_MISSION_ROUNDS || input.shortlist.length < 3 || input.newTop >= 2) {
    return {
      stopReason: "needs_user_clarification",
      assessment: "clarification_blocked",
      shouldRecommend: false,
      statusSummary: `第 ${input.round} 轮后方向仍然太散，我先停下来等你补一句更紧的方向。`,
      confidenceLevel: "low",
      confidenceRationale: "方向仍然太散，继续自动搜索只会放大噪声。",
      uncertainties: ["结果还不够稳定。请再补一句更紧的方向。"]
    };
  }

  return {
    stopReason: null,
    assessment: "reportable_not_final",
    shouldRecommend: false,
    statusSummary: `第 ${input.round} 轮后还在继续收敛 shortlist。`,
    confidenceLevel: "low",
    confidenceRationale: "已经过了最小探索下限，但结果还没收得足够稳。",
    uncertainties: ["当前结果还在收敛，系统会再补一轮再决定是汇报还是请你收紧方向。"]
  };
}
