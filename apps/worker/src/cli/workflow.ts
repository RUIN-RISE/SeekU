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
import { CrossEncoder, QueryPlanner, HybridRetriever, Reranker, buildDisambiguationNotes, type QueryIntent } from "@seeku/search";
import { classifyMatchStrength } from "@seeku/shared";
import { createHash, randomUUID } from "node:crypto";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import {
  addCompareCandidates,
  clearCompareSet,
  createSearchSessionState,
  recordClarification,
  recordSearchExecution,
  removeCompareCandidates as removeCompareCandidatesFromState,
  resetRecoveryState,
  setCurrentShortlist,
  setConfidenceStatus,
  setOpenUncertainties,
  setRecommendedCandidate,
  setRecoveryState,
  setSessionConditions,
  setSessionShortlist,
  setSessionUserGoal,
  setRuntimeStatus,
  type AgentSessionState
} from "./agent-state.js";
import type { AgentSessionWhyCode } from "./session-runtime-types.js";
import {
  decideClarifyAction,
  decidePostSearchAction,
  decideRecoveryActionV2,
  type RecoveryPromptKind
} from "./agent-policy.js";
import { buildRefineContextCandidates,
  createSearchAgentTools,
  inspectCandidateFromState,
  prepareComparisonEntries,
  prepareComparisonResult,
  resolveCandidateAnchorWithContext,
  type AgentInspectCandidateOutput,
  type SearchAgentTools
} from "./agent-tools.js";
import {
  normalizeConditions,
  buildEffectiveQuery,
  formatConditionsAsPrompt
} from "./search-conditions.js";
import {
  truncateForDisplay,
  buildEvidenceHeadline
} from "./comparison-formatters.js";
import { buildResultWarning } from "./result-warning.js";
import { ProfileManager } from "./profile-manager.js";
import { ComparisonController } from "./comparison-controller.js";
import { SearchExecutor, type SearchExecutionResult, type SearchExecutionDiagnostics, type HydratedCandidate } from "./search-executor.js";
import { ConditionRevisionService } from "./condition-revision-service.js";
import { RecoveryHandler, type SearchRecoveryHandlingResult } from "./recovery-handler.js";
import { ShortlistController } from "./shortlist-controller.js";
import { suggestClosestCommand } from "./guide.js";
import { formatPercentScore } from "./score-format.js";
import { contextHasTermValue, buildSearchStateContextValue, findMatchedTermsValue } from "./search-context-helpers.js";
import {
  type AgentInterventionResult,
  buildAgentSessionSnapshot,
  cloneAgentSessionEvent,
  cloneTranscriptEntry,
  createAgentSessionEvent,
  createTranscriptEventEntry,
  createTranscriptMessageEntry,
  serializeRecoveryState,
  serializeConfidenceStatus,
  serializeRecommendation,
  serializeSessionCandidate,
  summarizeInterventionCommand,
  type AgentTranscriptEntry,
  type AgentTranscriptRole,
  type AgentInterventionCommand,
  type AgentSessionEvent,
  type AgentSessionSnapshot
} from "./agent-session-events.js";
import { parseCommand, routeCommand, type CommandAction } from "./command-router.js";
import type {
  AgentSessionStatus,
  AgentSessionTerminationReason
} from "./session-runtime-types.js";
import {
  assertAllowedRecoveryPhaseTransition,
  assertAllowedSessionStatusTransition,
  getSessionStatusForRecoveryPhase
} from "./agent-session-transitions.js";
import { ChatInterface } from "./chat.js";
import { CLI_CONFIG } from "./config.js";
import { ShortlistExporter } from "./exporter.js";
import { ProfileGenerator } from "./profile-generator.js";
import { TerminalRenderer } from "./renderer.js";
import { HybridScoringEngine } from "./scorer.js";
import { TerminalUI } from "./tui.js";
import { hydrateMemoryContextSafely } from "./memory-context.js";
import { withRetry } from "./retry.js";
import { buildSearchAttemptReport, type SearchAttemptReport } from "./search-attempt-report.js";
import {
  buildSearchFailureReport,
  toLegacyRecoveryAssessment,
  type SearchFailureReport
} from "./search-failure-report.js";
import {
  buildRecoveryBoundaryHint,
  buildRecoveryBoundaryRefinePrompt,
  getRecoveryBoundaryDiagnosticCode,
  type RecoveryBoundaryDiagnosticCode,
} from "./recovery-boundary.js";
import {
  CandidatePrimaryLink,
  ComparisonEntry,
  ComparisonEvidenceSummary,
  ComparisonResult,
  ConditionAuditItem,
  ConditionAuditStatus,
  MultiDimensionProfile,
  RecoveryDiagnosis,
  ScoredCandidate,
  SearchConditions,
  SearchDraft,
  SearchRecoveryState,
  SortMode
} from "./types.js";
import type { GlobalCommandResult } from "./types.js";

interface SearchLoopOutcome {
  type: "refine" | "restart" | "quit" | "restore" | "new" | "tasks" | "globalCommand";
  command?: string;
  args?: string;
  prompt?: string;
  conditions?: SearchConditions;  // For undo: directly restore conditions
}


export { classifyMatchStrength };

interface SearchWorkflowOptions {
  sessionId?: string;
  initialTranscript?: AgentTranscriptEntry[];
  memoryStore?: import("./user-memory-store.js").UserMemoryStore;
  workItemStore?: import("./work-item-store.js").WorkItemStore;
  /** Restore an existing work item instead of creating a new one. */
  workItemId?: string;
}

export interface QueryMatchExplanation {
  summary: string;
  reasons: string[];
}

interface QueryMatchExplanationOptions {
  score?: number;
  retrievalReasons?: string[];
  sources?: string[];
  referenceDate?: Date;
  experienceMatched?: boolean;
}

function unionDedupeStrings(a: string[] | undefined, b: string[] | undefined): string[] {
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return [...set];
}

function truncateDisplayValue(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) {
    return normalized;
  }

  return `${chars.slice(0, maxLength - 3).join("")}...`;
}

function joinRecoveryMessages(...parts: Array<string | undefined>): string | undefined {
  const seen = new Set<string>();
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.join(" ");
}

function getPrimaryUncertainty(openUncertainties: string[]): string | undefined {
  return openUncertainties.find((item) => item.trim().length > 0);
}

function getMatchedLocationsValue(
  person: Pick<Person, "primaryLocation">,
  document: Pick<SearchDocument, "facetLocation"> | undefined,
  conditions: SearchConditions
): string[] {
  if (conditions.locations.length === 0) {
    return [];
  }

  const values = [
    person.primaryLocation || "",
    ...(document?.facetLocation || [])
  ].map((value) => value.toLowerCase());

  return conditions.locations.filter((location) =>
    values.some((value) =>
      value.includes(location.toLowerCase()) || location.toLowerCase().includes(value)
    )
  );
}

function buildEvidenceHeadlineValue(item: Pick<EvidenceItem, "evidenceType" | "title" | "description">): string {
  const title = item.title?.trim();
  const description = item.description?.trim();

  if (item.evidenceType === "profile_field" && title && description) {
    return truncateDisplayValue(`${title}: ${description}`, 54);
  }

  if (title) {
    return truncateDisplayValue(title, 54);
  }

  return truncateDisplayValue(description || "未命名证据", 54);
}

function translateRetrievalReasonValue(reason: string): string | undefined {
  const normalized = reason.trim();
  if (!normalized) {
    return undefined;
  }

  const roleMatch = normalized.match(/^role match:\s*(.+)$/i);
  if (roleMatch?.[1]) {
    return `检索角色命中：${roleMatch[1].trim()}`;
  }

  const skillMatch = normalized.match(/^skill evidence:\s*(.+)$/i);
  if (skillMatch?.[1]) {
    return `检索技能命中：${skillMatch[1].trim()}`;
  }

  const mustHaveMatch = normalized.match(/^must-have matched:\s*(.+)$/i);
  if (mustHaveMatch?.[1]) {
    return `检索必须项命中：${mustHaveMatch[1].trim()}`;
  }

  const projectMatch = normalized.match(/^project:\s*(.+)$/i);
  if (projectMatch?.[1]) {
    return `相关项目：${truncateDisplayValue(projectMatch[1].trim(), 36)}`;
  }

  if (normalized === "strong semantic similarity") {
    return "语义相似度高";
  }

  if (normalized === "strong keyword overlap") {
    return "关键词重合度高";
  }

  return undefined;
}

function buildRelevantEvidenceReasonValue(
  evidence: Pick<EvidenceItem, "title" | "description" | "evidenceType">[],
  conditions: SearchConditions
): string | undefined {
  const matchedEvidence = evidence.find((item) => {
    if (!item.title && !item.description) {
      return false;
    }

    const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
    if (conditions.skills.length > 0) {
      return conditions.skills.some((skill) => contextHasTermValue(skill, text));
    }

    return item.evidenceType === "project" || item.evidenceType === "repository";
  });

  const fallbackEvidence = matchedEvidence || evidence.find(
    (item) =>
      (item.evidenceType === "project" || item.evidenceType === "repository" || item.evidenceType === "experience") &&
      Boolean(item.title || item.description)
  );

  if (!fallbackEvidence) {
    return undefined;
  }

  return `相关证据：${buildEvidenceHeadlineValue(fallbackEvidence)}`;
}

export function formatSourceLabel(source?: string): string | undefined {
  if (!source) {
    return undefined;
  }

  if (source === "bonjour") {
    return "Bonjour";
  }

  if (source === "github") {
    return "GitHub";
  }

  if (source === "web") {
    return "Web";
  }

  return source;
}

function normalizeUrlForDedupingValue(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

function buildPrimaryProjectLinkLabelValue(
  item: Pick<EvidenceItem, "evidenceType" | "title" | "description">,
  index: number
): string {
  const headline = buildEvidenceHeadlineValue(item).trim();
  if (!headline || headline === "未命名证据") {
    return `作品页 ${index + 1}`;
  }

  return `作品页：${truncateDisplayValue(headline, 24)}`;
}

export function buildCandidateSourceMetadata(
  identities: Array<Pick<PersonIdentity, "sourceProfileId">>,
  sourceProfileMap: Map<string, Pick<SourceProfile, "source" | "canonicalUrl">>,
  evidence: Array<Pick<EvidenceItem, "evidenceType" | "title" | "description" | "url" | "occurredAt">>,
  documentSources: string[] = []
): {
  sources: string[];
  bonjourUrl?: string;
  primaryLinks: CandidatePrimaryLink[];
} {
  const normalizedSources = documentSources
    .map((source) => formatSourceLabel(source) || source)
    .filter(Boolean);
  const identityProfiles = identities
    .map((identity) => sourceProfileMap.get(identity.sourceProfileId))
    .filter((profile): profile is Pick<SourceProfile, "source" | "canonicalUrl"> => Boolean(profile));
  const identitySources = identityProfiles
    .map((profile) => formatSourceLabel(profile.source))
    .filter((value): value is string => Boolean(value));
  const sources = [...new Set([...normalizedSources, ...identitySources])];

  const primaryLinks: CandidatePrimaryLink[] = [];
  const seenUrls = new Set<string>();
  const addPrimaryLink = (type: CandidatePrimaryLink["type"], label: string, url?: string | null) => {
    const trimmed = url?.trim();
    if (!trimmed) {
      return;
    }

    const normalized = normalizeUrlForDedupingValue(trimmed);
    if (!normalized || seenUrls.has(normalized)) {
      return;
    }

    seenUrls.add(normalized);
    primaryLinks.push({ type, label, url: trimmed });
  };

  const findProfileBySource = (source: SourceProfile["source"]) =>
    identityProfiles.find((profile) => profile.source === source);

  const bonjourUrl = findProfileBySource("bonjour")?.canonicalUrl;
  addPrimaryLink("bonjour", "Bonjour", bonjourUrl);
  addPrimaryLink("github", "GitHub", findProfileBySource("github")?.canonicalUrl);
  addPrimaryLink("website", "个人站点", findProfileBySource("web")?.canonicalUrl);

  const evidencePriority: Record<string, number> = {
    project: 0,
    repository: 1,
    experience: 2
  };
  const projectLinks = evidence
    .filter((item) =>
      Boolean(item.url?.trim()) &&
      (item.evidenceType === "project" || item.evidenceType === "repository" || item.evidenceType === "experience")
    )
    .sort((left, right) => {
      const priorityDelta =
        (evidencePriority[left.evidenceType] ?? 99) - (evidencePriority[right.evidenceType] ?? 99);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const leftTime = left.occurredAt?.getTime() ?? 0;
      const rightTime = right.occurredAt?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, 2);

  projectLinks.forEach((item, index) => {
    addPrimaryLink("project", buildPrimaryProjectLinkLabelValue(item, index), item.url);
  });

  return {
    sources: sources.length > 0 ? sources : bonjourUrl ? ["Bonjour"] : ["Unknown"],
    bonjourUrl,
    primaryLinks
  };
}

export function describeRelativeDate(date: Date): string {
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

export function buildQueryMatchExplanation(
  person: Pick<Person, "primaryName" | "primaryHeadline" | "primaryLocation" | "summary">,
  document: Pick<SearchDocument, "docText" | "facetRole" | "facetTags" | "facetLocation"> | undefined,
  evidence: Pick<EvidenceItem, "title" | "description" | "evidenceType">[],
  conditions: SearchConditions,
  options: QueryMatchExplanationOptions = {}
): QueryMatchExplanation {
  const context = buildSearchStateContextValue(person, document, evidence);
  const reasons: string[] = [];
  const pushReason = (value?: string) => {
    const normalized = value?.trim();
    if (!normalized || reasons.includes(normalized)) {
      return;
    }
    reasons.push(normalized);
  };

  const matchedLocations = getMatchedLocationsValue(person, document, conditions);
  if (matchedLocations.length > 0) {
    pushReason(`地点命中：${matchedLocations.slice(0, 2).join(" / ")}`);
  }

  if (conditions.role && contextHasTermValue(conditions.role, context)) {
    pushReason(`角色贴合：${conditions.role}`);
  }

  const matchedSkills = findMatchedTermsValue(conditions.skills, context);
  if (matchedSkills.length > 0) {
    pushReason(`技术命中：${matchedSkills.slice(0, 3).join(" / ")}`);
  }

  const matchedMustHave = findMatchedTermsValue(conditions.mustHave, context);
  if (matchedMustHave.length > 0) {
    pushReason(`必须项满足：${matchedMustHave.slice(0, 2).join(" / ")}`);
  }

  if (conditions.experience && options.experienceMatched) {
    pushReason(`经验层级贴合：${conditions.experience}`);
  }

  if (conditions.sourceBias) {
    const preferredSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
    if (options.sources?.includes(preferredSource)) {
      pushReason(`来源过滤命中：${preferredSource}`);
    }
  }

  if (conditions.preferFresh && options.referenceDate) {
    pushReason(`近期活跃：${describeRelativeDate(options.referenceDate)}`);
  }

  for (const reason of options.retrievalReasons ?? []) {
    pushReason(translateRetrievalReasonValue(reason));
  }

  pushReason(buildRelevantEvidenceReasonValue(evidence, conditions));

  if (reasons.length === 0 && typeof options.score === "number") {
    pushReason(`综合相关度 ${formatPercentScore(options.score)}`);
  }

  if (reasons.length === 0) {
    pushReason("与当前条件整体相关度较高");
  }

  return {
    summary: reasons.slice(0, 2).join("，"),
    reasons
  };
}

function createEmptyRecoveryState(overrides: Partial<SearchRecoveryState> = {}): SearchRecoveryState {
  return {
    phase: "idle",
    diagnosis: undefined,
    rationale: undefined,
    clarificationCount: 0,
    rewriteCount: 0,
    lowConfidenceEmitted: false,
    lastRewrittenQuery: undefined,
    boundaryDiagnosticCode: undefined,
    ...overrides
  };
}


function buildConditionAuditItem(
  label: string,
  status: ConditionAuditStatus,
  detail: string
): ConditionAuditItem {
  return { label, status, detail };
}

function hasStructuredRoleEvidence(
  person: Pick<Person, "primaryHeadline" | "summary">,
  document: Pick<SearchDocument, "facetRole"> | undefined,
  evidence: Pick<EvidenceItem, "evidenceType" | "title" | "description">[]
) {
  return Boolean(
    person.primaryHeadline ||
      person.summary ||
      (document?.facetRole && document.facetRole.length > 0) ||
      evidence.some((item) =>
        item.evidenceType === "job_signal" ||
        item.evidenceType === "experience" ||
        item.evidenceType === "profile_field"
      )
  );
}

function hasStructuredTextEvidence(
  person: Pick<Person, "primaryHeadline" | "summary">,
  document: Pick<SearchDocument, "docText" | "facetTags"> | undefined,
  evidence: Pick<EvidenceItem, "title" | "description">[]
) {
  return Boolean(
    person.primaryHeadline ||
      person.summary ||
      document?.docText ||
      (document?.facetTags && document.facetTags.length > 0) ||
      evidence.some((item) => item.title || item.description)
  );
}

function hasLocationEvidence(
  person: Pick<Person, "primaryLocation">,
  document: Pick<SearchDocument, "facetLocation"> | undefined
) {
  return Boolean(person.primaryLocation || (document?.facetLocation && document.facetLocation.length > 0));
}

function hasKnownSources(sources: string[]) {
  return sources.some((source) => source && source !== "Unknown");
}

function hasExperienceEvidence(
  person: Pick<Person, "primaryHeadline" | "summary">,
  evidence: Pick<EvidenceItem, "evidenceType" | "title" | "description">[]
) {
  return Boolean(
    person.primaryHeadline ||
      person.summary ||
      evidence.some((item) => item.evidenceType === "experience" || item.evidenceType === "job_signal")
  );
}

export function buildConditionAudit(
  person: Pick<Person, "primaryName" | "primaryHeadline" | "primaryLocation" | "summary">,
  document:
    | Pick<SearchDocument, "docText" | "facetRole" | "facetTags" | "facetLocation">
    | undefined,
  evidence: Pick<EvidenceItem, "evidenceType" | "title" | "description">[],
  conditions: SearchConditions,
  options: {
    sources?: string[];
    referenceDate?: Date;
    experienceMatched?: boolean;
  } = {}
): ConditionAuditItem[] {
  const context = buildSearchStateContextValue(person, document, evidence);
  const audit: ConditionAuditItem[] = [];

  if (conditions.locations.length > 0) {
    const matchedLocations = getMatchedLocationsValue(person, document, conditions);
    if (matchedLocations.length > 0) {
      audit.push(
        buildConditionAuditItem(
          "地点",
          "met",
          `命中 ${matchedLocations.slice(0, 2).join(" / ")}`
        )
      );
    } else if (hasLocationEvidence(person, document)) {
      audit.push(
        buildConditionAuditItem(
          "地点",
          "unmet",
          `当前资料显示 ${person.primaryLocation || document?.facetLocation?.join(" / ") || "非目标地点"}`
        )
      );
    } else {
      audit.push(buildConditionAuditItem("地点", "unknown", "暂无地点证据"));
    }
  }

  if (conditions.role) {
    if (contextHasTermValue(conditions.role, context)) {
      audit.push(buildConditionAuditItem("角色", "met", `命中 ${conditions.role}`));
    } else if (hasStructuredRoleEvidence(person, document, evidence)) {
      audit.push(buildConditionAuditItem("角色", "unmet", `当前资料未显示 ${conditions.role}`));
    } else {
      audit.push(buildConditionAuditItem("角色", "unknown", "暂无足够角色证据"));
    }
  }

  for (const skill of conditions.skills) {
    if (contextHasTermValue(skill, context)) {
      audit.push(buildConditionAuditItem(`技能 ${skill}`, "met", `命中 ${skill}`));
    } else if (hasStructuredTextEvidence(person, document, evidence)) {
      audit.push(buildConditionAuditItem(`技能 ${skill}`, "unknown", `当前资料未明确提到 ${skill}`));
    } else {
      audit.push(buildConditionAuditItem(`技能 ${skill}`, "unknown", "暂无技术证据"));
    }
  }

  for (const term of conditions.mustHave) {
    if (contextHasTermValue(term, context)) {
      audit.push(buildConditionAuditItem(`必须项 ${term}`, "met", `命中 ${term}`));
    } else if (hasStructuredTextEvidence(person, document, evidence)) {
      audit.push(buildConditionAuditItem(`必须项 ${term}`, "unknown", `当前资料未明确提到 ${term}`));
    } else {
      audit.push(buildConditionAuditItem(`必须项 ${term}`, "unknown", "暂无相关证据"));
    }
  }

  if (conditions.experience) {
    if (options.experienceMatched) {
      audit.push(buildConditionAuditItem("经验层级", "met", `贴合 ${conditions.experience}`));
    } else if (hasExperienceEvidence(person, evidence)) {
      audit.push(buildConditionAuditItem("经验层级", "unknown", `当前资料不足以确认 ${conditions.experience}`));
    } else {
      audit.push(buildConditionAuditItem("经验层级", "unknown", "暂无经验层级证据"));
    }
  }

  if (conditions.sourceBias) {
    const expectedSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
    if (options.sources?.includes(expectedSource)) {
      audit.push(buildConditionAuditItem("来源过滤", "met", `命中 ${expectedSource}`));
    } else if (options.sources && hasKnownSources(options.sources)) {
      audit.push(
        buildConditionAuditItem("来源过滤", "unmet", `当前来源为 ${options.sources.join(" / ")}`)
      );
    } else {
      audit.push(buildConditionAuditItem("来源过滤", "unknown", "暂无来源证据"));
    }
  }

  if (conditions.preferFresh) {
    if (!options.referenceDate) {
      audit.push(buildConditionAuditItem("近期活跃", "unknown", "暂无活跃时间证据"));
    } else {
      const ageInDays = Math.floor(
        (Date.now() - options.referenceDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (ageInDays <= 90) {
        audit.push(buildConditionAuditItem("近期活跃", "met", `${describeRelativeDate(options.referenceDate)}`));
      } else {
        audit.push(buildConditionAuditItem("近期活跃", "unmet", `${describeRelativeDate(options.referenceDate)}`));
      }
    }
  }

  return audit;
}

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
  private sessionState: AgentSessionState;
  private sessionId: string;
  private sessionEventSequence = 0;
  private readonly sessionEvents: AgentSessionEvent[] = [];
  private readonly sessionEventListeners = new Set<(event: AgentSessionEvent) => void>();
  private readonly transcript: AgentTranscriptEntry[];
  private tools: SearchAgentTools<
    HydratedCandidate,
    AgentInspectCandidateOutput<HydratedCandidate>,
    ComparisonEntry
  >;
  private profileManager: ProfileManager;
  private comparisonController: ComparisonController;
  private searchExecutor: SearchExecutor;
  private conditionRevisionService: ConditionRevisionService;
  private recoveryHandler: RecoveryHandler;
  private shortlistController: ShortlistController;
  private terminationReason?: AgentSessionTerminationReason;
  private executionAbortController?: AbortController;
  private launcherRequest?: "new" | "tasks";
  private readonly memoryStore?: import("./user-memory-store.js").UserMemoryStore;
  private readonly workItemStore?: import("./work-item-store.js").WorkItemStore;
  private workItemId?: string;

  constructor(
    private db: SeekuDatabase,
    private llmProvider: LLMProvider,
    options: SearchWorkflowOptions = {}
  ) {
    this.sessionId = options.sessionId ?? randomUUID();
    this.transcript = [...(options.initialTranscript ?? [])];
    this.memoryStore = options.memoryStore;
    this.workItemStore = options.workItemStore;
    this.workItemId = options.workItemId;
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
    // Interactive CLI agent uses cross-encoder by default — the heuristic-only
    // path was the dominant precision regression vs the one-shot /search CLI.
    // Set SEEKU_AGENT_CROSS_ENCODER=off to disable for cost-sensitive runs.
    const agentCrossEncoder = process.env.SEEKU_AGENT_CROSS_ENCODER === "off"
      ? undefined
      : new CrossEncoder({
          provider: llmProvider,
          batchSize: 5,
          timeoutMs: 8000
        });
    this.spinner = ora({ isEnabled: CLI_CONFIG.ui.spinnerEnabled });
    this.sessionState = createSearchSessionState();
    this.profileManager = new ProfileManager({
      cacheRepo: this.cacheRepo,
      scorer: this.scorer,
      generator: this.generator,
      getSpinner: () => this.spinner,
      getExecutionSignal: () => this.executionAbortController?.signal
    });
    this.searchExecutor = new SearchExecutor({
      db,
      llmProvider,
      planner: this.planner,
      retriever: this.retriever,
      reranker: this.reranker,
      crossEncoder: agentCrossEncoder,
      scorer: this.scorer,
      buildQueryMatchExplanation: (person, document, evidence, conditions, options) => {
        const experienceMatched = conditions.experience
          ? this.scorer.calculateExperienceMatch(person, evidence, conditions) >= 10
          : false;
        return buildQueryMatchExplanation(person, document, evidence, conditions, {
          ...options,
          experienceMatched
        });
      },
      buildConditionAudit,
      buildCandidateSourceMetadata
    });
    this.conditionRevisionService = new ConditionRevisionService({
      reviseQuery: (args) => this.tools.reviseQuery(args),
      getSessionState: () => this.sessionState,
      applySessionState: (next) => this.applySessionState(next)
    });
    this.recoveryHandler = new RecoveryHandler({
      conditionRevisionService: this.conditionRevisionService,
      chat: this.chat,
      spinner: this.spinner,
      scorer: this.scorer,
      getSessionState: () => this.sessionState,
      applySessionState: (next) => this.applySessionState(next),
      setSessionStatus: (status, summary, why) => this.setSessionStatus(status as any, summary, why),
      appendTranscriptEntry: (role, content) => this.appendTranscriptEntry(role as any, content),
      getSessionId: () => this.sessionId
    });
    this.tools = createSearchAgentTools({
      searchCandidates: async ({ query, conditions }) => {
        const result = await this.performSearch(query, conditions);
        return { query, conditions, candidates: result.candidates, diagnostics: result.diagnostics };
      },
      inspectCandidate: async ({ personId, shortlist, activeCompareSet }) =>
        inspectCandidateFromState({ personId, shortlist, activeCompareSet }),
      reviseQuery: async ({ currentConditions, prompt, shortlist = [] }) => {
        const context = buildRefineContextCandidates(shortlist);
        this.spinner.start("正在更新这轮搜索条件...");
        const updated = await this.chat.reviseConditions(
          currentConditions,
          prompt,
          "edit",
          context.length > 0 ? { shortlist: context } : undefined
        );
        this.spinner.stop();
        return {
          conditions: normalizeConditions(
            resolveCandidateAnchorWithContext(prompt, updated, context)
          ),
          context
        };
      },
      prepareComparison: async ({ targets, allCandidates }) => {
        const comparisonResult = this.buildComparisonResult(
          targets,
          allCandidates,
          this.sessionState.currentConditions
        );
        return {
          targets,
          entries: comparisonResult.entries,
          result: comparisonResult
        };
      }
    });
    this.comparisonController = new ComparisonController({
      profileManager: this.profileManager,
      tools: this.tools,
      renderer: this.renderer,
      tui: this.tui,
      chat: this.chat,
      getSessionState: () => this.sessionState,
      applySessionState: (next) => this.applySessionState(next),
      setSessionStatus: (status, summary, why) => this.setSessionStatus(status as any, summary, why),
      emitSessionEvent: (type, summary, data) => this.emitSessionEvent(type as any, summary, data),
      refreshCandidateQueryExplanation: (candidate, conditions) => this.searchExecutor.refreshCandidateQueryExplanation(candidate as any, conditions),
      decorateComparisonResult: (result, conditions) => this.recoveryHandler.applyBoundaryContextToComparisonResult(result, conditions),
      buildCompareRefinePrompt: (conditions) => this.recoveryHandler.buildCompareRefinePrompt(conditions),
      runMemoryOverlay: () => this.runMemoryOverlay()
    });
    this.shortlistController = new ShortlistController({
      tui: this.tui,
      chat: this.chat,
      renderer: this.renderer,
      exporter: this.exporter,
      comparisonController: this.comparisonController,
      profileManager: this.profileManager,
      searchExecutor: this.searchExecutor,
      recoveryHandler: this.recoveryHandler,
      scorer: this.scorer,
      tools: this.tools,
      getSessionState: () => this.sessionState,
      applySessionState: (next) => this.applySessionState(next),
      memoryStore: this.memoryStore,
      runMemoryOverlay: () => this.runMemoryOverlay()
    });
    this.emitSessionEvent(
      "session_started",
      "CLI agent 会话已启动，等待输入。",
      { snapshot: this.getSessionSnapshot() }
    );
    this.appendTranscriptEntry("assistant", "CLI agent 会话已启动，等待输入。");
  }

  private get comparePool(): HydratedCandidate[] {
    return this.sessionState.activeCompareSet as HydratedCandidate[];
  }

  private set comparePool(candidates: HydratedCandidate[]) {
    const nextState = addCompareCandidates(clearCompareSet(this.sessionState), candidates);
    this.applySessionState(nextState);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getWorkItemId(): string | undefined {
    return this.workItemId;
  }

  getSessionSnapshot(): AgentSessionSnapshot {
    return buildAgentSessionSnapshot({
      sessionId: this.sessionId,
      state: this.sessionState
    });
  }

  getSessionEvents(): AgentSessionEvent[] {
    return this.sessionEvents.map((event) => cloneAgentSessionEvent(event));
  }

  getTranscript(): AgentTranscriptEntry[] {
    return this.transcript.map((entry) => cloneTranscriptEntry(entry));
  }

  getTerminationReason(): AgentSessionTerminationReason | undefined {
    return this.terminationReason;
  }

  getLauncherRequest(): "new" | "tasks" | undefined {
    return this.launcherRequest;
  }

  interrupt(reason: AgentSessionTerminationReason = "interrupted"): void {
    this.setTerminationReason(reason);
    this.executionAbortController?.abort(new Error(`Workflow ${reason}.`));
  }

  private appendTranscriptEntry(
    role: AgentTranscriptRole,
    content: string,
    timestamp: Date = new Date()
  ): void {
    const normalized = content.trim();
    if (!normalized) {
      return;
    }

    const lastEntry = this.transcript[this.transcript.length - 1];
    if (
      lastEntry?.type === "message"
      && lastEntry.role === role
      && lastEntry.content === normalized
    ) {
      return;
    }

    this.transcript.push(
      createTranscriptMessageEntry({
        id: randomUUID(),
        role,
        content: normalized,
        timestamp: timestamp.toISOString()
      })
    );
  }

  private setTerminationReason(reason: AgentSessionTerminationReason): void {
    this.terminationReason = reason;
  }

  subscribeToSessionEvents(
    listener: (event: AgentSessionEvent) => void
  ): () => void {
    this.sessionEventListeners.add(listener);
    return () => {
      this.sessionEventListeners.delete(listener);
    };
  }

  recordInterventionReceived(command: AgentInterventionCommand): AgentSessionEvent {
    return this.emitSessionEvent(
      "intervention_received",
      `${summarizeInterventionCommand(command)}（已接收）`,
      { command }
    );
  }

  recordInterventionApplied(
    command: AgentInterventionCommand,
    details: Record<string, unknown> = {}
  ): AgentSessionEvent {
    return this.emitSessionEvent(
      "intervention_applied",
      `${summarizeInterventionCommand(command)}（已应用）`,
      { command, ...details }
    );
  }

  recordInterventionRejected(
    command: AgentInterventionCommand,
    reason: string,
    details: Record<string, unknown> = {}
  ): AgentSessionEvent {
    return this.emitSessionEvent(
      "intervention_rejected",
      `${summarizeInterventionCommand(command)}（已拒绝：${reason}）`,
      { command, reason, details }
    );
  }

  async applyIntervention(
    command: AgentInterventionCommand
  ): Promise<AgentInterventionResult> {
    this.recordInterventionReceived(command);

    if (command.type === "add_to_compare") {
      const candidate = command.candidateId
        ? this.findCandidateInSession(command.candidateId)
        : undefined;
      if (!candidate) {
        return this.rejectIntervention(command, "candidate_not_found");
      }

      const beforeCount = this.comparePool.length;
      this.shortlistController.addCandidatesToPool([candidate]);
      const added = this.comparePool.length > beforeCount;
      return this.acceptIntervention(
        command,
        added ? `已将 ${candidate.name} 加入 compare。` : `${candidate.name} 已在 compare 中。`,
        {
          candidate: serializeSessionCandidate(candidate),
          added
        }
      );
    }

    if (command.type === "remove_from_shortlist") {
      const candidate = command.candidateId
        ? this.findCandidateInSession(command.candidateId)
        : undefined;
      if (!candidate) {
        return this.rejectIntervention(command, "candidate_not_found");
      }

      const nextShortlist = this.sessionState.currentShortlist.filter(
        (entry) => entry.personId !== candidate.personId
      );
      this.applySessionState(setCurrentShortlist(this.sessionState, nextShortlist));
      return this.acceptIntervention(command, `已将 ${candidate.name} 移出 shortlist。`, {
        candidateId: candidate.personId,
        shortlistSize: this.sessionState.currentShortlist.length
      });
    }

    if (command.type === "expand_evidence") {
      const candidate = command.candidateId
        ? this.findCandidateInSession(command.candidateId)
        : undefined;
      if (!candidate) {
        return this.rejectIntervention(command, "candidate_not_found");
      }

      this.emitSessionEvent("evidence_expanded", `已展开 ${candidate.name} 的证据视图。`, {
        candidate: serializeSessionCandidate(candidate)
      });
      return this.acceptIntervention(command, `已展开 ${candidate.name} 的证据。`, {
        candidate: serializeSessionCandidate(candidate)
      });
    }

    if (command.type === "apply_feedback") {
      const normalized = command.tag?.trim().toLowerCase();
      if (!normalized) {
        return this.rejectIntervention(command, "feedback_tag_required");
      }

      const nextConditions = this.applyFeedbackTag(this.sessionState.currentConditions, normalized);
      if (!nextConditions) {
        return this.rejectIntervention(command, "invalid_feedback_tag", {
          tag: normalized
        });
      }

      this.applySessionState(setSessionConditions(this.sessionState, nextConditions));
      return this.acceptIntervention(command, `已应用反馈：${normalized}。`, {
        tag: normalized,
        conditions: nextConditions
      });
    }

    return this.rejectIntervention(command, "unsupported_intervention");
  }

  private emitSessionEvent<TData extends Record<string, unknown>>(
    type: AgentSessionEvent["type"],
    summary: string,
    data: TData,
    timestamp?: Date
  ): AgentSessionEvent<TData> {
    const event = createAgentSessionEvent({
      sessionId: this.sessionId,
      sequence: ++this.sessionEventSequence,
      type,
      status: this.sessionState.runtime.status,
      summary,
      data,
      timestamp
    });

    this.sessionEvents.push(event);
    this.transcript.push(createTranscriptEventEntry(event));
    for (const listener of this.sessionEventListeners) {
      listener(event);
    }

    return event;
  }

  private async runMemoryOverlay(): Promise<void> {
    if (!this.memoryStore) {
      console.log(chalk.yellow("\n/memory 暂时不可用。"));
      return;
    }
    const { runMemoryManagementSession } = await import("./memory-command.js");
    const enquirer = await import("enquirer");
    const { Input } = enquirer.default as unknown as { Input: any };
    await runMemoryManagementSession(this.memoryStore, async (prompt) => {
      const input = new Input({ message: prompt });
      const result = await input.run();
      return result?.trim() || null;
    });
  }

  private async handleGlobalCommand(action: CommandAction | GlobalCommandResult): Promise<"continue" | "quit"> {
    if (action.type === "unknown") {
      const suggestion = suggestClosestCommand(action.name, this.stageForCurrentState());
      const suffix = suggestion ? ` — 你是想说 /${suggestion} 吗？` : "";
      console.log(chalk.yellow(`\n未识别的命令：/${action.name}${suffix}`));
      return "continue";
    }
    const command = action.command;
    if (command === "help") {
      this.tui.displayCommandPalette(this.stageForCurrentState());
      return "continue";
    }
    if (command === "quit") {
      return "quit";
    }
    if (command === "memory") {
      await this.runMemoryOverlay();
      return "continue";
    }
    if (command === "new" || command === "tasks") {
      this.launcherRequest = command;
      return "quit";
    }
    if (command === "task" || command === "workboard") {
      await this.renderCurrentWorkboard();
      return "continue";
    }
    if (command === "transcript") {
      this.tui.displayRestoredSession(this.getTranscript());
      return "continue";
    }
    console.log(chalk.yellow(`\n/${command} 当前视图暂不支持。`));
    return "continue";
  }

  private stageForCurrentState(): "clarify" | "search" | "shortlist" | "compare" | "decision" {
    switch (this.sessionState.runtime.status) {
      case "clarifying":
      case "waiting-input":
        return "clarify";
      case "searching":
      case "recovering":
        return "search";
      case "comparing":
        return "compare";
      case "completed":
        return "decision";
      default:
        return "shortlist";
    }
  }

  private async renderCurrentWorkboard(): Promise<void> {
    const memoryContext = this.memoryStore
      ? await hydrateMemoryContextSafely(this.memoryStore)
      : null;
    if (!this.workItemStore) {
      this.tui.displayTaskWorkboard({
        title: this.sessionState.userGoal || `Session ${this.sessionId.slice(0, 8)}`,
        stage: "intake",
        stageLabel: this.sessionState.runtime.status,
        blocked: this.sessionState.runtime.status === "blocked",
        blockerLabel: this.sessionState.runtime.whySummary || this.sessionState.runtime.primaryWhyCode,
        summary: this.sessionState.runtime.statusSummary || "当前会话状态",
        nextActionTitle: "继续当前任务",
        nextActionDescription: this.sessionState.runtime.whySummary || "返回当前视图继续操作。",
        updatedAtLabel: "刚刚",
        sourceLabel: "当前会话",
        isLegacySession: true,
        sessionStatus: this.sessionState.runtime.status
      });
      return;
    }

    const snapshot = this.getSessionSnapshot();
    const workItem = this.workItemId
      ? await this.workItemStore.get(this.workItemId)
      : null;
    const viewModel = this.workItemStore.getWorkboardModel(
      workItem,
      snapshot,
      undefined,
      memoryContext,
      this.workItemId && !workItem ? this.workItemId : undefined
    );
    this.tui.displayTaskWorkboard(viewModel);
  }

  private setSessionStatus(
    status: AgentSessionStatus,
    summary?: string | null,
    why?: { primaryWhyCode?: AgentSessionWhyCode; whySummary?: string | null }
  ): void {
    const normalizedSummary = summary?.trim() || null;
    if (
      this.sessionState.runtime.status === status
      && this.sessionState.runtime.statusSummary === normalizedSummary
    ) {
      return;
    }

    assertAllowedSessionStatusTransition(this.sessionState.runtime.status, status);

    this.applySessionState(setRuntimeStatus(this.sessionState, status, {
      summary: normalizedSummary,
      ...why
    }));
    if (normalizedSummary) {
      this.appendTranscriptEntry("system", normalizedSummary);
    }
    this.emitSessionEvent("status_changed", normalizedSummary || `状态切换为 ${status}`, {
      status,
      statusSummary: normalizedSummary
    });
  }

  private applySessionState(nextState: AgentSessionState): void {
    const previousState = this.sessionState;
    this.sessionState = nextState;
    this.emitSessionStateDiff(previousState, nextState);
  }

  private emitSessionStateDiff(
    previousState: AgentSessionState,
    nextState: AgentSessionState
  ): void {
    if (previousState.userGoal !== nextState.userGoal) {
      this.emitSessionEvent("goal_updated", nextState.userGoal
        ? `搜索目标已更新：${truncateDisplayValue(nextState.userGoal, 48)}`
        : "搜索目标已清空。", {
        userGoal: nextState.userGoal
      });
    }

    if (this.conditionsSignature(previousState.currentConditions) !== this.conditionsSignature(nextState.currentConditions)) {
      this.emitSessionEvent("conditions_updated", "当前搜索条件已更新。", {
        conditions: nextState.currentConditions
      });
    }

    if (this.candidateListSignature(previousState.currentShortlist) !== this.candidateListSignature(nextState.currentShortlist)) {
      this.emitSessionEvent(
        "shortlist_updated",
        `shortlist 已更新（当前 ${nextState.currentShortlist.length} 人）。`,
        {
          shortlist: nextState.currentShortlist.map(serializeSessionCandidate),
          total: nextState.currentShortlist.length
        }
      );
    }

    if (this.candidateListSignature(previousState.activeCompareSet) !== this.candidateListSignature(nextState.activeCompareSet)) {
      this.emitSessionEvent(
        "compare_updated",
        `compare 集合已更新（当前 ${nextState.activeCompareSet.length} 人）。`,
        {
          compareSet: nextState.activeCompareSet.map(serializeSessionCandidate),
          total: nextState.activeCompareSet.length
        }
      );
    }

    if (this.confidenceSignature(previousState) !== this.confidenceSignature(nextState)) {
      this.emitSessionEvent(
        "confidence_updated",
        `信心状态已更新为 ${nextState.confidenceStatus.level}。`,
        {
          confidenceStatus: serializeConfidenceStatus(nextState.confidenceStatus)
        }
      );
    }

    if (this.recommendationSignature(previousState) !== this.recommendationSignature(nextState)) {
      this.emitSessionEvent(
        "recommendation_updated",
        nextState.recommendedCandidate
          ? `推荐候选人已更新为 ${nextState.recommendedCandidate.candidate.name}。`
          : "当前没有有效推荐。",
        {
          recommendedCandidate: serializeRecommendation(nextState.recommendedCandidate)
        }
      );
    }

    if (this.uncertaintySignature(previousState) !== this.uncertaintySignature(nextState)) {
      this.emitSessionEvent(
        "uncertainty_updated",
        nextState.openUncertainties.length > 0
          ? `当前有 ${nextState.openUncertainties.length} 条未决不确定性。`
          : "当前没有未决不确定性。",
        {
          openUncertainties: [...nextState.openUncertainties]
        }
      );
    }

    if (this.recoverySignature(previousState) !== this.recoverySignature(nextState)) {
      this.emitSessionEvent(
        "recovery_updated",
        nextState.recoveryState.phase === "idle"
          ? "当前没有活跃 recovery。"
          : `recovery 状态已更新为 ${nextState.recoveryState.phase}。`,
        {
          recoveryState: serializeRecoveryState(nextState.recoveryState)
        }
      );
    }
  }

  private conditionsSignature(conditions: SearchConditions): string {
    return JSON.stringify(conditions);
  }

  private candidateListSignature(candidates: ScoredCandidate[]): string {
    return JSON.stringify(candidates.map(serializeSessionCandidate));
  }

  private confidenceSignature(state: AgentSessionState): string {
    return JSON.stringify(serializeConfidenceStatus(state.confidenceStatus));
  }

  private recommendationSignature(state: AgentSessionState): string {
    return JSON.stringify(serializeRecommendation(state.recommendedCandidate));
  }

  private uncertaintySignature(state: AgentSessionState): string {
    return JSON.stringify(state.openUncertainties);
  }

  private recoverySignature(state: AgentSessionState): string {
    return JSON.stringify(serializeRecoveryState(state.recoveryState));
  }

  private acceptIntervention(
    command: AgentInterventionCommand,
    summary: string,
    details: Record<string, unknown> = {}
  ): AgentInterventionResult {
    this.recordInterventionApplied(command, details);
    return {
      ok: true,
      command,
      summary,
      details,
      snapshot: this.getSessionSnapshot()
    };
  }

  private rejectIntervention(
    command: AgentInterventionCommand,
    reason: string,
    details: Record<string, unknown> = {}
  ): AgentInterventionResult {
    this.recordInterventionRejected(command, reason, details);
    return {
      ok: false,
      command,
      reason,
      summary: `${summarizeInterventionCommand(command)} 被拒绝：${reason}`,
      details,
      snapshot: this.getSessionSnapshot()
    };
  }

  private findCandidateInSession(candidateId: string): HydratedCandidate | undefined {
    return this.sessionState.currentShortlist.find(
      (candidate) => candidate.personId === candidateId
    ) as HydratedCandidate | undefined
      ?? this.sessionState.activeCompareSet.find(
        (candidate) => candidate.personId === candidateId
      ) as HydratedCandidate | undefined;
  }

  private applyFeedbackTag(
    conditions: SearchConditions,
    tag: string
  ): SearchConditions | null {
    if (tag === "more_engineering_manager") {
      return normalizeConditions({
        ...conditions,
        role: "engineering manager"
      });
    }

    if (tag === "less_academic") {
      return normalizeConditions({
        ...conditions,
        exclude: [...conditions.exclude, "academic"]
      });
    }

    if (tag === "more_hands_on_builder") {
      return normalizeConditions({
        ...conditions,
        mustHave: [...conditions.mustHave, "builder"]
      });
    }

    if (tag === "prefer_recent_execution") {
      return normalizeConditions({
        ...conditions,
        preferFresh: true
      });
    }

    return null;
  }

  async execute(initialPrompt?: string): Promise<void> {
    this.tui.displayBanner();
    this.tui.displayWelcomeTips();
    this.terminationReason = undefined;
    this.executionAbortController = new AbortController();

    // Memory-aware bootstrap: hydrate and offer to adopt preferences
    let memorySeededConditions: Partial<SearchConditions> = {};
    if (this.memoryStore) {
      const { runMemoryBootstrap } = await import("./memory-bootstrap.js");
      const bootstrapResult = await runMemoryBootstrap(
        this.memoryStore,
        (prompt) => this.chat.askFreeform(prompt)
      );
      memorySeededConditions = bootstrapResult.seededConditions;
    }

    try {
      let nextPrompt = initialPrompt?.trim();
      this.setSessionStatus("waiting-input", "等待新的搜索需求。", { primaryWhyCode: "awaiting_user_input", whySummary: "等待用户输入新的搜索需求。" });

      while (true) {
        const initialInput = nextPrompt || (await this.chat.askInitial());
        nextPrompt = undefined;

        if (!initialInput) {
          this.setTerminationReason("completed");
          this.setSessionStatus("completed", "会话已结束。");
          return;
        }

        this.appendTranscriptEntry("user", initialInput);

        // Create work item for this session on first user input
        if (!this.workItemId && this.workItemStore) {
          try {
            const title = initialInput.length > 80 ? initialInput.slice(0, 77) + "..." : initialInput;
            const workItem = await this.workItemStore.create({ title });
            this.workItemId = workItem.id;
          } catch {
            // Work item creation is best-effort; session proceeds without it.
          }
        }

        const clarifyOutcome = await this.runClarifyLoop(initialInput, memorySeededConditions);
        // Seeded conditions only apply to the first clarify loop
        memorySeededConditions = {};
        if (!clarifyOutcome) {
          this.setTerminationReason("completed");
          this.setSessionStatus("completed", "会话已结束。");
          return;
        }

        const searchOutcome = await this.runSearchLoop(clarifyOutcome);
        if (searchOutcome.type === "quit") {
          this.setTerminationReason("user_exit");
          this.setSessionStatus("completed", "会话已结束。");
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
    } finally {
      this.executionAbortController = undefined;
    }
  }

  async bootstrapMission(initialPrompt: string): Promise<void> {
    const prompt = initialPrompt.trim();
    if (!prompt) {
      this.setSessionStatus("blocked", "缺少初始搜索目标。", { primaryWhyCode: "goal_missing", whySummary: "用户未提供初始搜索目标。" });
      return;
    }

    this.setSessionStatus("clarifying", "正在理解你的搜索目标。");
    let conditions = await this.extractDraftFromQuery(prompt);
    let nextState = setSessionUserGoal(this.sessionState, prompt);
    nextState = recordClarification(nextState, prompt, conditions);
    this.applySessionState(nextState);
    this.emitSessionEvent("clarify_started", "开始解析 runtime-backed 搜索目标。", {
      prompt,
      clarificationCount: this.sessionState.clarificationHistory.length
    });

    const effectiveQuery = buildEffectiveQuery(conditions);
    if (!effectiveQuery) {
      this.setSessionStatus("blocked", "当前条件不足以形成有效搜索。", { primaryWhyCode: "conditions_insufficient", whySummary: "当前搜索条件不足以形成有效查询。" });
      return;
    }

    this.setSessionStatus("searching", "正在搜索匹配候选人。");
    this.emitSessionEvent("search_started", `开始搜索：${truncateDisplayValue(effectiveQuery, 48)}`, {
      query: effectiveQuery,
      conditions
    });

    const searchResult = await this.tools.searchCandidates({
      query: effectiveQuery,
      conditions
    });
    const candidates = searchResult.candidates;

    if (candidates.length === 0) {
      let emptyState = setSessionShortlist(this.sessionState, []);
      emptyState = setOpenUncertainties(emptyState, ["当前条件下没有检索到足够候选人。"]);
      this.applySessionState(emptyState);
      this.emitSessionEvent("search_completed", "搜索完成，但当前没有命中候选人。", {
        query: effectiveQuery,
        resultCount: 0
      });
      this.setSessionStatus("waiting-input", "当前没有命中候选人，请继续收紧或调整方向。", { primaryWhyCode: "retrieval_zero_hits", whySummary: "当前条件下没有检索到任何候选人。" });
      return;
    }

    this.applySessionState(recordSearchExecution(this.sessionState, {
      conditions: { ...conditions },
      resultCount: candidates.length,
      shortlist: candidates,
      timestamp: new Date()
    }));
    this.emitSessionEvent("search_completed", `搜索完成，命中 ${candidates.length} 位候选人。`, {
      query: effectiveQuery,
      resultCount: candidates.length,
      shortlistSize: this.sessionState.currentShortlist.length
    });
    this.setSessionStatus("waiting-input", `runtime session 已准备好当前 shortlist（${candidates.length} 人）。`);
  }

  private async runClarifyLoop(initialInput: string, seededConditions?: Partial<SearchConditions>): Promise<SearchConditions | null> {
    const { extractPreferenceFromText, mergePreferenceCandidates } = await import("./preference-capture.js");
    let query = initialInput.trim();
    this.setSessionStatus("clarifying", "正在理解你的搜索目标。");
    let extracted = await this.extractDraftFromQuery(query);

    // Merge seeded memory conditions as defaults — user input overrides
    if (seededConditions && Object.keys(seededConditions).length > 0) {
      const merged: Partial<SearchConditions> = {
        ...seededConditions,
        skills: unionDedupeStrings(seededConditions.skills, extracted.skills),
        locations: unionDedupeStrings(seededConditions.locations, extracted.locations),
        mustHave: unionDedupeStrings(seededConditions.mustHave, extracted.mustHave),
        exclude: unionDedupeStrings(seededConditions.exclude, extracted.exclude),
        // User input takes precedence for scalar fields
        role: extracted.role ?? seededConditions.role,
        experience: extracted.experience ?? seededConditions.experience,
        sourceBias: extracted.sourceBias ?? seededConditions.sourceBias,
        preferFresh: extracted.preferFresh || seededConditions.preferFresh || false
      };
      extracted = normalizeConditions(merged);
    }

    let conditions = extracted;

    // Track preferences explicitly stated by the user across all utterances.
    // Initial query is user-stated text, so extract directly from it.
    let userStatedCandidate = extractPreferenceFromText(query);

    let nextState = setSessionUserGoal(this.sessionState, query);
    nextState = recordClarification(nextState, query, conditions);
    this.applySessionState(nextState);
    this.emitSessionEvent("clarify_started", "开始解析并澄清搜索目标。", {
      prompt: query,
      clarificationCount: this.sessionState.clarificationHistory.length
    });

    while (true) {
      this.tui.displayInitialSearch(query);
      this.tui.displayClarifiedDraft(this.createDraft(conditions));
      const decision = decideClarifyAction({
        conditions,
        clarificationCount: this.getClarificationTurnCount()
      });
      console.log(chalk.dim(decision.rationale));

      if (decision.action === "search") {
        this.setSessionStatus("searching", "澄清完成，准备开始搜索。");
        await this.maybeCapturePreference(userStatedCandidate, "clarify");
        return conditions;
      }

      this.setSessionStatus("waiting-input", decision.prompt || "等待补充搜索条件。");
      const instruction = await this.chat.askFreeform(
        decision.prompt || "再补一句你最看重的技能、角色或地点。"
      );

      if (!instruction) {
        console.log(chalk.dim("未继续补充，我先按当前条件搜索。"));
        this.setSessionStatus("searching", "未收到更多补充，按当前条件开始搜索。");
        await this.maybeCapturePreference(userStatedCandidate, "clarify");
        return conditions;
      }

      const parsedCommand = parseCommand(instruction);
      if (parsedCommand) {
        if (parsedCommand.kind === "palette") {
          this.tui.displayCommandPalette("clarify");
          continue;
        }
        const commandResult = await this.handleGlobalCommand(routeCommand(parsedCommand, "clarify"));
        if (commandResult === "quit") {
          return null;
        }
        continue;
      }

      this.setSessionStatus("clarifying", "正在补充搜索条件。");
      this.spinner.start("正在补充搜索条件...");

      // Extract what user explicitly stated in this clarification
      const delta = extractPreferenceFromText(instruction);
      userStatedCandidate = mergePreferenceCandidates(userStatedCandidate, delta);

      conditions = normalizeConditions(
        await this.chat.reviseConditions(conditions, instruction, "edit")
      );
      this.spinner.stop();
      this.applySessionState(recordClarification(this.sessionState, instruction, conditions));
    }
  }

  private async runSearchLoop(initialConditions: SearchConditions): Promise<SearchLoopOutcome> {
    const { extractPreferenceFromText } = await import("./preference-capture.js");
    let conditions = normalizeConditions(initialConditions);
    let sortMode: SortMode = "overall";
    let shortlistPresentation:
      | {
          lowConfidence: boolean;
          resultWarning?: string;
          uncertaintySummary?: string;
        }
      | undefined;
    this.applySessionState(resetRecoveryState(setSessionConditions(this.sessionState, conditions)));

    while (true) {
      const effectiveQuery = buildEffectiveQuery(conditions);
      if (!effectiveQuery) {
        console.log(chalk.yellow("\n当前没有可搜索的条件，请重新描述需求。"));
        this.setSessionStatus("blocked", "当前条件不足以形成有效搜索。", { primaryWhyCode: "conditions_insufficient", whySummary: "当前搜索条件不足以形成有效查询。" });
        return { type: "restart" };
      }

      let candidates: HydratedCandidate[];
      let searchDiagnostics: SearchExecutionDiagnostics | undefined;
      try {
        this.setSessionStatus("searching", "正在搜索匹配候选人。");
        this.emitSessionEvent("search_started", `开始搜索：${truncateDisplayValue(effectiveQuery, 48)}`, {
          query: effectiveQuery,
          conditions
        });
        this.spinner.start("正在搜索匹配候选人...");
        const searchResult = await this.tools.searchCandidates({
          query: effectiveQuery,
          conditions
        });
        candidates = searchResult.candidates;
        searchDiagnostics = searchResult.diagnostics;
        this.spinner.stop();
      } catch (error) {
        this.spinner.fail("搜索失败。");
        throw error;
      }

      const recoveryOutcome = await this.recoveryHandler.handleSearchRecovery(candidates, conditions, effectiveQuery, searchDiagnostics);
      if (recoveryOutcome.type === "retry" && recoveryOutcome.conditions) {
        conditions = recoveryOutcome.conditions;
        shortlistPresentation = undefined;
        sortMode = "overall";
        continue;
      }

      if (recoveryOutcome.type === "stop") {
        const stopUncertainty = getPrimaryUncertainty(this.sessionState.openUncertainties)
          || "这轮没有找到足够合适的候选人。";
        let nextState = setSessionShortlist(this.sessionState, []);
        nextState = setOpenUncertainties(nextState, [stopUncertainty]);
        this.applySessionState(nextState);
        this.emitSessionEvent("search_completed", "搜索完成，但当前没有形成可用候选池。", {
          query: effectiveQuery,
          resultCount: 0
        });
        this.tui.displayNoResults(conditions);
        console.log(chalk.dim(stopUncertainty));
        this.setSessionStatus("waiting-input", "等待你调整搜索方向。");
        const prompt = await this.chat.askFreeform(
          this.recoveryHandler.buildRecoveryRefinePrompt(
            conditions,
            this.sessionState.recoveryState.boundaryDiagnosticCode
          )
        );
        if (!prompt) {
          console.log(chalk.dim("没有收到新指令，你可以稍后再来继续。"));
          this.setSessionStatus("blocked", "未收到新的 refine 指令。", { primaryWhyCode: "awaiting_user_input", whySummary: "等待用户提供新的搜索方向。" });
          return { type: "restart" };
        }

        // Capture preferences from user-stated refine text
        const refineCandidate = extractPreferenceFromText(prompt);
        await this.maybeCapturePreference(refineCandidate, "refine");

        conditions = await this.conditionRevisionService.revise(conditions, prompt);
        shortlistPresentation = undefined;
        sortMode = "overall";
        continue;
      }

      candidates = recoveryOutcome.candidates ?? candidates;
      shortlistPresentation = {
        lowConfidence: recoveryOutcome.type === "low_confidence_shortlist",
        resultWarning: recoveryOutcome.resultWarning,
        uncertaintySummary: recoveryOutcome.uncertaintySummary
      };

      this.applySessionState(recordSearchExecution(this.sessionState, {
        conditions: { ...conditions },
        resultCount: candidates.length,
        shortlist: candidates,
        timestamp: new Date()
      }));
      this.emitSessionEvent("search_completed", `搜索完成，命中 ${candidates.length} 位候选人。`, {
        query: effectiveQuery,
        resultCount: candidates.length,
        shortlistSize: this.sessionState.currentShortlist.length
      });
      if (!shortlistPresentation.lowConfidence) {
        this.setSessionStatus("shortlist", `当前 shortlist 有 ${candidates.length} 位候选人。`);
      }

      const preloadPromise = this.profileManager.shouldPreloadProfiles()
        ? this.profileManager.preloadProfiles(candidates, conditions)
        : undefined;
      const nextAction = decidePostSearchAction({ candidates });
      console.log(chalk.dim(nextAction.rationale));
      if (!shortlistPresentation.lowConfidence && nextAction.action === "compare") {
        const compareOutcome = await this.comparisonController.presentComparison(
          nextAction.targets,
          candidates,
          conditions,
          {
            clearProfilesBeforeCompare: false,
            loadingMessage: "正在自动收敛到 compare..."
          }
        );
        preloadPromise?.catch(() => {});
        if (compareOutcome === "quit" || compareOutcome === "new" || compareOutcome === "tasks") {
          if (compareOutcome === "new" || compareOutcome === "tasks") {
            this.launcherRequest = compareOutcome;
          }
          return { type: "quit" };
        }
        if (typeof compareOutcome !== "string" && compareOutcome.type === "globalCommand") {
          const commandResult = await this.handleGlobalCommand(compareOutcome);
          if (commandResult === "quit") {
            return { type: "quit" };
          }
          continue;
        }
        if (typeof compareOutcome !== "string" && compareOutcome.type === "refine") {
          this.applySessionState(setRecoveryState(this.sessionState, {
            ...this.sessionState.recoveryState,
            compareSuggestedRefinement: undefined
          }));

          // Capture preferences from user-stated refine text
          const refineCandidate = extractPreferenceFromText(compareOutcome.prompt);
          await this.maybeCapturePreference(refineCandidate, "refine");

          conditions = await this.conditionRevisionService.revise(
            conditions,
            compareOutcome.prompt,
            candidates
          );
          shortlistPresentation = undefined;
          sortMode = "overall";
          continue;
        }
      }
      const result = await this.shortlistController.runShortlistLoop(candidates, conditions, sortMode, shortlistPresentation);
      preloadPromise?.catch(() => {});

      if (result.type === "quit") {
        return result;
      }

      if (result.type === "new" || result.type === "tasks") {
        this.launcherRequest = result.type;
        return { type: "quit" };
      }

      if (result.type === "globalCommand") {
        const commandResult = await this.handleGlobalCommand({
          type: "globalCommand",
          command: result.command || "",
          args: result.args
        });
        if (commandResult === "quit") {
          return { type: "quit" };
        }
        continue;
      }

      if (result.type === "restart") {
        return result;
      }

      if (result.type === "restore" && result.conditions) {
        // Undo: directly restore previous conditions without LLM round-trip
        conditions = normalizeConditions(result.conditions);
        shortlistPresentation = undefined;
        sortMode = "overall";
        continue;
      }

      // Capture preferences from user-stated refine text
      const refineCandidate = extractPreferenceFromText(result.prompt || "");
      await this.maybeCapturePreference(refineCandidate, "refine");

      conditions = await this.conditionRevisionService.revise(conditions, result.prompt || "", candidates);
      this.applySessionState(setRecoveryState(this.sessionState, {
        ...this.sessionState.recoveryState,
        compareSuggestedRefinement: undefined
      }));
      shortlistPresentation = undefined;
      sortMode = "overall";
    }
  }


  private async extractDraftFromQuery(query: string): Promise<SearchConditions> {
    this.spinner.start("正在分析你的需求...");
    const extracted = await this.chat.extractConditions(query);
    this.spinner.stop();
    return normalizeConditions(extracted);
  }

  private async maybeCapturePreference(
    candidate: import("./preference-capture.js").PreferenceCandidate,
    sourceContext: "clarify" | "refine"
  ): Promise<void> {
    if (!this.memoryStore) {
      return;
    }

    const { captureExplicitPreference } = await import("./preference-capture.js");
    await captureExplicitPreference(
      this.memoryStore,
      { candidate, sourceContext },
      (prompt) => this.chat.askFreeform(prompt)
    );
  }

  private getClarificationTurnCount(): number {
    return Math.max(0, this.sessionState.clarificationHistory.length - 1);
  }

  private createDraft(conditions: SearchConditions): SearchDraft {
    return {
      conditions,
      missing: this.chat.detectMissing(conditions)
    };
  }

  private async performSearch(query: string, conditions: SearchConditions): Promise<SearchExecutionResult> {
    return this.searchExecutor.performSearch(query, conditions, {
      signal: this.executionAbortController?.signal
    });
  }

  private getMatchedLocations(
    person: Person,
    document: SearchDocument | undefined,
    conditions: SearchConditions
  ): string[] {
    if (conditions.locations.length === 0) {
      return [];
    }

    const values = [
      person.primaryLocation || "",
      ...(document?.facetLocation || [])
    ].map((value) => value.toLowerCase());

    return conditions.locations.filter((location) =>
      values.some((value) =>
        value.includes(location.toLowerCase()) || location.toLowerCase().includes(value)
      )
    );
  }

  private findMatchedTerms(terms: string[], context: string): string[] {
    return findMatchedTermsValue(terms, context);
  }

  private translateRetrievalReason(reason: string): string | undefined {
    const normalized = reason.trim();
    if (!normalized) {
      return undefined;
    }

    const roleMatch = normalized.match(/^role match:\s*(.+)$/i);
    if (roleMatch?.[1]) {
      return `检索角色命中：${roleMatch[1].trim()}`;
    }

    const skillMatch = normalized.match(/^skill evidence:\s*(.+)$/i);
    if (skillMatch?.[1]) {
      return `检索技能命中：${skillMatch[1].trim()}`;
    }

    const mustHaveMatch = normalized.match(/^must-have matched:\s*(.+)$/i);
    if (mustHaveMatch?.[1]) {
      return `检索必须项命中：${mustHaveMatch[1].trim()}`;
    }

    const projectMatch = normalized.match(/^project:\s*(.+)$/i);
    if (projectMatch?.[1]) {
      return `相关项目：${truncateForDisplay(projectMatch[1].trim(), 36)}`;
    }

    if (normalized === "strong semantic similarity") {
      return "语义相似度高";
    }

    if (normalized === "strong keyword overlap") {
      return "关键词重合度高";
    }

    return undefined;
  }

  private buildRelevantEvidenceReason(
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): string | undefined {
    const matchedEvidence = evidence.find((item) => {
      if (!item.title && !item.description) {
        return false;
      }

      const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
      if (conditions.skills.length > 0) {
        return conditions.skills.some((skill) => contextHasTermValue(skill, text));
      }

      return item.evidenceType === "project" || item.evidenceType === "repository";
    });

    const fallbackEvidence = matchedEvidence || evidence.find(
      (item) =>
        (item.evidenceType === "project" || item.evidenceType === "repository" || item.evidenceType === "experience") &&
        Boolean(item.title || item.description)
    );

    if (!fallbackEvidence) {
      return undefined;
    }

    return `相关证据：${buildEvidenceHeadline(fallbackEvidence)}`;
  }

  private buildComparisonEntries(
    targets: HydratedCandidate[],
    allCandidates: HydratedCandidate[],
    conditions?: SearchConditions
  ): ComparisonEntry[] {
    const hydratedTargets = targets.filter(
      (candidate): candidate is HydratedCandidate & { profile: MultiDimensionProfile } =>
        Boolean(candidate.profile)
    );
    const hydratedAllCandidates = allCandidates.filter(
      (candidate): candidate is HydratedCandidate & { profile: MultiDimensionProfile } =>
        Boolean(candidate.profile)
    );

    return prepareComparisonEntries(hydratedTargets, hydratedAllCandidates, conditions);
  }

  private buildComparisonResult(
    targets: HydratedCandidate[],
    allCandidates: HydratedCandidate[],
    conditions?: SearchConditions
  ): ComparisonResult {
    const hydratedTargets = targets.filter(
      (candidate): candidate is HydratedCandidate & { profile: MultiDimensionProfile } =>
        Boolean(candidate.profile)
    );
    const hydratedAllCandidates = allCandidates.filter(
      (candidate): candidate is HydratedCandidate & { profile: MultiDimensionProfile } =>
        Boolean(candidate.profile)
    );

    return prepareComparisonResult(hydratedTargets, hydratedAllCandidates, conditions);
  }
}
