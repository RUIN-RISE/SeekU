import {
  and,
  eq,
  inArray,
  sql,
  ProfileCacheRepository,
  type Person,
  type EvidenceItem,
  type SeekuDatabase,
  persons,
  searchDocuments,
  evidenceItems,
  sourceProfiles,
  personIdentities,
  type SearchDocument,
  type SourceProfile,
  type PersonIdentity
} from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { QueryPlanner, HybridRetriever, Reranker, type QueryIntent } from "@seeku/search";
import { createHash } from "node:crypto";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import { ChatInterface } from "./chat.js";
import { CLI_CONFIG } from "./config.js";
import { ShortlistExporter } from "./exporter.js";
import { ProfileGenerator } from "./profile-generator.js";
import { TerminalRenderer } from "./renderer.js";
import { HybridScoringEngine } from "./scorer.js";
import { TerminalUI } from "./tui.js";
import { withRetry } from "./retry.js";
import {
  ComparisonEntry,
  ComparisonEvidenceSummary,
  ExportCandidateRecord,
  MultiDimensionProfile,
  ResultListCommand,
  ScoredCandidate,
  SearchConditions,
  SearchDraft,
  SearchHistoryEntry,
  SortMode
} from "./types.js";

interface HydratedCandidate extends ScoredCandidate {
  _hydrated: {
    person: Person;
    evidence: EvidenceItem[];
  };
}

interface SearchLoopOutcome {
  type: "refine" | "restart" | "quit" | "restore";
  prompt?: string;
  conditions?: SearchConditions;  // For undo: directly restore conditions
}

interface DetailOutcome {
  type: "back" | "refine" | "quit";
  prompt?: string;
}

const SKIPPED_QUERY_VALUES = new Set(["不限", "skip", "none"]);

export class SearchWorkflow {
  private chat: ChatInterface;
  private tui: TerminalUI;
  private scorer: HybridScoringEngine;
  private generator: ProfileGenerator;
  private renderer: TerminalRenderer;
  private exporter: ShortlistExporter;
  private cacheRepo: ProfileCacheRepository;
  private planner: QueryPlanner;
  private retriever: HybridRetriever;
  private reranker: Reranker;
  private spinner: Ora;
  private processingProfiles = new Map<string, Promise<MultiDimensionProfile>>();
  private comparePool: HydratedCandidate[] = [];
  private searchHistory: SearchHistoryEntry[] = [];

  constructor(
    private db: SeekuDatabase,
    private llmProvider: LLMProvider
  ) {
    this.chat = new ChatInterface(llmProvider);
    this.tui = new TerminalUI();
    this.scorer = new HybridScoringEngine(llmProvider);
    this.generator = new ProfileGenerator(llmProvider);
    this.renderer = new TerminalRenderer();
    this.exporter = new ShortlistExporter();
    this.cacheRepo = new ProfileCacheRepository(db);
    this.planner = new QueryPlanner({ provider: llmProvider });
    this.retriever = new HybridRetriever({
      db,
      provider: llmProvider,
      limit: CLI_CONFIG.ui.defaultLimit * 5
    });
    this.reranker = new Reranker();
    this.spinner = ora({ isEnabled: CLI_CONFIG.ui.spinnerEnabled });
  }

  async execute(initialPrompt?: string): Promise<void> {
    this.tui.displayBanner();
    this.tui.displayWelcomeTips();

    let nextPrompt = initialPrompt?.trim();

    while (true) {
      const initialInput = nextPrompt || (await this.chat.askInitial());
      nextPrompt = undefined;

      if (!initialInput) {
        return;
      }

      const clarifyOutcome = await this.runClarifyLoop(initialInput);
      if (!clarifyOutcome) {
        return;
      }

      const searchOutcome = await this.runSearchLoop(clarifyOutcome);
      if (searchOutcome.type === "quit") {
        return;
      }

      if (searchOutcome.prompt) {
        nextPrompt = searchOutcome.prompt;
        continue;
      }

      if (searchOutcome.type === "restart") {
        nextPrompt = "";
      }
    }
  }

  private async runClarifyLoop(initialInput: string): Promise<SearchConditions | null> {
    let query = initialInput.trim();
    let conditions = await this.extractDraftFromQuery(query);

    while (true) {
      this.tui.displayInitialSearch(query);
      this.tui.displayClarifiedDraft(this.createDraft(conditions));

      const action = await this.tui.promptClarifyAction();
      if (action === "search") {
        return conditions;
      }

      if (action === "quit") {
        return null;
      }

      if (action === "restart") {
        const restarted = await this.chat.askFreeform("重新描述一下你想找的人才");
        if (!restarted) {
          continue;
        }
        query = restarted;
        conditions = await this.extractDraftFromQuery(query);
        continue;
      }

      if (action === "add" || action === "relax") {
        const instruction = await this.chat.askFreeform(
          action === "add"
            ? "补充想强调的条件，例如：更偏 vLLM / CUDA，最好做过 serving"
            : "你想放宽哪一项？例如：地点放宽到上海/杭州，经验改成 2 年以上"
        );

        if (!instruction) {
          continue;
        }

        this.spinner.start(action === "add" ? "正在补充搜索条件..." : "正在放宽搜索条件...");
        conditions = await this.chat.reviseConditions(
          conditions,
          instruction,
          action === "add" ? "tighten" : "relax"
        );
        this.spinner.stop();
      }
    }
  }

  private async runSearchLoop(initialConditions: SearchConditions): Promise<SearchLoopOutcome> {
    let conditions = this.normalizeConditions(initialConditions);
    let sortMode: SortMode = "overall";

    while (true) {
      const effectiveQuery = this.buildEffectiveQuery(conditions);
      if (!effectiveQuery) {
        console.log(chalk.yellow("\n当前没有可搜索的条件，请重新描述需求。"));
        return { type: "restart" };
      }

      let candidates: HydratedCandidate[];
      try {
        this.spinner.start("正在搜索匹配候选人...");
        candidates = await this.performSearch(effectiveQuery, conditions);
        this.spinner.stop();
      } catch (error) {
        this.spinner.fail("搜索失败。");
        throw error;
      }

      if (candidates.length === 0) {
        this.tui.displayNoResults(conditions);
        const prompt = await this.chat.askFreeform("想怎么调整这轮搜索？直接输入新的 refine 指令，或按 Enter 重新开始");
        if (!prompt) {
          return { type: "restart" };
        }

        conditions = await this.reviseSessionConditions(conditions, prompt);
        sortMode = "overall";
        continue;
      }

      // Record search history
      this.searchHistory.push({
        conditions: { ...conditions },
        resultCount: candidates.length,
        timestamp: new Date()
      });

      const preloadPromise = this.preloadProfiles(candidates, conditions);
      const result = await this.runShortlistLoop(candidates, conditions, sortMode);
      preloadPromise.catch(() => {});

      if (result.type === "quit") {
        return result;
      }

      if (result.type === "restart") {
        return result;
      }

      if (result.type === "restore" && result.conditions) {
        // Undo: directly restore previous conditions without LLM round-trip
        conditions = this.normalizeConditions(result.conditions);
        sortMode = "overall";
        continue;
      }

      conditions = await this.reviseSessionConditions(conditions, result.prompt || "");
      sortMode = "overall";
    }
  }

  private async runShortlistLoop(
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    initialSortMode: SortMode
  ): Promise<SearchLoopOutcome> {
    let sortMode = initialSortMode;
    let visibleCount = Math.min(5, candidates.length);

    await this.sortCandidates(candidates, sortMode, conditions);

    while (true) {
      this.tui.displayShortlist(candidates, conditions, {
        sortMode,
        showingCount: visibleCount,
        totalCount: candidates.length,
        poolCount: this.comparePool.length
      });

      const command = await this.tui.promptShortlistAction();
      const outcome = await this.handleShortlistCommand(command, candidates, conditions, {
        sortMode,
        visibleCount
      });

      if (outcome.type === "continue") {
        sortMode = outcome.sortMode;
        visibleCount = outcome.visibleCount;
        continue;
      }

      return outcome.result;
    }
  }

  private async handleShortlistCommand(
    command: ResultListCommand,
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    state: { sortMode: SortMode; visibleCount: number }
  ): Promise<
    | { type: "continue"; sortMode: SortMode; visibleCount: number }
    | { type: "done"; result: SearchLoopOutcome }
  > {
    if (command.type === "help") {
      this.tui.displayHelp();
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "back") {
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "quit") {
      return { type: "done", result: { type: "quit" } };
    }

    if (command.type === "showMore") {
      return {
        type: "continue",
        sortMode: state.sortMode,
        visibleCount: Math.min(state.visibleCount + 5, candidates.length)
      };
    }

    if (command.type === "refine") {
      const prompt = await this.chat.askFreeform("想怎么继续 refine？例如：地点放宽到上海/杭州，或更偏推理框架");
      if (!prompt) {
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      return { type: "done", result: { type: "refine", prompt } };
    }

    if (command.type === "sort") {
      const nextSortMode = command.sortMode || "overall";
      await this.sortCandidates(candidates, nextSortMode, conditions);
      return {
        type: "continue",
        sortMode: nextSortMode,
        visibleCount: state.visibleCount
      };
    }

    if (command.type === "add") {
      const targets = this.pickCandidates(candidates, command.indexes || []);
      if (targets.length === 0) {
        this.tui.displayInvalidCommand("add");
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      // Add to pool (avoid duplicates)
      for (const target of targets) {
        if (!this.comparePool.some(p => p.personId === target.personId)) {
          this.comparePool.push(target);
        }
      }

      this.tui.displayPoolAdded(targets[0].name, this.comparePool.length);
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "pool") {
      if (this.comparePool.length === 0) {
        this.tui.displayPoolEmpty();
      } else {
        this.tui.displayPool(this.comparePool);
      }
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "clear") {
      this.comparePool = [];
      this.tui.displayPoolCleared();
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "history") {
      this.tui.displayHistory(this.searchHistory);
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "show") {
      this.tui.displayFilters(conditions);
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "export") {
      const exportTarget = command.exportTarget || "shortlist";
      const exportFormat = command.exportFormat || "md";
      const targets = exportTarget === "pool"
        ? [...this.comparePool]
        : candidates.slice(0, state.visibleCount);

      if (targets.length === 0) {
        this.tui.displayExportEmpty(exportTarget);
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      let comparisonEntries: ComparisonEntry[] = [];
      if (exportTarget === "pool" && targets.length >= 2) {
        await this.ensureProfiles(targets, conditions, "正在准备对比池导出...");
        comparisonEntries = this.buildComparisonEntries(targets, candidates);
      }

      const artifact = await this.exporter.export({
        format: exportFormat,
        target: exportTarget,
        querySummary: this.formatConditionsAsPrompt(conditions),
        records: this.buildExportRecords(targets, candidates, comparisonEntries)
      });

      this.tui.displayExportSuccess(artifact);
      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    if (command.type === "undo") {
      // Get previous conditions from history (skip current entry)
      if (this.searchHistory.length < 2) {
        this.tui.displayUndo(null);
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      const previousEntry = this.searchHistory[this.searchHistory.length - 2];
      this.tui.displayUndo(previousEntry.conditions);

      // Remove last TWO entries: current + the one we're restoring to
      // We'll re-add the restored state as a new search
      this.searchHistory.pop(); // Remove current
      this.searchHistory.pop(); // Remove the one we're restoring

      return {
        type: "done",
        result: {
          type: "restore" as const,
          conditions: previousEntry.conditions
        }
      };
    }

    if (command.type === "compare") {
      // Use pool if indexes not provided
      const usePool = !command.indexes || command.indexes.length < 2;
      const targets = usePool
        ? (this.comparePool.length >= 2 ? this.comparePool : [])
        : this.pickCandidates(candidates, command.indexes || []);

      if (targets.length < 2) {
        this.tui.displayCompareNeedsMoreCandidates(usePool ? this.comparePool.length : targets.length);
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      // For pool candidates: clear old profiles to force regeneration with current conditions
      // This ensures profile matches the current search context, not the old one
      if (usePool) {
        for (const target of targets) {
          delete target.profile;
        }
      }

      await this.ensureProfiles(targets, conditions, "正在准备候选人对比...");
      const comparisonEntries = this.buildComparisonEntries(targets, candidates);
      console.log(
        this.renderer.renderComparison(comparisonEntries, conditions)
      );

      while (true) {
        const action = await this.tui.promptCompareAction();
        if (action === "back") {
          return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
        }

        if (action === "clear") {
          this.comparePool = [];
          this.tui.displayPoolCleared();
          return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
        }

        if (action === "quit") {
          return { type: "done", result: { type: "quit" } };
        }
      }

    }

    if (command.type === "view") {
      const target = this.pickCandidates(candidates, command.indexes || [1])[0];
      if (!target) {
        this.tui.displayInvalidCommand("view");
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      const detailOutcome = await this.showCandidateDetail(target, conditions);
      if (detailOutcome.type === "back") {
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      if (detailOutcome.type === "quit") {
        return { type: "done", result: { type: "quit" } };
      }

      return { type: "done", result: { type: "refine", prompt: detailOutcome.prompt } };
    }

    if (command.type === "open") {
      const target = this.pickCandidates(candidates, command.indexes || [1])[0];
      if (!target) {
        this.tui.displayInvalidCommand("open");
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      if (!target.bonjourUrl) {
        console.log(chalk.yellow(`\n${target.name} 没有 Bonjour 链接。`));
        return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
      }

      console.log(chalk.cyan(`\n🔗 Bonjour: ${target.bonjourUrl}`));
      console.log(chalk.dim("尝试在浏览器中打开..."));

      // Try to open URL in browser
      const openCommand = process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";

      try {
        const { spawn } = await import("node:child_process");
        spawn(openCommand, [target.bonjourUrl], { stdio: "ignore", detached: true });
        console.log(chalk.green("✓ 已在浏览器中打开 Bonjour 页面。"));
      } catch {
        console.log(chalk.yellow("无法自动打开，请手动复制链接。"));
      }

      return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
    }

    this.tui.displayInvalidCommand(command.type);
    return { type: "continue", sortMode: state.sortMode, visibleCount: state.visibleCount };
  }

  private async showCandidateDetail(
    selected: HydratedCandidate,
    conditions: SearchConditions
  ): Promise<DetailOutcome> {
    console.log(chalk.blue(`\n🔍 正在加载 ${selected.name} 的深度画像...`));
    const profile = await this.loadProfileForCandidate(selected, conditions);
    if (!profile) {
      return { type: "back" };
    }

    console.log(
      this.renderer.renderProfile(
        selected._hydrated.person,
        selected._hydrated.evidence,
        profile,
        selected.matchReason,
        {
          sources: selected.sources,
          bonjourUrl: selected.bonjourUrl,
          lastSyncedAt: selected.lastSyncedAt,
          latestEvidenceAt: selected.latestEvidenceAt
        }
      )
    );

    while (true) {
      const action = await this.tui.promptDetailAction(selected.name);
      if (action === "back") {
        return { type: "back" };
      }

      if (action === "quit") {
        return { type: "quit" };
      }

      if (action === "open") {
        if (!selected.bonjourUrl) {
          console.log(chalk.yellow(`\n${selected.name} 没有 Bonjour 链接。`));
          continue;
        }

        console.log(chalk.cyan(`\n🔗 Bonjour: ${selected.bonjourUrl}`));
        console.log(chalk.dim("尝试在浏览器中打开..."));

        const openCommand = process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";

        try {
          const { spawn } = await import("node:child_process");
          spawn(openCommand, [selected.bonjourUrl], { stdio: "ignore", detached: true });
          console.log(chalk.green("✓ 已在浏览器中打开 Bonjour 页面。"));
        } catch {
          console.log(chalk.yellow("无法自动打开，请手动复制链接。"));
        }
        continue;
      }

      if (action === "why") {
        console.log(this.renderer.renderWhyMatched(selected, profile, conditions));
        continue;
      }

      if (action === "refine") {
        const prompt = await this.chat.askFreeform(
          `想基于 ${selected.name} 怎么继续收敛？例如：只看更偏推理框架的人`
        );
        if (!prompt) {
          continue;
        }

        return { type: "refine", prompt };
      }
    }
  }

  private async extractDraftFromQuery(query: string): Promise<SearchConditions> {
    this.spinner.start("正在分析你的需求...");
    const extracted = await this.chat.extractConditions(query);
    this.spinner.stop();
    return this.normalizeConditions(extracted);
  }

  private createDraft(conditions: SearchConditions): SearchDraft {
    return {
      conditions,
      missing: this.chat.detectMissing(conditions)
    };
  }

  private normalizeConditions(conditions: Partial<SearchConditions>): SearchConditions {
    const dedupe = (values: string[] | undefined) => {
      const seen = new Set<string>();
      return (values || []).filter((value) => {
        const normalized = value.trim();
        if (!normalized) {
          return false;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };

    return {
      skills: dedupe(conditions.skills),
      locations: dedupe(conditions.locations),
      experience: conditions.experience?.trim() || undefined,
      role: conditions.role?.trim() || undefined,
      sourceBias: conditions.sourceBias,
      limit: conditions.limit || CLI_CONFIG.ui.defaultLimit
    };
  }

  private buildEffectiveQuery(conditions: SearchConditions): string {
    return [
      ...conditions.skills,
      ...conditions.locations,
      conditions.experience ?? "",
      conditions.role ?? "",
      conditions.sourceBias ?? ""
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !SKIPPED_QUERY_VALUES.has(value.toLowerCase()))
      .join(" ");
  }

  private buildProfileCacheKey(conditions: SearchConditions): string {
    const normalizeArray = (items: string[]) =>
      items
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .sort();

    const payload = {
      skills: normalizeArray(conditions.skills),
      locations: normalizeArray(conditions.locations),
      experience: conditions.experience?.trim().toLowerCase() ?? "",
      role: conditions.role?.trim().toLowerCase() ?? "",
      sourceBias: conditions.sourceBias ?? ""
    };

    return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  }

  private async performSearch(query: string, conditions: SearchConditions): Promise<HydratedCandidate[]> {
    const limit = conditions.limit;
    const intent = this.mergeIntentWithConditions(await this.planner.parse(query), conditions);
    const queryEmbedding = await this.llmProvider.embed(intent.rawQuery);

    let retrieved = await this.retriever.retrieve(intent, { embedding: queryEmbedding.embedding });
    if (retrieved.length === 0 && conditions.sourceBias) {
      const relaxedIntent = { ...intent, sourceBias: undefined };
      retrieved = await this.retriever.retrieve(relaxedIntent, { embedding: queryEmbedding.embedding });
    }

    if (retrieved.length === 0) {
      return this.performFallbackSearch(conditions);
    }

    const personIds = retrieved.map((result) => result.personId);
    const [documents, evidence, people, identities] = await Promise.all([
      this.db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds)),
      this.db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      this.db
        .select()
        .from(persons)
        .where(and(eq(persons.searchStatus, "active"), inArray(persons.id, personIds))),
      // Get person identities to fetch source profiles (for Bonjour URL)
      this.db
        .select()
        .from(personIdentities)
        .where(inArray(personIdentities.personId, personIds))
    ]);

    // Fetch source profiles for Bonjour URLs
    const sourceProfileIds = identities.map((identity) => identity.sourceProfileId);
    const sourceProfileRows = sourceProfileIds.length > 0
      ? await this.db.select().from(sourceProfiles).where(inArray(sourceProfiles.id, sourceProfileIds))
      : [];
    const sourceProfileMap = new Map<string, SourceProfile>(
      sourceProfileRows.map((profile) => [profile.id, profile as SourceProfile])
    );

    // Build identity map: personId -> identities
    const identityMap = new Map<string, PersonIdentity[]>();
    for (const identity of identities) {
      const entries = identityMap.get(identity.personId) ?? [];
      entries.push(identity as PersonIdentity);
      identityMap.set(identity.personId, entries);
    }

    const documentMap = new Map<string, SearchDocument>(documents.map((document) => [document.personId, document as SearchDocument]));
    const evidenceMap = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const entries = evidenceMap.get(item.personId) ?? [];
      entries.push(item as EvidenceItem);
      evidenceMap.set(item.personId, entries);
    }
    const personMap = new Map<string, Person>(people.map((person) => [person.id, person as Person]));

    const reranked = this.reranker.rerank(retrieved, intent, documentMap, evidenceMap);
    const hydrated = reranked.slice(0, limit).map((result) => {
      const person = personMap.get(result.personId);
      if (!person) {
        throw new Error(`Candidate ${result.personId} not found in database.`);
      }

      const document = documentMap.get(result.personId);
      const candidateEvidence = evidenceMap.get(result.personId) || [];
      const personIdentities = identityMap.get(result.personId) || [];

      // Find Bonjour URL from source profiles
      const bonjourIdentity = personIdentities.find((identity) => {
        const profile = sourceProfileMap.get(identity.sourceProfileId);
        return profile?.source === "bonjour";
      });
      const bonjourUrl = bonjourIdentity
        ? sourceProfileMap.get(bonjourIdentity.sourceProfileId)?.canonicalUrl
        : undefined;

      // Backfill source badge from identity-derived Bonjour URL when facetSource is sparse.
      const sources = document?.facetSource && document.facetSource.length > 0
        ? document.facetSource.map((source) => source === "bonjour" ? "Bonjour" : "GitHub")
        : bonjourUrl
          ? ["Bonjour"]
          : ["Unknown"];

      // Latest evidence timestamp
      const latestEvidenceAt = candidateEvidence.length > 0
        ? candidateEvidence
            .map((item) => item.occurredAt)
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : undefined;

      return {
        personId: result.personId,
        name: person.primaryName,
        headline: person.primaryHeadline,
        location: person.primaryLocation,
        company: null,
        experienceYears: null,
        matchScore: result.finalScore,
        matchReason: this.buildMatchReason(person, candidateEvidence, result.finalScore, conditions),
        sources,
        bonjourUrl,
        lastSyncedAt: person.updatedAt,
        latestEvidenceAt,
        _hydrated: {
          person,
          evidence: candidateEvidence
        }
      };
    });

    return hydrated.length > 0 ? hydrated : this.performFallbackSearch(conditions);
  }

  private mergeIntentWithConditions(intent: QueryIntent, conditions: SearchConditions): QueryIntent {
    const unique = (values: string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];

    return {
      ...intent,
      roles: unique([
        ...intent.roles,
        ...(conditions.role ? [conditions.role] : [])
      ]),
      skills: unique([
        ...intent.skills,
        ...conditions.skills
      ]),
      locations: unique([
        ...intent.locations,
        ...conditions.locations
      ]),
      experienceLevel: intent.experienceLevel ?? conditions.experience?.toLowerCase(),
      sourceBias: conditions.sourceBias ?? intent.sourceBias,
      mustHaves: unique([
        ...intent.mustHaves,
        ...(conditions.role ? [conditions.role] : []),
        ...conditions.skills
      ]),
      niceToHaves: unique(intent.niceToHaves)
    };
  }

  private async performFallbackSearch(conditions: SearchConditions): Promise<HydratedCandidate[]> {
    const filters = [eq(persons.searchStatus, "active")];

    if (conditions.locations.length > 0) {
      const locationClauses = conditions.locations.map(
        (location) =>
          sql`(${persons.primaryLocation} ILIKE ${`%${location}%`} OR ${searchDocuments.facetLocation}::text ILIKE ${`%${location}%`})`
      );
      filters.push(sql`(${sql.join(locationClauses, sql.raw(" OR "))})`);
    }

    const rows = await this.db
      .select({
        person: persons,
        document: searchDocuments
      })
      .from(persons)
      .innerJoin(searchDocuments, eq(searchDocuments.personId, persons.id))
      .where(and(...filters))
      .limit(Math.max(conditions.limit * 5, 30));

    if (rows.length === 0) {
      return [];
    }

    const personIds = rows.map((row) => row.person.id);
    const [evidence, identities] = await Promise.all([
      this.db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      this.db.select().from(personIdentities).where(inArray(personIdentities.personId, personIds))
    ]);

    // Fetch source profiles for Bonjour URLs
    const sourceProfileIds = identities.map((identity) => identity.sourceProfileId);
    const sourceProfileRows = sourceProfileIds.length > 0
      ? await this.db.select().from(sourceProfiles).where(inArray(sourceProfiles.id, sourceProfileIds))
      : [];
    const sourceProfileMap = new Map<string, SourceProfile>(
      sourceProfileRows.map((profile) => [profile.id, profile as SourceProfile])
    );

    // Build identity map: personId -> identities
    const identityMap = new Map<string, PersonIdentity[]>();
    for (const identity of identities) {
      const entries = identityMap.get(identity.personId) ?? [];
      entries.push(identity as PersonIdentity);
      identityMap.set(identity.personId, entries);
    }

    const evidenceMap = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const entries = evidenceMap.get(item.personId) ?? [];
      entries.push(item as EvidenceItem);
      evidenceMap.set(item.personId, entries);
    }

    const scored = rows
      .map((row) => {
        const person = row.person as Person;
        const document = row.document as SearchDocument;
        const candidateEvidence = evidenceMap.get(person.id) || [];
        const personIdentities = identityMap.get(person.id) || [];
        const heuristicScore = this.computeFallbackScore(person, document, candidateEvidence, conditions);

        // Find Bonjour URL
        const bonjourIdentity = personIdentities.find((identity) => {
          const profile = sourceProfileMap.get(identity.sourceProfileId);
          return profile?.source === "bonjour";
        });
        const bonjourUrl = bonjourIdentity
          ? sourceProfileMap.get(bonjourIdentity.sourceProfileId)?.canonicalUrl
          : undefined;

        const sources = document.facetSource?.length > 0
          ? document.facetSource.map((source) => source === "bonjour" ? "Bonjour" : "GitHub")
          : bonjourUrl
            ? ["Bonjour"]
            : ["Unknown"];

        // Latest evidence timestamp
        const latestEvidenceAt = candidateEvidence.length > 0
          ? candidateEvidence
              .map((item) => item.occurredAt)
              .filter((date): date is Date => Boolean(date))
              .sort((a, b) => b.getTime() - a.getTime())[0]
          : undefined;

        return {
          personId: person.id,
          name: person.primaryName,
          headline: person.primaryHeadline,
          location: person.primaryLocation,
          company: null,
          experienceYears: null,
          matchScore: heuristicScore,
          matchReason: this.buildFallbackReason(person, document, candidateEvidence, conditions),
          sources,
          bonjourUrl,
          lastSyncedAt: person.updatedAt,
          latestEvidenceAt,
          _hydrated: {
            person,
            evidence: candidateEvidence
          }
        } satisfies HydratedCandidate;
      })
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, conditions.limit);

    return scored;
  }

  private computeFallbackScore(
    person: Person,
    document: SearchDocument,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): number {
    const context = [
      person.primaryHeadline || "",
      person.summary || "",
      document.docText || "",
      ...evidence.slice(0, 8).map((item) => `${item.title || ""} ${item.description || ""}`)
    ]
      .join(" ")
      .toLowerCase();

    let score = 35;

    if (conditions.locations.length > 0) {
      const locationMatched = conditions.locations.some((location) =>
        (person.primaryLocation || "").toLowerCase().includes(location.toLowerCase()) ||
        document.facetLocation.some((value) => value.toLowerCase().includes(location.toLowerCase()))
      );
      score += locationMatched ? 30 : 0;
    }

    if (conditions.sourceBias) {
      const sourceMatched = document.facetSource.some((value) => value.toLowerCase() === conditions.sourceBias);
      score += sourceMatched ? 10 : 0;
    }

    if (conditions.role && context.includes(conditions.role.toLowerCase())) {
      score += 15;
    }

    if (conditions.skills.length > 0) {
      const matchedSkills = conditions.skills.filter((skill) => context.includes(skill.toLowerCase()));
      score += Math.round((matchedSkills.length / conditions.skills.length) * 25);
    }

    return Math.min(100, score);
  }

  private buildFallbackReason(
    person: Person,
    document: SearchDocument,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): string {
    const snippets: string[] = [];

    if (conditions.locations.length > 0 && person.primaryLocation) {
      snippets.push(`地点匹配 ${person.primaryLocation}`);
    }

    if (conditions.sourceBias && document.facetSource.some((value) => value.toLowerCase() === conditions.sourceBias)) {
      snippets.push(`来源匹配 ${conditions.sourceBias}`);
    }

    const context = `${person.primaryHeadline || ""} ${document.docText || ""}`.toLowerCase();
    const matchedSkills = conditions.skills.filter((skill) => context.includes(skill.toLowerCase()));
    if (matchedSkills.length > 0) {
      snippets.push(`技能命中 ${matchedSkills.slice(0, 2).join(" / ")}`);
    }

    const topEvidence = evidence.find((item) => item.title);
    if (snippets.length === 0 && topEvidence?.title) {
      snippets.push(`相关证据 ${topEvidence.title.slice(0, 28)}${topEvidence.title.length > 28 ? "..." : ""}`);
    }

    if (snippets.length === 0) {
      snippets.push("满足当前宽条件，可作为起始 shortlist");
    }

    return snippets.slice(0, 2).join("，");
  }

  private buildMatchReason(
    person: Person,
    evidence: EvidenceItem[],
    score: number,
    conditions: SearchConditions
  ): string {
    // Use rule-based scoring to generate meaningful match reason
    const ruleScores = this.scorer.scoreByRules(person, evidence, conditions);
    const experienceBonus = this.scorer.calculateExperienceMatch(person, evidence, conditions);

    // Build dimension-based match reason
    const dimensionLabels: Record<string, { label: string; score: number }> = {
      techMatch: { label: "技术匹配", score: ruleScores.techMatch || 0 },
      locationMatch: { label: "地点匹配", score: ruleScores.locationMatch || 0 },
      careerStability: { label: "职业稳定", score: ruleScores.careerStability || 0 },
      communityReputation: { label: "社区活跃", score: ruleScores.communityReputation || 0 }
    };

    // Find top 2 dimensions
    const sortedDims = Object.entries(dimensionLabels)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 2);

    const snippets: string[] = [];

    // Top dimension highlight
    if (sortedDims[0] && sortedDims[0][1].score >= 70) {
      snippets.push(`${sortedDims[0][1].label}高 (${sortedDims[0][1].score.toFixed(0)}分)`);
    }

    // Second dimension
    if (sortedDims[1] && sortedDims[1][1].score >= 60) {
      snippets.push(`${sortedDims[1][1].label}良好 (${sortedDims[1][1].score.toFixed(0)}分)`);
    }

    // Experience bonus
    if (experienceBonus >= 15) {
      snippets.push("经验层级匹配");
    }

    // Fallback: evidence-based highlight
    if (snippets.length === 0 && evidence.length > 0) {
      const topEvidence = evidence.find(e => e.evidenceType === "project" || e.evidenceType === "repository");
      if (topEvidence?.title) {
        snippets.push(`相关项目：${topEvidence.title.slice(0, 30)}${topEvidence.title.length > 30 ? "..." : ""}`);
      }
    }

    // Final fallback
    if (snippets.length === 0) {
      snippets.push(`综合相关度 ${score.toFixed(1)} 分`);
    }

    return snippets.slice(0, 2).join("，");
  }

  private buildEnhancedMatchReason(profile: MultiDimensionProfile): string {
    const { dimensions, highlights } = profile;

    // All 6 dimensions with labels
    const allDimensions: Record<string, { label: string; score: number }> = {
      techMatch: { label: "技术匹配", score: dimensions.techMatch },
      projectDepth: { label: "项目深度", score: dimensions.projectDepth },
      academicImpact: { label: "学术影响", score: dimensions.academicImpact },
      careerStability: { label: "职业稳定", score: dimensions.careerStability },
      communityReputation: { label: "社区声望", score: dimensions.communityReputation },
      locationMatch: { label: "地点匹配", score: dimensions.locationMatch }
    };

    // Sort by score, find top 2-3
    const sortedDims = Object.entries(allDimensions)
      .sort((a, b) => b[1].score - a[1].score);

    const snippets: string[] = [];

    // Top dimension (strong match)
    if (sortedDims[0] && sortedDims[0][1].score >= 80) {
      snippets.push(`${sortedDims[0][1].label}优秀 (${sortedDims[0][1].score.toFixed(0)}分)`);
    } else if (sortedDims[0] && sortedDims[0][1].score >= 70) {
      snippets.push(`${sortedDims[0][1].label}良好 (${sortedDims[0][1].score.toFixed(0)}分)`);
    }

    // Second dimension
    if (sortedDims[1] && sortedDims[1][1].score >= 70) {
      snippets.push(`${sortedDims[1][1].label}良好`);
    } else if (sortedDims[1] && sortedDims[1][1].score >= 60) {
      snippets.push(`${sortedDims[1][1].label}达标`);
    }

    // Use highlights if available (more specific)
    if (highlights.length > 0 && snippets.length < 2) {
      const topHighlight = highlights[0];
      // Truncate if too long
      snippets.push(topHighlight.length > 40 ? `${topHighlight.slice(0, 40)}...` : topHighlight);
    }

    // Final fallback
    if (snippets.length === 0) {
      snippets.push(`综合评分 ${profile.overallScore.toFixed(1)} 分`);
    }

    return snippets.slice(0, 2).join("，");
  }

  private buildComparisonEntries(
    targets: HydratedCandidate[],
    allCandidates: HydratedCandidate[]
  ): ComparisonEntry[] {
    const entries = targets
      .filter(
        (candidate): candidate is HydratedCandidate & { profile: MultiDimensionProfile } =>
          Boolean(candidate.profile)
      )
      .map((candidate) => {
        const shortlistIndex = allCandidates.findIndex((item) => item.personId === candidate.personId);
        const decisionScore = this.computeComparisonDecisionScore(candidate, candidate.profile);

        return {
          shortlistIndex: shortlistIndex >= 0 ? shortlistIndex + 1 : undefined,
          candidate,
          profile: candidate.profile,
          topEvidence: this.buildComparisonEvidence(candidate._hydrated.evidence),
          decisionScore
        };
      });

    const rankedIds = [...entries]
      .sort((left, right) => right.decisionScore - left.decisionScore)
      .map((entry) => entry.candidate.personId);

    return entries.map((entry) => {
      const rank = rankedIds.indexOf(entry.candidate.personId);
      const decisionTag = this.classifyComparisonDecisionTag(rank);

      return {
        ...entry,
        decisionTag,
        recommendation: this.buildComparisonRecommendation(
          entry.candidate,
          entry.profile,
          decisionTag
        ),
        nextStep: this.buildComparisonNextStep(
          entry.candidate,
          entry.shortlistIndex,
          decisionTag
        )
      };
    });
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
        freshness: freshnessDate ? this.describeRelativeDate(freshnessDate) : "时间未知",
        bonjourUrl: candidate.bonjourUrl,
        whyMatched: candidate.matchReason || "与当前条件整体相关度较高",
        decisionTag: comparisonEntry?.decisionTag,
        recommendation: comparisonEntry?.recommendation,
        nextStep: comparisonEntry?.nextStep,
        topEvidence: comparisonEntry?.topEvidence || this.buildComparisonEvidence(candidate._hydrated.evidence)
      };
    });
  }

  private computeComparisonDecisionScore(
    candidate: HydratedCandidate,
    profile: MultiDimensionProfile
  ): number {
    let score = profile.overallScore * 0.7 + candidate.matchScore * 100 * 0.2;

    const freshnessDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
    if (freshnessDate) {
      const ageInDays = Math.floor(
        (Date.now() - freshnessDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (ageInDays <= 7) {
        score += 8;
      } else if (ageInDays <= 30) {
        score += 5;
      } else if (ageInDays <= 90) {
        score += 2;
      }
    }

    if (candidate.sources.includes("Bonjour")) {
      score += 4;
    }

    if (candidate.bonjourUrl) {
      score += 4;
    }

    if (profile.dimensions.techMatch >= 80) {
      score += 3;
    }

    if (profile.dimensions.projectDepth >= 70) {
      score += 2;
    }

    return score;
  }

  private classifyComparisonDecisionTag(rank: number): ComparisonEntry["decisionTag"] {
    if (rank === 0) {
      return "优先深看";
    }

    if (rank === 1) {
      return "继续比较";
    }

    return "补充候选";
  }

  private buildComparisonEvidence(evidence: EvidenceItem[]): ComparisonEvidenceSummary[] {
    const priority: Record<string, number> = {
      project: 0,
      repository: 1,
      experience: 2,
      job_signal: 3,
      profile_field: 4,
      social: 5
    };

    return evidence
      .map((item) => ({
        item,
        priority: priority[item.evidenceType] ?? 99
      }))
      .filter(({ item }) => Boolean(item.title?.trim() || item.description?.trim()))
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        const leftTime = left.item.occurredAt?.getTime() ?? 0;
        const rightTime = right.item.occurredAt?.getTime() ?? 0;
        return rightTime - leftTime;
      })
      .slice(0, 3)
      .map(({ item }) => ({
        evidenceType: item.evidenceType,
        title: this.buildEvidenceHeadline(item),
        sourceLabel: item.source === "bonjour" ? "Bonjour" : item.source === "github" ? "GitHub" : item.source,
        freshnessLabel: item.occurredAt ? this.describeRelativeDate(item.occurredAt) : undefined
      }));
  }

  private buildEvidenceHeadline(item: EvidenceItem): string {
    const title = item.title?.trim();
    const description = item.description?.trim();

    if (item.evidenceType === "profile_field" && title && description) {
      return this.truncateForDisplay(`${title}: ${description}`, 54);
    }

    if (title) {
      return this.truncateForDisplay(title, 54);
    }

    return this.truncateForDisplay(description || "未命名证据", 54);
  }

  private buildComparisonRecommendation(
    candidate: HydratedCandidate,
    profile: MultiDimensionProfile,
    decisionTag: ComparisonEntry["decisionTag"]
  ): string {
    const reasons: string[] = [];

    if (profile.dimensions.techMatch >= 75) {
      reasons.push("技术相关性强");
    }

    if (profile.dimensions.projectDepth >= 65) {
      reasons.push("项目证据更扎实");
    }

    if (profile.dimensions.locationMatch >= 90) {
      reasons.push("地点完全匹配");
    }

    if (candidate.latestEvidenceAt || candidate.lastSyncedAt) {
      const freshnessDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
      const freshnessText = freshnessDate ? this.describeRelativeDate(freshnessDate) : undefined;
      if (freshnessText && freshnessText !== "时间未知") {
        reasons.push(`资料${freshnessText}`);
      }
    }

    if (reasons.length === 0 && candidate.bonjourUrl) {
      reasons.push("Bonjour 资料完整，可直接深看");
    }

    const prefix =
      decisionTag === "优先深看"
        ? "建议优先打开"
        : decisionTag === "继续比较"
          ? "建议继续对照"
          : "建议作为备选";

    return `${prefix}：${reasons.slice(0, 2).join("，") || "信息完整，可继续判断"}`;
  }

  private buildComparisonNextStep(
    candidate: HydratedCandidate,
    shortlistIndex: number | undefined,
    decisionTag: ComparisonEntry["decisionTag"]
  ): string {
    if (!shortlistIndex) {
      return candidate.bonjourUrl ? "返回 shortlist 后打开 Bonjour 深看" : "返回 shortlist 后查看详情";
    }

    if (decisionTag === "优先深看") {
      return candidate.bonjourUrl
        ? `返回 shortlist 后先执行 v ${shortlistIndex}，再用 o ${shortlistIndex} 打开 Bonjour`
        : `返回 shortlist 后先执行 v ${shortlistIndex} 深看细节`;
    }

    if (decisionTag === "继续比较") {
      return `返回 shortlist 后执行 v ${shortlistIndex} 补充判断`;
    }

    return `保留在 pool 中，必要时再查看 #${shortlistIndex}`;
  }

  private describeRelativeDate(date: Date): string {
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

  private truncateForDisplay(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    const chars = Array.from(normalized);
    if (chars.length <= maxLength) {
      return normalized;
    }

    return `${chars.slice(0, maxLength - 3).join("")}...`;
  }

  private pickCandidates(candidates: HydratedCandidate[], indexes: number[]): HydratedCandidate[] {
    return indexes
      .map((index) => candidates[index - 1])
      .filter((candidate): candidate is HydratedCandidate => Boolean(candidate));
  }

  private async reviseSessionConditions(
    current: SearchConditions,
    prompt: string
  ): Promise<SearchConditions> {
    this.spinner.start("正在更新这轮搜索条件...");
    const updated = await this.chat.reviseConditions(current, prompt, "edit");
    this.spinner.stop();
    return this.normalizeConditions(updated);
  }

  private async sortCandidates(
    candidates: HydratedCandidate[],
    sortMode: SortMode,
    conditions: SearchConditions
  ): Promise<void> {
    if (sortMode === "overall") {
      candidates.sort((left, right) => right.matchScore - left.matchScore);
      return;
    }

    await this.ensureProfiles(candidates, conditions, `正在按 ${sortMode} 维度准备排序...`);
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
  }

  private async ensureProfiles(
    candidates: HydratedCandidate[],
    conditions: SearchConditions,
    loadingText: string
  ): Promise<void> {
    const targets = candidates.filter((candidate) => !candidate.profile);
    if (targets.length === 0) {
      return;
    }

    this.spinner.start(loadingText);
    try {
      await Promise.all(targets.map((candidate) => this.loadProfileForCandidate(candidate, conditions)));
      this.spinner.stop();
    } catch (error) {
      this.spinner.fail("画像准备失败。");
      throw error;
    }
  }

  private async loadProfileForCandidate(
    candidate: HydratedCandidate,
    conditions: SearchConditions
  ): Promise<MultiDimensionProfile | null> {
    const { person, evidence } = candidate._hydrated;
    const profileCacheKey = this.buildProfileCacheKey(conditions);
    const processingKey = `${candidate.personId}:${profileCacheKey}`;

    try {
      const isCached = await this.cacheRepo.getProfile(candidate.personId, profileCacheKey);
      const isPreloading = this.processingProfiles.has(processingKey);

      if (!isCached && !isPreloading && !this.spinner.isSpinning) {
        this.spinner.start(`正在分析 ${candidate.name}...`);
      } else if (isPreloading && !this.spinner.isSpinning) {
        this.spinner.start(`等待后台完成 ${candidate.name} 的分析...`);
      }

      const profile = await this.getOrGenerateProfile(candidate.personId, person, evidence, conditions);
      candidate.profile = profile;

      // Update matchReason with enhanced dimension-based explanation
      candidate.matchReason = this.buildEnhancedMatchReason(profile);

      if (this.spinner.isSpinning && !isCached && !isPreloading) {
        this.spinner.succeed("画像分析完成。");
      } else if (this.spinner.isSpinning) {
        this.spinner.stop();
      }

      return profile;
    } catch (error) {
      if (this.spinner.isSpinning) {
        this.spinner.fail("画像分析失败。");
      }
      console.error(chalk.red("   Error detail:"), error instanceof Error ? error.message : "Analysis failed");
      return null;
    }
  }

  private async getOrGenerateProfile(
    personId: string,
    person: Person,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): Promise<MultiDimensionProfile> {
    const profileCacheKey = this.buildProfileCacheKey(conditions);
    const processingKey = `${personId}:${profileCacheKey}`;

    let profile = await this.cacheRepo.getProfile(personId, profileCacheKey);
    if (profile) {
      return profile;
    }

    if (this.processingProfiles.has(processingKey)) {
      const existing = this.processingProfiles.get(processingKey);
      if (existing) {
        const isRejected = await existing.then(
          () => false,
          () => true
        );
        if (!isRejected) {
          return existing;
        }
      }

      this.processingProfiles.delete(processingKey);
    }

    const generateTask = async () =>
      withRetry(async () => {
        let innerProfile = await this.cacheRepo.getProfile(personId, profileCacheKey);
        if (innerProfile) {
          return innerProfile;
        }

        const rules = this.scorer.scoreByRules(person, evidence, conditions);
        const llm = await this.scorer.scoreByLLM(person, evidence);
        const experienceBonus = this.scorer.calculateExperienceMatch(person, evidence, conditions);
        innerProfile = this.scorer.aggregate(rules, llm, experienceBonus);

        innerProfile = await this.generator.generate(person, evidence, innerProfile);
        await this.cacheRepo.setProfile(personId, profileCacheKey, innerProfile, innerProfile.overallScore);

        return innerProfile;
      }, { maxRetries: CLI_CONFIG.llm.maxRetries, baseDelay: 2000 });

    const promise = generateTask().finally(() => {
      this.processingProfiles.delete(processingKey);
    });

    const timeoutId = setTimeout(() => {
      if (this.processingProfiles.get(processingKey) === promise) {
        this.processingProfiles.delete(processingKey);
      }
    }, 30 * 60 * 1000);

    if (typeof timeoutId.unref === "function") {
      timeoutId.unref();
    }

    this.processingProfiles.set(processingKey, promise);
    return promise;
  }

  private async preloadProfiles(candidates: HydratedCandidate[], conditions: SearchConditions): Promise<void> {
    const tasks: Array<() => Promise<void>> = [];

    for (const candidate of candidates) {
      tasks.push(async () => {
        const { person, evidence } = candidate._hydrated;
        const profile = await this.getOrGenerateProfile(candidate.personId, person, evidence, conditions);
        candidate.profile = profile;
      });
    }

    if (tasks.length > 0) {
      await this.promisePool(tasks, CLI_CONFIG.llm.parallelLimit);
    }
  }

  private async promisePool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
    type PoolResult = T | { error: Error };
    const results: PoolResult[] = new Array(tasks.length);

    const runWorker = async (startIndex: number): Promise<void> => {
      for (let index = startIndex; index < tasks.length; index += limit) {
        try {
          results[index] = await tasks[index]();
        } catch (error) {
          results[index] = { error: error instanceof Error ? error : new Error(String(error)) };
        }
      }
    };

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, (_, index) => runWorker(index));
    await Promise.all(workers);

    const successful = results.filter(
      (result): result is T => !(result && typeof result === "object" && "error" in result)
    );
    const failed = results.filter(
      (result): result is { error: Error } => Boolean(result && typeof result === "object" && "error" in result)
    );

    if (failed.length > 0) {
      console.warn(chalk.dim(`\n[Pool Warning] ${failed.length} analysis tasks failed. Results may be incomplete.`));
    }

    return successful;
  }

  private formatExportSource(sources: string[]): string {
    if (!sources || sources.length === 0 || sources[0] === "Unknown") {
      return "来源未知";
    }

    return sources.join(" / ");
  }

  private formatConditionsAsPrompt(conditions: SearchConditions): string {
    const parts: string[] = [];

    if (conditions.role) {
      parts.push(`角色 ${conditions.role}`);
    }

    if (conditions.skills.length > 0) {
      parts.push(`技术栈 ${conditions.skills.join(" / ")}`);
    }

    if (conditions.locations.length > 0) {
      parts.push(`地点 ${conditions.locations.join(" / ")}`);
    }

    if (conditions.experience) {
      parts.push(`经验 ${conditions.experience}`);
    }

    if (conditions.sourceBias) {
      parts.push(`来源 ${conditions.sourceBias}`);
    }

    return parts.length > 0 ? parts.join("，") : "不限条件";
  }
}
