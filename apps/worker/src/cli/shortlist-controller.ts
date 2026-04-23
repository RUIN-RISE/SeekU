import chalk from "chalk";
import {
  type SortMode,
  type ShortlistStatusMessage,
  type ResultListCommand,
  type ComparisonEntry,
  type ExportCandidateRecord,
  type SearchConditions
} from "./types.js";
import type { HydratedCandidate } from "./search-executor.js";
import type { AgentSessionState } from "./agent-state.js";
import {
  addCompareCandidates,
  removeCompareCandidates,
  clearCompareSet,
  setSessionShortlist,
  rewindSearchHistory
} from "./agent-state.js";
import { formatConditionsAsPrompt } from "./search-conditions.js";
import { buildComparisonEvidence } from "./comparison-formatters.js";
import { buildResultWarning } from "./result-warning.js";
import type { CompareLoopOutcome } from "./comparison-controller.js";
import type { UserMemoryStore } from "./user-memory-store.js";

interface SearchLoopOutcome {
  type: "refine" | "restart" | "quit" | "restore";
  prompt?: string;
  conditions?: SearchConditions;
}

import type { CommandAction } from "./command-router.js";

interface DetailOutcome {
  type: "back" | "refine" | "quit";
  prompt?: string;
}

export interface ShortlistControllerDependencies {
  tui: {
    displayShortlist(candidates: HydratedCandidate[], conditions: SearchConditions, options: any): void;
    resetShortlistViewport(): void;
    displayHelp(): void;
    displayPoolEmpty(): void;
    displayPool(pool: HydratedCandidate[]): void;
    displayFilters(conditions: SearchConditions): void;
    displayExportEmpty(target: string): void;
    displayExportSuccess(artifact: any): void;
    displayUndo(entry: SearchConditions | null): void;
    displayHistory(history: any[]): void;
    promptShortlistAction(options: any): Promise<ResultListCommand>;
    promptDetailAction(name: string, contextBar?: any): Promise<string | CommandAction>;
    renderShellHeader(args: { stage: string; taskTitle?: string; status?: string; contextBar?: any }): void;
  };
  chat: {
    askFreeform(prompt: string): Promise<string | null>;
  };
  renderer: {
    renderProfile(person: any, evidence: any, profile: any, matchReason: any, options: any): string;
    renderWhyMatched(candidate: any, profile: any, conditions: SearchConditions, options?: any): string;
  };
  exporter: {
    export(args: any): Promise<any>;
  };
  comparisonController: {
    presentComparison(
      targets: HydratedCandidate[],
      allCandidates: HydratedCandidate[],
      conditions: SearchConditions,
      options: any
    ): Promise<CompareLoopOutcome | "quit">;
  };
  profileManager: {
    ensureProfiles(candidates: HydratedCandidate[], conditions: SearchConditions, message: string): Promise<void>;
    loadProfileForCandidate(candidate: HydratedCandidate, conditions: SearchConditions): Promise<any>;
  };
  searchExecutor: {
    refreshCandidateQueryExplanation(candidate: HydratedCandidate, conditions: SearchConditions): void;
    applySearchStateOrdering(candidates: HydratedCandidate[], conditions: SearchConditions): HydratedCandidate[];
  };
  recoveryHandler: {
    buildShortlistRefinePrompt(conditions: SearchConditions, name?: string): string;
  };
  scorer: {
    scoreRerankCandidate(sortMode: SortMode, candidate: HydratedCandidate, evidence: any[]): number;
    scoreFreshness(candidate: HydratedCandidate): number;
    scoreSourcePriority(candidate: HydratedCandidate): number;
    scoreEvidenceStrength(evidence: any[]): number;
    normalizeMatchScore(score: number): number;
  };
  tools: {
    prepareComparison(args: any): Promise<{ entries: ComparisonEntry[] }>;
  };
  getSessionState: () => AgentSessionState;
  applySessionState: (next: AgentSessionState) => void;
  memoryStore?: UserMemoryStore;
}

export class ShortlistController {
  constructor(private deps: ShortlistControllerDependencies) {}

  get comparePool(): HydratedCandidate[] {
    return this.deps.getSessionState().activeCompareSet as HydratedCandidate[];
  }

  get searchHistory(): Array<{ conditions: SearchConditions }> {
    return this.deps.getSessionState().searchHistory;
  }

  async runShortlistLoop(
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    initialSortMode: SortMode,
    presentation?: {
      lowConfidence: boolean;
      resultWarning?: string;
      uncertaintySummary?: string;
    }
  ): Promise<SearchLoopOutcome> {
    let sortMode = initialSortMode;
    let visibleCount = Math.min(5, candidates.length);
    let selectedIndex = 0;
    const resultWarning = presentation?.resultWarning ?? buildResultWarning(candidates);
    let statusMessage: ShortlistStatusMessage | undefined;
    let reuseViewport = false;

    await this.sortCandidates(candidates, sortMode, conditions);

    while (true) {
      this.deps.tui.displayShortlist(candidates, conditions, {
        sortMode,
        showingCount: visibleCount,
        totalCount: candidates.length,
        poolCount: this.comparePool.length,
        poolPersonIds: this.comparePool.map((candidate) => candidate.personId),
        selectedIndex,
        resultWarning,
        lowConfidence: presentation?.lowConfidence,
        uncertaintySummary: presentation?.uncertaintySummary,
        statusMessage,
        reuseViewport
      });

      const command = await this.deps.tui.promptShortlistAction({
        selectedIndex,
        showingCount: visibleCount
      });
      const outcome = await this.handleShortlistCommand(command, candidates, conditions, {
        sortMode,
        visibleCount,
        selectedIndex
      });

      if (outcome.type === "continue") {
        sortMode = outcome.sortMode;
        visibleCount = outcome.visibleCount;
        selectedIndex = outcome.selectedIndex;
        statusMessage = outcome.statusMessage;
        reuseViewport = outcome.reuseViewport;
        continue;
      }

      this.deps.tui.resetShortlistViewport();
      return outcome.result;
    }
  }

  async handleShortlistCommand(
    command: ResultListCommand,
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    state: { sortMode: SortMode; visibleCount: number; selectedIndex: number }
  ): Promise<
    | {
      type: "continue";
      sortMode: SortMode;
      visibleCount: number;
      selectedIndex: number;
      statusMessage?: ShortlistStatusMessage;
      reuseViewport: boolean;
    }
    | { type: "done"; result: SearchLoopOutcome }
  > {
    const continueWith = (overrides: Partial<{
      sortMode: SortMode;
      visibleCount: number;
      selectedIndex: number;
      statusMessage?: ShortlistStatusMessage;
      reuseViewport: boolean;
    }> = {}) => ({
      type: "continue" as const,
      sortMode: overrides.sortMode ?? state.sortMode,
      visibleCount: overrides.visibleCount ?? state.visibleCount,
      selectedIndex: overrides.selectedIndex ?? state.selectedIndex,
      statusMessage: overrides.statusMessage,
      reuseViewport: overrides.reuseViewport ?? false
    });

    if (command.type === "help") {
      this.deps.tui.resetShortlistViewport();
      this.deps.tui.displayHelp();
      return continueWith();
    }

    if (command.type === "back") {
      return continueWith({ reuseViewport: true });
    }

    if (command.type === "quit") {
      return { type: "done", result: { type: "quit" } };
    }

    if (command.type === "moveSelection") {
      let nextSelectedIndex = state.selectedIndex;
      if (command.direction === "up") {
        nextSelectedIndex -= 1;
      } else if (command.direction === "down") {
        nextSelectedIndex += 1;
      } else if (command.direction === "top") {
        nextSelectedIndex = 0;
      } else if (command.direction === "bottom") {
        nextSelectedIndex = state.visibleCount - 1;
      } else if (typeof command.direction === "number") {
        nextSelectedIndex += command.direction;
      }

      nextSelectedIndex = Math.max(0, Math.min(nextSelectedIndex, state.visibleCount - 1));
      return continueWith({
        selectedIndex: nextSelectedIndex,
        reuseViewport: true
      });
    }

    if (command.type === "showMore") {
      return continueWith({
        visibleCount: Math.min(state.visibleCount + 5, candidates.length),
        reuseViewport: true
      });
    }

    if (command.type === "refine") {
      this.deps.tui.resetShortlistViewport();
      const prompt = command.prompt || await this.deps.chat.askFreeform(
        this.deps.recoveryHandler.buildShortlistRefinePrompt(conditions)
      );
      if (!prompt) {
        return continueWith();
      }

      return { type: "done", result: { type: "refine", prompt } };
    }

    if (command.type === "sort") {
      const nextSortMode = command.sortMode || "overall";
      await this.sortCandidates(candidates, nextSortMode, conditions);
      return continueWith({
        sortMode: nextSortMode,
        statusMessage: {
          tone: "success",
          text: `✓ 已按${this.getSortModeLabel(nextSortMode)}重排当前 shortlist（rerank-only，不会重新搜索）。`
        },
        reuseViewport: true
      });
    }

    if (command.type === "togglePool") {
      const targets = this.pickCandidates(candidates, command.indexes || []);
      if (targets.length === 0) {
        return continueWith({
          statusMessage: {
            tone: "warning",
            text: "未找到要操作的候选人，请重新选择。"
          },
          reuseViewport: true
        });
      }

      const target = targets[0];
      const wasRemoved = this.removeCandidatesFromPool([target]);
      if (wasRemoved > 0) {
        return continueWith({
          statusMessage: {
            tone: "success",
            text: `✓ ${target.name} 已移出对比池（当前 ${this.comparePool.length} 人）。`
          },
          reuseViewport: true
        });
      }

      this.addCandidatesToPool([target]);
      return continueWith({
        statusMessage: {
          tone: "success",
          text: `✓ ${target.name} 已加入对比池（当前 ${this.comparePool.length} 人）。`
        },
        reuseViewport: true
      });
    }

    if (command.type === "add") {
      const targets = this.pickCandidates(candidates, command.indexes || []);
      if (targets.length === 0) {
        return continueWith({
          statusMessage: {
            tone: "warning",
            text: "未找到要加入对比池的候选人，请重新选择。"
          },
          reuseViewport: true
        });
      }

      const addedCount = this.addCandidatesToPool(targets);
      if (addedCount === 0) {
        return continueWith({
          statusMessage: {
            tone: "info",
            text: `ℹ ${targets[0].name} 已经在对比池里了（当前 ${this.comparePool.length} 人）。`
          },
          reuseViewport: true
        });
      }

      return continueWith({
        statusMessage: {
          tone: "success",
          text: `✓ 已加入 ${addedCount} 位候选人到对比池（当前 ${this.comparePool.length} 人）。`
        },
        reuseViewport: true
      });
    }

    if (command.type === "remove") {
      const targets = this.pickCandidates(candidates, command.indexes || []);
      if (targets.length === 0) {
        return continueWith({
          statusMessage: {
            tone: "warning",
            text: "未找到要移出的候选人，请重新选择。"
          },
          reuseViewport: true
        });
      }

      const removedCount = this.removeCandidatesFromPool(targets);
      if (removedCount === 0) {
        return continueWith({
          statusMessage: {
            tone: "info",
            text: "这些候选人当前不在对比池中。"
          },
          reuseViewport: true
        });
      }

      // Capture optional negative feedback for removed candidates
      await this.captureRemovalFeedback(targets);

      return continueWith({
        statusMessage: {
          tone: "success",
          text: `✓ 已从对比池移出 ${removedCount} 位候选人（当前 ${this.comparePool.length} 人）。`
        },
        reuseViewport: true
      });
    }

    if (command.type === "pool") {
      this.deps.tui.resetShortlistViewport();
      if (this.comparePool.length === 0) {
        this.deps.tui.displayPoolEmpty();
      } else {
        this.deps.tui.displayPool(this.comparePool);
      }
      return continueWith();
    }

    if (command.type === "clear") {
      this.deps.applySessionState(clearCompareSet(this.deps.getSessionState()));
      return continueWith({
        statusMessage: {
          tone: "success",
          text: "✓ 对比池已清空。"
        },
        reuseViewport: true
      });
    }

    if (command.type === "history") {
      this.deps.tui.resetShortlistViewport();
      this.deps.tui.displayHistory(this.deps.getSessionState().searchHistory);
      return continueWith();
    }

    if (command.type === "show") {
      this.deps.tui.resetShortlistViewport();
      this.deps.tui.displayFilters(conditions);
      return continueWith();
    }

    if (command.type === "export") {
      this.deps.tui.resetShortlistViewport();
      const exportTarget = command.exportTarget || "shortlist";
      const exportFormat = command.exportFormat || "md";
      const targets = exportTarget === "pool"
        ? [...this.comparePool]
        : candidates.slice(0, state.visibleCount);

      if (targets.length === 0) {
        this.deps.tui.displayExportEmpty(exportTarget);
        return continueWith();
      }

      for (const target of targets) {
        this.deps.searchExecutor.refreshCandidateQueryExplanation(target, conditions);
      }

      let comparisonEntries: ComparisonEntry[] = [];
      if (exportTarget === "pool" && targets.length >= 2) {
        await this.deps.profileManager.ensureProfiles(targets, conditions, "正在准备对比池导出...");
        const prepared = await this.deps.tools.prepareComparison({
          targets,
          allCandidates: candidates
        });
        comparisonEntries = prepared.entries;
      }

      const artifact = await this.deps.exporter.export({
        format: exportFormat,
        target: exportTarget,
        querySummary: formatConditionsAsPrompt(conditions),
        records: this.buildExportRecords(targets, candidates, comparisonEntries)
      });

      this.deps.tui.displayExportSuccess(artifact);
      return continueWith();
    }

    if (command.type === "undo") {
      if (this.searchHistory.length < 2) {
        this.deps.tui.resetShortlistViewport();
        this.deps.tui.displayUndo(null);
        return continueWith();
      }

      const previousEntry = this.searchHistory[this.searchHistory.length - 2];
      this.deps.tui.resetShortlistViewport();
      this.deps.tui.displayUndo(previousEntry.conditions);

      this.deps.applySessionState(rewindSearchHistory(this.deps.getSessionState(), 2));

      return {
        type: "done",
        result: {
          type: "restore" as const,
          conditions: previousEntry.conditions
        }
      };
    }

    if (command.type === "compare") {
      const usePool = !command.indexes || command.indexes.length < 2;
      const targets = usePool
        ? (this.comparePool.length >= 2 ? this.comparePool : [])
        : this.pickCandidates(candidates, command.indexes || []);

      if (targets.length < 2) {
        return continueWith({
          statusMessage: this.buildCompareNeedsMoreCandidatesMessage(
            usePool ? this.comparePool.length : targets.length
          ),
          reuseViewport: true
        });
      }

      const compareOutcome = await this.deps.comparisonController.presentComparison(targets, candidates, conditions, {
        clearProfilesBeforeCompare: usePool,
        loadingMessage: "正在准备候选人对比..."
      });
      if (compareOutcome === "quit") {
        return { type: "done", result: { type: "quit" } };
      }
      if (typeof compareOutcome !== "string" && compareOutcome.type === "refine") {
        return { type: "done", result: compareOutcome };
      }

      return continueWith();
    }

    if (command.type === "view") {
      const target = this.pickCandidates(candidates, command.indexes || [1])[0];
      if (!target) {
        return continueWith({
          statusMessage: {
            tone: "warning",
            text: "未找到要查看的候选人，请重新选择。"
          },
          reuseViewport: true
        });
      }

      this.deps.tui.resetShortlistViewport();
      const detailOutcome = await this.showCandidateDetail(target, conditions);
      if (detailOutcome.type === "back") {
        return continueWith();
      }

      if (detailOutcome.type === "quit") {
        return { type: "done", result: { type: "quit" } };
      }

      return { type: "done", result: { type: "refine", prompt: detailOutcome.prompt } };
    }

    if (command.type === "open") {
      const target = this.pickCandidates(candidates, command.indexes || [1])[0];
      if (!target) {
        return continueWith({
          statusMessage: {
            tone: "warning",
            text: "未找到要打开的候选人，请重新选择。"
          },
          reuseViewport: true
        });
      }

      return continueWith({
        statusMessage: await this.openCandidateInBrowser(target),
        reuseViewport: true
      });
    }

    return continueWith({
      statusMessage: {
        tone: "warning",
        text: `未识别的输入：${command.type}`
      },
      reuseViewport: true
    });
  }

  async showCandidateDetail(
    selected: HydratedCandidate,
    conditions: SearchConditions
  ): Promise<DetailOutcome> {
    const sessionState = this.deps.getSessionState();
    this.deps.searchExecutor.refreshCandidateQueryExplanation(selected, conditions);
    console.log(chalk.blue(`\n🔍 正在加载 ${selected.name} 的深度画像...`));
    const profile = await this.deps.profileManager.loadProfileForCandidate(selected, conditions);
    if (!profile) {
      return { type: "back" };
    }

    const detailContextBar = {
      stageLabel: "候选人详情",
      summary: `查看 ${selected.name} 的深度画像`,
      nextActionTitle: "返回短名单",
      blocked: false
    };
    this.deps.tui.renderShellHeader({ stage: "detail", taskTitle: selected.name, contextBar: detailContextBar });
    console.log(
      this.deps.renderer.renderProfile(
        selected._hydrated.person,
        selected._hydrated.evidence,
        profile,
        selected.matchReason,
        {
          conditionAudit: selected.conditionAudit,
          queryReasons: selected.queryReasons,
          matchStrength: selected.matchStrength,
          recoveryMode: sessionState.recoveryState.phase === "low_confidence_shortlist" ? "low-confidence" : undefined,
          recoverySummary:
            sessionState.recoveryState.phase === "low_confidence_shortlist"
              ? sessionState.openUncertainties[0]
              : undefined,
          sources: selected.sources,
          bonjourUrl: selected.bonjourUrl,
          primaryLinks: selected.primaryLinks,
          lastSyncedAt: selected.lastSyncedAt,
          latestEvidenceAt: selected.latestEvidenceAt
        }
      )
    );

    while (true) {
      const action = await this.deps.tui.promptDetailAction(selected.name, detailContextBar);

      if (typeof action === "object" && action !== null && "type" in action) {
        const cmd = action as CommandAction;
        if (cmd.type === "immediate" && cmd.command === "quit") {
          return { type: "quit" };
        }
        continue;
      }

      if (action === "back") {
        return { type: "back" };
      }

      if (action === "quit") {
        return { type: "quit" };
      }

      if (action === "open") {
        const message = await this.openCandidateInBrowser(selected);
        const colorize = message.tone === "success"
          ? chalk.green
          : message.tone === "warning"
            ? chalk.yellow
            : chalk.cyan;
        console.log(colorize(`\n${message.text}`));
        continue;
      }

      if (action === "why") {
        console.log(this.deps.renderer.renderWhyMatched(
          selected,
          profile,
          conditions,
          sessionState.recoveryState.phase === "low_confidence_shortlist"
            ? {
                recoveryMode: "low-confidence",
                recoverySummary: sessionState.openUncertainties[0]
              }
            : undefined
        ));
        continue;
      }

      if (action === "refine") {
        const prompt = await this.deps.chat.askFreeform(
          this.deps.recoveryHandler.buildShortlistRefinePrompt(conditions, selected.name)
        );
        if (!prompt) {
          continue;
        }

        return { type: "refine", prompt };
      }
    }
  }

  private getSortModeLabel(sortMode: SortMode): string {
    const labels: Record<SortMode, string> = {
      overall: "综合排序",
      tech: "技术匹配",
      project: "项目深度",
      location: "地点匹配",
      fresh: "新鲜度",
      source: "来源优先级",
      evidence: "证据强度"
    };

    return labels[sortMode];
  }

  addCandidatesToPool(targets: HydratedCandidate[]): number {
    const beforeCount = this.comparePool.length;
    this.deps.applySessionState(addCompareCandidates(this.deps.getSessionState(), targets));
    const addedCount = this.comparePool.length - beforeCount;
    return addedCount;
  }

  removeCandidatesFromPool(targets: HydratedCandidate[]): number {
    const beforeCount = this.comparePool.length;
    this.deps.applySessionState(removeCompareCandidates(
      this.deps.getSessionState(),
      targets.map((target) => target.personId)
    ));
    return beforeCount - this.comparePool.length;
  }

  private buildCompareNeedsMoreCandidatesMessage(poolCount: number): ShortlistStatusMessage {
    if (poolCount <= 0) {
      return {
        tone: "warning",
        text: "对比池为空，先按 space 把候选人加入对比池，再按 c 进入 compare。"
      };
    }

    return {
      tone: "warning",
      text: `当前对比池只有 ${poolCount} 人，决策对比至少需要 2 人。继续按 space 再补一个候选人。`
    };
  }

  private async openCandidateInBrowser(
    candidate: { name: string; bonjourUrl?: string }
  ): Promise<ShortlistStatusMessage> {
    if (!candidate.bonjourUrl) {
      return {
        tone: "warning",
        text: `${candidate.name} 没有 Bonjour 链接。`
      };
    }

    const openCommand = process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

    try {
      const { spawn } = await import("node:child_process");
      spawn(openCommand, [candidate.bonjourUrl], { stdio: "ignore", detached: true });
      return {
        tone: "success",
        text: `✓ 已尝试在浏览器中打开 ${candidate.name} 的 Bonjour 页面。`
      };
    } catch {
      return {
        tone: "warning",
        text: `无法自动打开 Bonjour，请手动访问：${candidate.bonjourUrl}`
      };
    }
  }

  pickCandidates(candidates: HydratedCandidate[], indexes: number[]): HydratedCandidate[] {
    return indexes
      .map((index) => candidates[index - 1])
      .filter((candidate): candidate is HydratedCandidate => Boolean(candidate));
  }

  async sortCandidates(
    candidates: HydratedCandidate[],
    sortMode: SortMode,
    conditions: SearchConditions
  ): Promise<void> {
    if (sortMode === "overall") {
      const ordered = this.deps.searchExecutor.applySearchStateOrdering(candidates, conditions);
      candidates.splice(0, candidates.length, ...ordered);
      this.deps.applySessionState(setSessionShortlist(this.deps.getSessionState(), candidates));
      return;
    }

    if (this.isRerankOnlySortMode(sortMode)) {
      candidates.sort((left, right) => this.compareRerankOnlyCandidates(left, right, sortMode));
      this.deps.applySessionState(setSessionShortlist(this.deps.getSessionState(), candidates));
      return;
    }

    await this.deps.profileManager.ensureProfiles(candidates, conditions, `正在按 ${sortMode} 维度准备排序...`);
    const scoreOf = (candidate: HydratedCandidate) => {
      if (!candidate.profile) {
        return -1;
      }

      if (sortMode === "tech") {
        return candidate.profile.dimensions.techMatch;
      }

      if (sortMode === "project") {
        return candidate.profile.dimensions.projectDepth;
      }

      return candidate.profile.dimensions.locationMatch;
    };

    candidates.sort((left, right) => scoreOf(right) - scoreOf(left));
    this.deps.applySessionState(setSessionShortlist(this.deps.getSessionState(), candidates));
  }

  private isRerankOnlySortMode(
    sortMode: SortMode
  ): sortMode is Extract<SortMode, "fresh" | "source" | "evidence"> {
    return sortMode === "fresh" || sortMode === "source" || sortMode === "evidence";
  }

  private compareRerankOnlyCandidates(
    left: HydratedCandidate,
    right: HydratedCandidate,
    sortMode: Extract<SortMode, "fresh" | "source" | "evidence">
  ): number {
    const compositeDelta =
      this.deps.scorer.scoreRerankCandidate(sortMode, right, right._hydrated.evidence) -
      this.deps.scorer.scoreRerankCandidate(sortMode, left, left._hydrated.evidence);

    if (Math.abs(compositeDelta) > 0.001) {
      return compositeDelta;
    }

    const leftSignals = this.buildRerankSignals(left);
    const rightSignals = this.buildRerankSignals(right);
    const tieBreakerOrder: Record<
      Extract<SortMode, "fresh" | "source" | "evidence">,
      Array<keyof ReturnType<ShortlistController["buildRerankSignals"]>>
    > = {
      fresh: ["fresh", "evidence", "source", "match"],
      source: ["source", "fresh", "evidence", "match"],
      evidence: ["evidence", "fresh", "source", "match"]
    };

    for (const key of tieBreakerOrder[sortMode]) {
      const delta = rightSignals[key] - leftSignals[key];
      if (delta !== 0) {
        return delta;
      }
    }

    return 0;
  }

  private buildRerankSignals(candidate: HydratedCandidate) {
    return {
      fresh: this.deps.scorer.scoreFreshness(candidate),
      source: this.deps.scorer.scoreSourcePriority(candidate),
      evidence: this.deps.scorer.scoreEvidenceStrength(candidate._hydrated.evidence),
      match: this.deps.scorer.normalizeMatchScore(candidate.matchScore)
    };
  }

  private buildExportRecords(
    targets: HydratedCandidate[],
    allCandidates: HydratedCandidate[],
    comparisonEntries: ComparisonEntry[] = []
  ): ExportCandidateRecord[] {
    const comparisonById = new Map(
      comparisonEntries.map((entry) => [entry.candidate.personId, entry])
    );

    return targets.map((candidate) => {
      const shortlistIndex = allCandidates.findIndex((item) => item.personId === candidate.personId);
      const comparisonEntry = comparisonById.get(candidate.personId);
      const freshnessDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;

      return {
        shortlistIndex: shortlistIndex >= 0 ? shortlistIndex + 1 : undefined,
        name: candidate.name,
        headline: candidate.headline,
        location: candidate.location,
        company: candidate.company,
        matchScore: candidate.matchScore,
        source: this.formatExportSource(candidate.sources),
        freshness: freshnessDate ? describeRelativeDate(freshnessDate) : "时间未知",
        bonjourUrl: candidate.bonjourUrl,
        whyMatched: buildFullMatchReason(candidate),
        decisionTag: comparisonEntry?.decisionTag,
        recommendation: comparisonEntry?.recommendation,
        nextStep: comparisonEntry?.nextStep,
        topEvidence: comparisonEntry?.topEvidence || buildComparisonEvidence(candidate._hydrated.evidence)
      };
    });
  }

  private formatExportSource(sources: string[]): string {
    if (!sources || sources.length === 0 || sources[0] === "Unknown") {
      return "来源未知";
    }

    return sources.join(" / ");
  }

  // ============================================================================
  // Feedback Capture
  // ============================================================================

  private async captureRemovalFeedback(targets: HydratedCandidate[]): Promise<void> {
    if (!this.deps.memoryStore) {
      return;
    }

    const { recordCandidateFeedback, promptForFeedbackReason, checkAndApplyInference } = await import("./feedback-capture.js");

    for (const target of targets) {
      const reason = await promptForFeedbackReason(
        target.name || "候选人",
        (prompt) => this.deps.chat.askFreeform(prompt) as Promise<string>
      );
      // Always record the negative feedback event — reason is optional enrichment
      await recordCandidateFeedback({
        memoryStore: this.deps.memoryStore,
        feedback: {
          personId: target.personId,
          sentiment: "negative",
          reasonCode: reason?.reasonCode,
          reasonDetail: reason?.reasonDetail,
          contextSource: "shortlist_remove"
        }
      });
    }

    // Check for inferred preferences after recording feedback
    await checkAndApplyInference(this.deps.memoryStore);
  }
}

function buildFullMatchReason(candidate: { queryReasons?: string[]; matchReason?: string }) {
  if (candidate.queryReasons && candidate.queryReasons.length > 0) {
    return candidate.queryReasons.join("；");
  }

  return candidate.matchReason || "与当前条件整体相关度较高";
}

function describeRelativeDate(date: Date): string {
  const ageInDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageInDays <= 0) {
    return "今天";
  }

  if (ageInDays === 1) {
    return "昨天";
  }

  if (ageInDays <= 7) {
    return `${ageInDays}天前`;
  }

  if (ageInDays <= 30) {
    return `${Math.floor(ageInDays / 7)}周前`;
  }

  if (ageInDays <= 365) {
    return `${Math.floor(ageInDays / 30)}个月前`;
  }

  return `${Math.floor(ageInDays / 365)}年前`;
}
