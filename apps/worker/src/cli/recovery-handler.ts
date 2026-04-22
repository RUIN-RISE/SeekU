import { createHash, randomUUID } from "node:crypto";
import chalk from "chalk";
import type { Person, EvidenceItem, SearchDocument } from "@seeku/db";
import { classifyMatchStrength } from "@seeku/shared";
import {
  type RecoveryPromptKind,
  decideRecoveryActionV2
} from "./agent-policy.js";
import type { AgentSessionState } from "./agent-state.js";
import type { AgentSessionWhyCode } from "./session-runtime-types.js";
import {
  recordClarification,
  resetRecoveryState,
  setOpenUncertainties,
  setConfidenceStatus,
  setRecoveryState
} from "./agent-state.js";
import { normalizeConditions, buildEffectiveQuery, formatConditionsAsPrompt } from "./search-conditions.js";
import { truncateForDisplay } from "./comparison-formatters.js";
import {
  buildSearchAttemptReport,
  type SearchAttemptReport
} from "./search-attempt-report.js";
import {
  buildSearchFailureReport,
  toLegacyRecoveryAssessment,
  type SearchFailureReport
} from "./search-failure-report.js";
import {
  buildRecoveryBoundaryHint,
  buildRecoveryBoundaryRefinePrompt,
  getRecoveryBoundaryDiagnosticCode,
  type RecoveryBoundaryDiagnosticCode
} from "./recovery-boundary.js";
import type { HydratedCandidate, SearchExecutionDiagnostics } from "./search-executor.js";
import { contextHasTermValue, buildSearchStateContextValue } from "./search-context-helpers.js";
import type {
  SearchConditions,
  RecoveryDiagnosis
} from "./types.js";
import type { ConditionRevisionService } from "./condition-revision-service.js";
import type { ComparisonResult } from "./types.js";
import { buildResultWarning } from "./result-warning.js";

interface SearchRecoveryAssessment {
  usable: boolean;
  diagnosis?: RecoveryDiagnosis;
  rationale?: string;
  weakCandidateCount: number;
  canEmitLowConfidenceShortlist: boolean;
}

interface SearchRecoveryAnalysis {
  attemptReport: SearchAttemptReport;
  failureReport: SearchFailureReport;
  assessment: SearchRecoveryAssessment;
}

export interface SearchRecoveryHandlingResult {
  type: "continue" | "retry" | "low_confidence_shortlist" | "stop";
  conditions?: SearchConditions;
  candidates?: HydratedCandidate[];
  resultWarning?: string;
  uncertaintySummary?: string;
}

interface RecoveryStateOverrides {
  diagnosis?: RecoveryDiagnosis;
  rationale?: string;
  boundaryDiagnosticCode?: RecoveryBoundaryDiagnosticCode;
  lowConfidenceEmitted?: boolean;
  clarificationCount?: number;
  rewriteCount?: number;
  lastRewrittenQuery?: string;
  compareSuggestedRefinement?: string;
}

function joinRecoveryMessages(...messages: Array<string | undefined | null>): string | undefined {
  const nonEmpty = messages.filter((msg): msg is string => Boolean(msg?.trim()));
  if (nonEmpty.length === 0) {
    return undefined;
  }
  return nonEmpty.join(" ");
}

function truncateDisplayValue(text: string, maxLength: number): string {
  return truncateForDisplay(text, maxLength);
}

export interface RecoveryHandlerDependencies {
  conditionRevisionService: ConditionRevisionService;
  chat: {
    askFreeform(prompt: string): Promise<string | null>;
    reviseConditions(
      conditions: SearchConditions,
      prompt: string,
      mode?: "tighten" | "relax" | "edit",
      options?: { shortlist?: any[] }
    ): Promise<SearchConditions>;
  };
  spinner: {
    start(text?: string): void;
    stop(): void;
  };
  scorer: { calculateExperienceMatch(person: any, evidence: any[], conditions: SearchConditions): number };
  getSessionState: () => AgentSessionState;
  applySessionState: (next: AgentSessionState) => void;
  setSessionStatus: (status: string, summary?: string | null, why?: { primaryWhyCode?: AgentSessionWhyCode; whySummary?: string | null }) => void;
  appendTranscriptEntry: (role: string, content: string) => void;
  getSessionId: () => string;
}

export class RecoveryHandler {
  constructor(private deps: RecoveryHandlerDependencies) {}

  analyzeSearchRecovery(
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    searchDiagnostics?: SearchExecutionDiagnostics
  ): SearchRecoveryAnalysis {
    const sessionState = this.deps.getSessionState();
    const currentRecovery = sessionState.recoveryState;
    const now = new Date();
    const retrievalDiagnostics = this.buildAttemptRetrievalDiagnostics(candidates.length, searchDiagnostics);

    const attemptReport = buildSearchAttemptReport({
      sessionId: this.deps.getSessionId(),
      attemptId: randomUUID(),
      attemptOrdinal: sessionState.searchHistory.length + 1,
      trigger:
        currentRecovery.rewriteCount > 0
          ? "post_rewrite"
          : currentRecovery.clarificationCount > 0
            ? "post_clarification"
            : "initial_search",
      startedAt: now,
      completedAt: now,
      rawUserGoal: sessionState.userGoal ?? undefined,
      effectiveQuery: buildEffectiveQuery(conditions) || formatConditionsAsPrompt(conditions),
      rewrittenFromQuery: currentRecovery.lastRewrittenQuery,
      conditions,
      candidates,
      recoveryState: {
        clarificationCount: currentRecovery.clarificationCount,
        rewriteCount: currentRecovery.rewriteCount
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      },
      anchorResolution: this.resolveAnchorResolution(conditions, candidates),
      retrievalDiagnostics
    });
    const failureReport = buildSearchFailureReport({
      attempt: attemptReport,
      generatedAt: now
    });

    return {
      attemptReport,
      failureReport,
      assessment: toLegacyRecoveryAssessment(attemptReport, failureReport)
    };
  }

  buildAttemptRetrievalDiagnostics(
    candidateCount: number,
    baseDiagnostics?: SearchExecutionDiagnostics
  ): SearchExecutionDiagnostics | undefined {
    if (!baseDiagnostics) {
      return undefined;
    }

    const dropoff = baseDiagnostics.filterDropoff;
    const dropoffValues = Object.values(dropoff?.dropoffByFilter ?? {});
    const hasDropoff = dropoffValues.some((count) => (count ?? 0) > 0);
    const unrestrictedRetrievedCount = baseDiagnostics.sourceCounterfactual?.unrestrictedRetrievedCount;
    const supportingSignals: string[] = [];

    if (candidateCount === 0) {
      if (!hasDropoff) {
        supportingSignals.push("no dominant hard-filter dropoff detected");
      }
      if (unrestrictedRetrievedCount === 0) {
        supportingSignals.push("unrestricted retrieval also returned zero candidates");
      }
      if (dropoff?.status === "unavailable") {
        supportingSignals.push("post-retrieval dropoff attribution unavailable");
      }
    }

    return {
      ...baseDiagnostics,
      corpusCoverage: {
        status: "available",
        suspectedGap: candidateCount < 3 && (unrestrictedRetrievedCount ?? 0) < 5,
        supportingSignals
      }
    };
  }

  resolveAnchorResolution(
    conditions: SearchConditions,
    candidates: HydratedCandidate[]
  ): {
    status: "resolved" | "not_found" | "ambiguous" | "not_attempted";
    resolvedPersonId?: string;
    failureReason?: string;
  } | undefined {
    const anchor = conditions.candidateAnchor;
    if (!anchor) {
      return undefined;
    }

    if (anchor.personId?.trim()) {
      return {
        status: "resolved",
        resolvedPersonId: anchor.personId.trim()
      };
    }

    const sessionState = this.deps.getSessionState();
    const pools = [
      ...sessionState.currentShortlist,
      ...sessionState.activeCompareSet,
      ...candidates
    ];

    if (typeof anchor.shortlistIndex === "number" && anchor.shortlistIndex > 0) {
      const shortlistCandidate = sessionState.currentShortlist[anchor.shortlistIndex - 1] as HydratedCandidate | undefined;
      if (shortlistCandidate) {
        return {
          status: "resolved",
          resolvedPersonId: shortlistCandidate.personId
        };
      }
    }

    if (anchor.name?.trim()) {
      const normalizedName = anchor.name.trim().toLowerCase();
      const matches = pools.filter((candidate) => candidate.name.trim().toLowerCase() === normalizedName);
      if (matches.length === 1) {
        return {
          status: "resolved",
          resolvedPersonId: matches[0].personId
        };
      }

      if (matches.length > 1) {
        return {
          status: "ambiguous",
          failureReason: `multiple candidates matched anchor name: ${anchor.name.trim()}`
        };
      }

      return {
        status: "not_found",
        failureReason: `anchor name not found in available candidate context: ${anchor.name.trim()}`
      };
    }

    return {
      status: "not_found",
      failureReason: "anchor was provided without a resolvable personId, shortlist index, or name"
    };
  }

  applyBoundaryContextToComparisonResult(
    comparisonResult: ComparisonResult,
    conditions: SearchConditions
  ): ComparisonResult {
    const sessionState = this.deps.getSessionState();
    const boundaryDiagnosticCode = sessionState.recoveryState.boundaryDiagnosticCode;
    if (!boundaryDiagnosticCode) {
      return comparisonResult;
    }

    const shouldAugment =
      comparisonResult.outcome.confidence === "low-confidence"
      || comparisonResult.outcome.recommendationMode === "no-recommendation";

    if (!shouldAugment) {
      return comparisonResult;
    }

    const boundaryHint = buildRecoveryBoundaryHint(boundaryDiagnosticCode);
    const largestUncertainty = joinRecoveryMessages(
      comparisonResult.outcome.largestUncertainty,
      boundaryHint
    ) ?? comparisonResult.outcome.largestUncertainty;
    const suggestedRefinement = joinRecoveryMessages(
      comparisonResult.outcome.suggestedRefinement,
      this.buildRecoveryRefinePrompt(conditions, boundaryDiagnosticCode)
    ) ?? comparisonResult.outcome.suggestedRefinement;

    return {
      ...comparisonResult,
      outcome: {
        ...comparisonResult.outcome,
        largestUncertainty,
        suggestedRefinement
      }
    };
  }

  async handleSearchRecovery(
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    effectiveQuery: string,
    searchDiagnostics?: SearchExecutionDiagnostics
  ): Promise<SearchRecoveryHandlingResult> {
    const analysis = this.analyzeSearchRecovery(candidates, conditions, searchDiagnostics);
    const { assessment, failureReport, attemptReport } = analysis;
    if (assessment.usable) {
      let nextState = resetRecoveryState(this.deps.getSessionState());
      nextState = setOpenUncertainties(nextState, []);
      this.deps.applySessionState(nextState);
      return {
        type: "continue",
        candidates,
        resultWarning: buildResultWarning(candidates)
      };
    }

    const sessionState = this.deps.getSessionState();
    const currentRecovery = sessionState.recoveryState;
    const diagnosis = assessment.diagnosis ?? "retrieval_failed";
    const boundaryDiagnosticCode = getRecoveryBoundaryDiagnosticCode(failureReport);
    const boundaryHint = buildRecoveryBoundaryHint(boundaryDiagnosticCode);
    const diagnosisSummary = joinRecoveryMessages(assessment.rationale, boundaryHint);
    const diagnosingState = this.transitionRecoveryPhase("diagnosing", {
      overrides: {
        diagnosis,
        rationale: diagnosisSummary ?? assessment.rationale,
        boundaryDiagnosticCode
      },
      uncertaintySummary: diagnosisSummary,
      summary: diagnosisSummary || "正在判断为什么这轮结果不够理想。"
    });

    const decision = decideRecoveryActionV2({
      attempt: attemptReport,
      failure: failureReport
    });
    console.log(chalk.dim(decision.rationale));

    if (decision.action === "clarify") {
      const prompt = this.buildRecoveryClarificationPrompt(conditions, decision.promptKind);
      const clarifyWhyCode: AgentSessionWhyCode = decision.promptKind === "role"
        ? "recovery_clarify_role"
        : decision.promptKind === "skill"
          ? "recovery_clarify_skill"
          : "recovery_clarify_anchor";
      this.transitionRecoveryPhase("clarifying", {
        overrides: {
          ...diagnosingState
        },
        uncertaintySummary: joinRecoveryMessages("我还缺一个关键约束，先补一句再重试。", boundaryHint),
        summary: "我还缺一个关键约束，先问你一句。",
        why: { primaryWhyCode: clarifyWhyCode, whySummary: "缺少关键约束，需要用户补充后再重试。" }
      });
      const instruction = await this.deps.chat.askFreeform(prompt);

      if (!instruction) {
        if (assessment.canEmitLowConfidenceShortlist) {
          this.transitionRecoveryPhase("low_confidence_shortlist", {
            overrides: {
              ...diagnosingState,
              lowConfidenceEmitted: true
            },
            uncertaintySummary: joinRecoveryMessages(
              "没有补充新的关键约束，因此当前只能提供低置信 shortlist。",
              boundaryHint
            ),
            summary: "当前是低置信 shortlist，只适合先看，不适合直接推荐。",
            why: { primaryWhyCode: "low_confidence_shortlist", whySummary: "未补充关键约束，只能提供低置信 shortlist。" }
          });
          this.deps.applySessionState(setConfidenceStatus(this.deps.getSessionState(), {
            level: "low",
            rationale: "recovery clarification skipped",
            updatedAt: new Date()
          }));
          return {
            type: "low_confidence_shortlist",
            candidates,
            resultWarning: "这是低置信 shortlist：先给你一组可先看的人，但我还不能直接推荐。",
            uncertaintySummary: joinRecoveryMessages(
              "我还缺一个关键约束，所以这轮只能给低置信 shortlist。",
              boundaryHint
            )
          };
        }

        this.transitionRecoveryPhase("exhausted", {
          overrides: {
            ...diagnosingState
          },
          uncertaintySummary: joinRecoveryMessages(
            "没有补充新的关键约束，因此当前无法继续恢复。",
            boundaryHint
          ),
          summary: "没有补充新的关键约束，因此当前无法继续恢复。",
          why: { primaryWhyCode: "recovery_budget_exhausted", whySummary: "Recovery budget 已用完，无法继续恢复。" }
        });
        return { type: "stop" };
      }

      this.deps.appendTranscriptEntry("user", instruction);
      const revisedConditions = await this.deps.conditionRevisionService.revise(conditions, instruction, candidates);
      this.transitionRecoveryPhase("idle", {
        overrides: {
          ...diagnosingState,
          clarificationCount: currentRecovery.clarificationCount + 1
        },
        uncertaintySummary: "已补充关键约束，重新搜索。"
      });
      this.deps.setSessionStatus("searching", "已补充关键约束，正在重新搜索。", { primaryWhyCode: "recovery_rewrite", whySummary: "已补充关键约束，准备重新搜索。" });
      return {
        type: "retry",
        conditions: revisedConditions
      };
    }

    if (decision.action === "rewrite") {
      this.transitionRecoveryPhase("rewriting", {
        overrides: {
          ...diagnosingState
        },
        uncertaintySummary: joinRecoveryMessages(decision.rationale, boundaryHint),
        summary: decision.rationale
      });
      const rewrittenConditions = await this.rewriteConditionsForRecovery(conditions, candidates);
      const rewrittenQuery = buildEffectiveQuery(rewrittenConditions) || effectiveQuery;
      this.transitionRecoveryPhase("idle", {
        overrides: {
          ...diagnosingState,
          rewriteCount: currentRecovery.rewriteCount + 1,
          lastRewrittenQuery: rewrittenQuery
        },
        uncertaintySummary: joinRecoveryMessages(
          `我把检索表达收敛成更明确的版本后再试一轮：${truncateDisplayValue(rewrittenQuery, 48)}`,
          boundaryHint
        )
      });
      this.deps.setSessionStatus("searching", "已收敛检索表达，正在重新搜索。", { primaryWhyCode: "recovery_rewrite", whySummary: "已收敛检索表达，准备重新搜索。" });
      return {
        type: "retry",
        conditions: rewrittenConditions
      };
    }

    if (decision.action === "low_confidence_shortlist" && assessment.canEmitLowConfidenceShortlist) {
      const uncertaintySummary = joinRecoveryMessages(
        decision.targetFailureCode?.startsWith("intent_")
          ? "当前还有关键约束没补全，所以这份 shortlist 只能低置信参考。"
          : "我已经自动重试过一轮，但这批人仍然只够低置信参考。",
        boundaryHint
      );
      this.transitionRecoveryPhase("low_confidence_shortlist", {
        overrides: {
          ...diagnosingState,
          lowConfidenceEmitted: true
        },
        uncertaintySummary,
        summary: "当前是低置信 shortlist，只适合先看，不适合直接推荐。",
        why: { primaryWhyCode: "low_confidence_shortlist", whySummary: "当前结果置信度不足，只能提供参考 shortlist。" }
      });
      this.deps.applySessionState(setConfidenceStatus(this.deps.getSessionState(), {
        level: "low",
        rationale: diagnosis,
        updatedAt: new Date()
      }));
      return {
        type: "low_confidence_shortlist",
        candidates,
        resultWarning: "这是低置信 shortlist：先给你一组可先看的人，但我还不能直接推荐。",
        uncertaintySummary
      };
    }

    this.transitionRecoveryPhase("exhausted", {
      overrides: {
        ...diagnosingState
      },
      uncertaintySummary: joinRecoveryMessages(
        "这轮 recovery 已经用完，但仍没有形成可用 shortlist。",
        boundaryHint
      ),
      summary: "这轮 recovery 已用完，但仍没有形成可用 shortlist。",
      why: { primaryWhyCode: "recovery_budget_exhausted", whySummary: "Recovery budget 已用完，仍没有形成可用 shortlist。" }
    });
    return { type: "stop" };
  }

  buildRecoveryClarificationPrompt(
    conditions: SearchConditions,
    promptKind: RecoveryPromptKind = "generic"
  ): string {
    if (promptKind === "anchor") {
      const anchorName = conditions.candidateAnchor?.name || conditions.candidateAnchor?.personId || "这个参照人";
      return `你提到的参照对象"${anchorName}"我没法稳定识别。换一个参照人，或者直接描述你要找的人。`;
    }

    if (promptKind === "role") {
      return "我现在缺少最核心的角色方向。补一句：你最想找的是哪类人？";
    }

    if (promptKind === "skill") {
      return "我现在缺少必须技术或领域主轴。补一句你最不能妥协的技术/方向。";
    }

    if (!conditions.role && !conditions.candidateAnchor?.personId && !conditions.candidateAnchor?.name) {
      return "我现在缺少最核心的角色方向。补一句：你最想找的是哪类人？";
    }

    if (conditions.skills.length === 0 && conditions.mustHave.length === 0) {
      return "我现在缺少必须技术或领域主轴。补一句你最不能妥协的技术/方向。";
    }

    if (conditions.locations.length === 0) {
      return "如果地点是硬约束，补一句目标地点；如果不是，回我\"不限\"。";
    }

    return "补一句你这轮最不能妥协的必须项，我再重试一轮。";
  }

  buildRecoveryRefinePrompt(
    conditions: SearchConditions,
    boundaryDiagnosticCode?: RecoveryBoundaryDiagnosticCode
  ): string {
    const boundaryPrompt = buildRecoveryBoundaryRefinePrompt(
      boundaryDiagnosticCode,
      conditions
    );
    if (boundaryPrompt) {
      return boundaryPrompt;
    }

    return "想怎么调整这轮搜索？例如：去掉销售 / 更看重最近活跃 / 更偏 Bonjour";
  }

  buildShortlistRefinePrompt(
    conditions: SearchConditions,
    subjectName?: string
  ): string {
    const sessionState = this.deps.getSessionState();
    const compareSuggestedRefinement = sessionState.recoveryState.compareSuggestedRefinement?.trim();
    if (compareSuggestedRefinement) {
      return subjectName
        ? `想基于 ${subjectName} 继续收敛？${compareSuggestedRefinement}`
        : compareSuggestedRefinement;
    }

    const boundaryDiagnosticCode = sessionState.recoveryState.phase === "low_confidence_shortlist"
      ? sessionState.recoveryState.boundaryDiagnosticCode
      : undefined;
    const basePrompt = this.buildRecoveryRefinePrompt(conditions, boundaryDiagnosticCode);

    if (!subjectName || !boundaryDiagnosticCode) {
      return basePrompt;
    }

    return `想基于 ${subjectName} 继续收敛？${basePrompt}`;
  }

  buildCompareRefinePrompt(
    conditions: SearchConditions
  ): string {
    const sessionState = this.deps.getSessionState();
    const compareSuggestedRefinement = sessionState.recoveryState.compareSuggestedRefinement?.trim();
    if (compareSuggestedRefinement) {
      return `当前 compare 还不够稳。${compareSuggestedRefinement}`;
    }

    return this.buildRecoveryRefinePrompt(
      conditions,
      sessionState.recoveryState.boundaryDiagnosticCode
    ) ?? "想怎么继续 refine？例如：去掉销售 / 更看重最近活跃 / 更偏后端。";
  }

  private async rewriteConditionsForRecovery(
    conditions: SearchConditions,
    candidates: HydratedCandidate[] = []
  ): Promise<SearchConditions> {
    this.deps.spinner.start("正在自动收敛检索表达...");
    try {
      return normalizeConditions(
        await this.deps.chat.reviseConditions(
          conditions,
          "不要改变用户显式 must-have / exclude / sourceBias 的前提下，把这轮搜索条件改写成更利于召回正确候选人的版本。收紧角色主轴，补全显式技能表述，去掉空泛表述，但不要发明新的用户约束。",
          "tighten",
          { shortlist: candidates.map((c) => ({ personId: c.personId, name: c.name, headline: c.headline, matchReasons: c.queryReasons, document: c._hydrated.document })) }
        )
      );
    } finally {
      this.deps.spinner.stop();
    }
  }

  private applyRecoveryStateWithUncertainty(
    overrides: Partial<RecoveryStateOverrides>,
    uncertaintySummary?: string | null
  ): Partial<RecoveryStateOverrides> {
    const state = this.deps.getSessionState();
    const nextRecoveryState: Record<string, unknown> = {
      ...state.recoveryState,
      ...overrides
    };
    if (uncertaintySummary?.trim()) {
      this.deps.applySessionState(setOpenUncertainties(state, [uncertaintySummary]));
    }
    return nextRecoveryState as Partial<RecoveryStateOverrides>;
  }

  private transitionRecoveryPhase(
    phase: string,
    options: {
      overrides?: Partial<RecoveryStateOverrides>;
      uncertaintySummary?: string | null;
      summary?: string;
      why?: { primaryWhyCode?: AgentSessionWhyCode; whySummary?: string | null };
    }
  ): Partial<RecoveryStateOverrides> {
    const state = this.deps.getSessionState();
    const overrides = options.overrides ?? {};
    const nextRecoveryState = {
      ...state.recoveryState,
      phase,
      ...overrides
    };
    const nextState = setRecoveryState(state, nextRecoveryState as any);
    this.deps.applySessionState(nextState);
    if (options.summary) {
      this.deps.setSessionStatus("recovering", options.summary, options.why);
    }
    if (options.uncertaintySummary?.trim()) {
      this.deps.applySessionState(setOpenUncertainties(this.deps.getSessionState(), [options.uncertaintySummary]));
    }
    return overrides;
  }
}
