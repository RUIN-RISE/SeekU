import {
  addCompareCandidates,
  clearCompareSet,
  setConfidenceStatus,
  setOpenUncertainties,
  setRecommendedCandidate,
  setRecoveryState,
  type AgentSessionState
} from "./agent-state.js";
import chalk from "chalk";
import { isCommandAction } from "./command-router.js";
import { getGuideHint } from "./guide.js";
import type { AgentSessionWhyCode } from "./session-runtime-types.js";
import type { ComparisonResult, GlobalCommandResult, SearchConditions } from "./types.js";
import type { ProfileManager } from "./profile-manager.js";
import type { SearchAgentTools } from "./agent-tools.js";
import type { TerminalRenderer } from "./renderer.js";
import type { TerminalUI } from "./tui.js";
import type { ChatInterface } from "./chat.js";

export type CompareLoopOutcome =
  | "back"
  | "clear"
  | "quit"
  | "new"
  | "tasks"
  | GlobalCommandResult
  | { type: "refine"; prompt: string };

export interface ComparisonControllerDependencies {
  profileManager: ProfileManager;
  tools: any;
  renderer: TerminalRenderer;
  tui: TerminalUI;
  chat: ChatInterface;
  runMemoryOverlay?: () => Promise<void>;
  getSessionState: () => AgentSessionState;
  applySessionState: (next: AgentSessionState) => void;
  setSessionStatus: (status: string, summary?: string | null, why?: { primaryWhyCode?: AgentSessionWhyCode; whySummary?: string | null }) => void;
  emitSessionEvent: (type: string, summary: string, data: Record<string, unknown>) => void;
  refreshCandidateQueryExplanation: (candidate: any, conditions: SearchConditions) => void;
  decorateComparisonResult: (result: ComparisonResult, conditions: SearchConditions) => ComparisonResult;
  buildCompareRefinePrompt: (conditions: SearchConditions) => string;
}

function buildCompareSuggestedRefinement(
  comparisonResult: ComparisonResult,
  conditions: SearchConditions
): string | undefined {
  const suggestedRefinement = comparisonResult.outcome.suggestedRefinement?.trim();
  if (suggestedRefinement) {
    return suggestedRefinement;
  }

  if (comparisonResult.outcome.recommendationMode === "no-recommendation") {
    return conditions.sourceBias
      ? `先保留当前来源偏好，再补更硬的角色、技能或 must-have。`
      : `先补更硬的角色、技能或 must-have，再回到 compare。`;
  }

  return undefined;
}

export class ComparisonController {
  constructor(private deps: ComparisonControllerDependencies) {}

  async presentComparison(
    targets: any[],
    allCandidates: any[],
    conditions: SearchConditions,
    options: {
      clearProfilesBeforeCompare: boolean;
      loadingMessage: string;
    }
  ): Promise<CompareLoopOutcome> {
    this.deps.tui.resetShortlistViewport();
    for (const target of targets) {
      this.deps.refreshCandidateQueryExplanation(target, conditions);
    }

    if (options.clearProfilesBeforeCompare) {
      for (const target of targets) {
        delete target.profile;
      }
    }

    this.deps.setSessionStatus("comparing", `正在比较 ${targets.length} 位候选人。`);
    this.deps.emitSessionEvent("compare_started", `开始 compare ${targets.length} 位候选人。`, {
      candidateIds: targets.map((target: any) => target.personId),
      total: targets.length
    });

    this.deps.applySessionState(addCompareCandidates(this.deps.getSessionState(), targets));
    await this.deps.profileManager.ensureProfiles(targets, conditions, options.loadingMessage);
    const prepared = await this.deps.tools.prepareComparison({
      targets,
      allCandidates
    });
    const comparisonEntries = prepared.entries;
    const comparisonResult = this.deps.decorateComparisonResult((prepared.result ?? {
      entries: comparisonEntries,
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "我还没有足够证据推荐单一候选人。",
        rationale: "当前 compare 结果缺少结构化 outcome。",
        largestUncertainty: "compare outcome 缺失。"
      }
    }) as ComparisonResult, conditions);

    const sessionState = this.deps.getSessionState();
    this.deps.applySessionState(setRecoveryState(sessionState, {
      ...sessionState.recoveryState,
      compareSuggestedRefinement: buildCompareSuggestedRefinement(comparisonResult, conditions)
    }));
    this.deps.applySessionState(setConfidenceStatus(
      this.deps.getSessionState(),
      comparisonResult.outcome.confidence
    ));
    this.deps.applySessionState(setOpenUncertainties(this.deps.getSessionState(), [
      comparisonResult.outcome.largestUncertainty
    ]));
    if (
      comparisonResult.outcome.recommendedCandidateId
      && comparisonResult.outcome.recommendationMode !== "no-recommendation"
    ) {
      const targetRecommendation = targets.find(
        (candidate: any) => candidate.personId === comparisonResult.outcome.recommendedCandidateId
      );
      if (targetRecommendation) {
        const recommendation = setRecommendedCandidate(this.deps.getSessionState(), targetRecommendation, {
          rationale: comparisonResult.outcome.rationale
        });
        this.deps.applySessionState(recommendation.state);
      }
    }
    console.log(this.deps.renderer.renderComparison(comparisonResult, conditions));

    // Show guide hint for decision complete if clear recommendation
    if (comparisonResult.outcome.recommendationMode === "clear-recommendation" && comparisonResult.outcome.recommendedCandidateId) {
      const recommendedCandidate = targets.find((t: any) => t.personId === comparisonResult.outcome.recommendedCandidateId);
      if (recommendedCandidate) {
        const decisionHint = getGuideHint("decision_complete", { candidateName: recommendedCandidate.name });
        if (decisionHint) {
          console.log(chalk.dim(`💡 ${decisionHint.text}`));
        }
      }
    }

    this.deps.setSessionStatus("waiting-input", "compare 已完成，等待下一步操作。");
    this.deps.tui.renderShellHeader({
      stage: "compare",
      contextBar: {
        stageLabel: "对比决策",
        summary: `正在比较 ${targets.length} 位候选人`,
        nextActionTitle: comparisonResult.outcome.recommendationMode === "no-recommendation" ? "调整条件" : "确认推荐",
        blocked: false
      }
    });

    while (true) {
      const action = await this.deps.tui.promptCompareAction({
        stageLabel: "对比决策",
        summary: `正在比较 ${targets.length} 位候选人`,
        nextActionTitle: comparisonResult.outcome.recommendationMode === "no-recommendation" ? "调整条件" : "确认推荐",
        blocked: false
      });
      let resolvedAction = action;

      if (isCommandAction(action)) {
        if (action.type === "immediate") {
          if (action.command === "quit") {
            return "quit";
          }
          if (action.command === "help") {
            this.deps.tui.displayCommandPalette("compare");
            continue;
          }
          if (action.command === "memory") {
            if (this.deps.runMemoryOverlay) {
              await this.deps.runMemoryOverlay();
              console.log(this.deps.renderer.renderComparison(comparisonResult, conditions));
              this.deps.tui.renderShellHeader({
                stage: "compare",
                contextBar: {
                  stageLabel: "对比决策",
                  summary: `正在比较 ${targets.length} 位候选人`,
                  nextActionTitle: comparisonResult.outcome.recommendationMode === "no-recommendation" ? "调整条件" : "确认推荐",
                  blocked: false
                }
              });
            } else {
              console.log(chalk.yellow("\n/memory 暂时不可用。"));
            }
            continue;
          }
          const globalOutcome = this.resolveGlobalCommand(action.command, action.args);
          if (globalOutcome) {
            return globalOutcome;
          }
          continue;
        }

        if (action.type === "unknown") {
          console.log(chalk.yellow(`\n未识别的命令：/${action.name}`));
          this.deps.tui.displayCommandPalette("compare");
          continue;
        }

        if (action.command === "back" || action.command === "clear" || action.command === "refine") {
          resolvedAction = action.command;
        } else {
          const globalOutcome = this.resolveGlobalCommand(action.command, action.args);
          if (globalOutcome) {
            return globalOutcome;
          }
          console.log(chalk.yellow(`\n/${action.command} 当前视图暂不支持。`));
          continue;
        }
      }

      if (resolvedAction === "back") {
        return "back";
      }

      if (resolvedAction === "clear") {
        this.deps.applySessionState(clearCompareSet(this.deps.getSessionState()));
        this.deps.tui.displayPoolCleared();
        return "clear";
      }

      if (resolvedAction === "quit") {
        return "quit";
      }

      if (resolvedAction === "refine") {
        const prompt = await this.deps.chat.askFreeform(
          this.deps.buildCompareRefinePrompt(conditions)
        );
        if (!prompt) {
          continue;
        }

        return {
          type: "refine",
          prompt
        };
      }
    }
  }

  private resolveGlobalCommand(command: string, args = ""): CompareLoopOutcome | null {
    if (command === "new" || command === "tasks") {
      return command;
    }
    if (command === "task" || command === "workboard" || command === "transcript") {
      return { type: "globalCommand", command, args };
    }
    return null;
  }
}
