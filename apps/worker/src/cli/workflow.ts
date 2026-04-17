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
import { QueryPlanner, HybridRetriever, Reranker, buildDisambiguationNotes, type QueryIntent } from "@seeku/search";
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
  replaceSearchHistory,
  rewindSearchHistory,
  setCurrentShortlist,
  setConfidenceStatus,
  setOpenUncertainties,
  setRecommendedCandidate,
  setSessionConditions,
  setSessionShortlist,
  setSessionUserGoal,
  type AgentSessionState
} from "./agent-state.js";
import {
  decideClarifyAction,
  decidePostSearchAction
} from "./agent-policy.js";
import {
  buildRefineContextCandidates,
  createSearchAgentTools,
  inspectCandidateFromState,
  prepareComparisonEntries,
  prepareComparisonResult,
  resolveCandidateAnchorWithContext,
  type AgentInspectCandidateOutput,
  type SearchAgentTools
} from "./agent-tools.js";
import {
  type AgentInterventionResult,
  buildAgentSessionSnapshot,
  createAgentSessionEvent,
  serializeConfidenceStatus,
  serializeRecommendation,
  serializeSessionCandidate,
  summarizeInterventionCommand,
  type AgentInterventionCommand,
  type AgentSessionEvent,
  type AgentSessionSnapshot,
  type AgentSessionStatus
} from "./agent-session-events.js";
import { ChatInterface } from "./chat.js";
import { CLI_CONFIG } from "./config.js";
import { ShortlistExporter } from "./exporter.js";
import { ProfileGenerator } from "./profile-generator.js";
import { TerminalRenderer } from "./renderer.js";
import { HybridScoringEngine } from "./scorer.js";
import { TerminalUI } from "./tui.js";
import { withRetry } from "./retry.js";
import {
  CandidatePrimaryLink,
  ComparisonEntry,
  ComparisonEvidenceSummary,
  ComparisonResult,
  ConditionAuditItem,
  ConditionAuditStatus,
  ExportCandidateRecord,
  MultiDimensionProfile,
  ResultListCommand,
  ScoredCandidate,
  SearchConditions,
  SearchDraft,
  SearchHistoryEntry,
  ShortlistStatusMessage,
  SortMode
} from "./types.js";

interface HydratedCandidate extends ScoredCandidate {
  _hydrated: {
    person: Person;
    document?: SearchDocument;
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

export { classifyMatchStrength };

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

const SKIPPED_QUERY_VALUES = new Set(["不限", "skip", "none"]);

function truncateDisplayValue(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) {
    return normalized;
  }

  return `${chars.slice(0, maxLength - 3).join("")}...`;
}

function buildSearchStateContextValue(
  person: Pick<Person, "primaryName" | "primaryHeadline" | "primaryLocation" | "summary">,
  document: Pick<SearchDocument, "docText" | "facetRole" | "facetTags"> | undefined,
  evidence: Pick<EvidenceItem, "title" | "description">[]
): string {
  return [
    person.primaryName || "",
    person.primaryHeadline || "",
    person.primaryLocation || "",
    person.summary || "",
    document?.docText || "",
    ...(document?.facetRole || []),
    ...(document?.facetTags || []),
    ...evidence.map((item) => `${item.title || ""} ${item.description || ""}`)
  ]
    .join(" ")
    .toLowerCase();
}

function escapeRegExpValue(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldUseWordBoundaryMatchValue(term: string): boolean {
  return /[a-z0-9]/i.test(term)
    && !/[^\w\s.-]/.test(term)
    && /^[a-z0-9]/i.test(term)
    && /[a-z0-9]$/i.test(term);
}

function contextHasTermValue(term: string, context: string): boolean {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) {
    return false;
  }

  const normalizedContext = context.toLowerCase();
  if (!shouldUseWordBoundaryMatchValue(normalizedTerm)) {
    return normalizedContext.includes(normalizedTerm);
  }

  try {
    const escapedTerm = escapeRegExpValue(normalizedTerm).replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escapedTerm}\\b`, "i").test(normalizedContext);
  } catch {
    return normalizedContext.includes(normalizedTerm);
  }
}

function findMatchedTermsValue(terms: string[], context: string): string[] {
  return terms.filter((term) => contextHasTermValue(term, context));
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
    pushReason(`综合相关度 ${options.score.toFixed(1)} 分`);
  }

  if (reasons.length === 0) {
    pushReason("与当前条件整体相关度较高");
  }

  return {
    summary: reasons.slice(0, 2).join("，"),
    reasons
  };
}

export function buildResultWarning(
  candidates: Array<Pick<ScoredCandidate, "matchStrength">>
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.some((candidate) => candidate.matchStrength === "strong")) {
    return undefined;
  }

  if (candidates.some((candidate) => candidate.matchStrength === "medium")) {
    return "没有找到强匹配，当前结果以中等相关候选人为主。建议继续补充必须项、关键技术或放宽来源过滤。";
  }

  return "没有找到强匹配，只找到了弱相关候选人。建议继续补充必须项、关键技术或放宽来源过滤。";
}

function buildFullMatchReason(candidate: Pick<ScoredCandidate, "queryReasons" | "matchReason">) {
  if (candidate.queryReasons && candidate.queryReasons.length > 0) {
    return candidate.queryReasons.join("；");
  }

  return candidate.matchReason || "与当前条件整体相关度较高";
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
  private readonly sessionId = randomUUID();
  private sessionStatus: AgentSessionStatus = "idle";
  private sessionStatusSummary: string | null = "等待输入";
  private sessionEventSequence = 0;
  private readonly sessionEvents: AgentSessionEvent[] = [];
  private readonly sessionEventListeners = new Set<(event: AgentSessionEvent) => void>();
  private tools: SearchAgentTools<
    HydratedCandidate,
    AgentInspectCandidateOutput<HydratedCandidate>,
    ComparisonEntry
  >;
  private processingProfiles = new Map<string, Promise<MultiDimensionProfile>>();

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
    this.sessionState = createSearchSessionState();
    this.tools = createSearchAgentTools({
      searchCandidates: async ({ query, conditions }) => ({
        query,
        conditions,
        candidates: await this.performSearch(query, conditions)
      }),
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
          conditions: this.normalizeConditions(
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
    this.emitSessionEvent(
      "session_started",
      "CLI agent 会话已启动，等待输入。",
      { snapshot: this.getSessionSnapshot() }
    );
  }

  private get comparePool(): HydratedCandidate[] {
    return this.sessionState.activeCompareSet as HydratedCandidate[];
  }

  private set comparePool(candidates: HydratedCandidate[]) {
    const nextState = addCompareCandidates(clearCompareSet(this.sessionState), candidates);
    this.applySessionState(nextState);
  }

  private get searchHistory(): SearchHistoryEntry[] {
    return this.sessionState.searchHistory;
  }

  private set searchHistory(entries: SearchHistoryEntry[]) {
    this.applySessionState(replaceSearchHistory(this.sessionState, entries));
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSessionSnapshot(): AgentSessionSnapshot {
    return buildAgentSessionSnapshot({
      sessionId: this.sessionId,
      state: this.sessionState,
      status: this.sessionStatus,
      statusSummary: this.sessionStatusSummary
    });
  }

  getSessionEvents(): AgentSessionEvent[] {
    return this.sessionEvents.map((event) => ({
      ...event,
      data: { ...event.data }
    }));
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
      this.addCandidatesToPool([candidate]);
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
      status: this.sessionStatus,
      summary,
      data,
      timestamp
    });

    this.sessionEvents.push(event);
    for (const listener of this.sessionEventListeners) {
      listener(event);
    }

    return event;
  }

  private setSessionStatus(status: AgentSessionStatus, summary?: string | null): void {
    const normalizedSummary = summary?.trim() || null;
    if (this.sessionStatus === status && this.sessionStatusSummary === normalizedSummary) {
      return;
    }

    this.sessionStatus = status;
    this.sessionStatusSummary = normalizedSummary;
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
      return this.normalizeConditions({
        ...conditions,
        role: "engineering manager"
      });
    }

    if (tag === "less_academic") {
      return this.normalizeConditions({
        ...conditions,
        exclude: [...conditions.exclude, "academic"]
      });
    }

    if (tag === "more_hands_on_builder") {
      return this.normalizeConditions({
        ...conditions,
        mustHave: [...conditions.mustHave, "builder"]
      });
    }

    if (tag === "prefer_recent_execution") {
      return this.normalizeConditions({
        ...conditions,
        preferFresh: true
      });
    }

    return null;
  }

  async execute(initialPrompt?: string): Promise<void> {
    this.tui.displayBanner();
    this.tui.displayWelcomeTips();

    let nextPrompt = initialPrompt?.trim();
    this.setSessionStatus("waiting-input", "等待新的搜索需求。");

    while (true) {
      const initialInput = nextPrompt || (await this.chat.askInitial());
      nextPrompt = undefined;

      if (!initialInput) {
        this.setSessionStatus("completed", "会话已结束。");
        return;
      }

      const clarifyOutcome = await this.runClarifyLoop(initialInput);
      if (!clarifyOutcome) {
        this.setSessionStatus("completed", "会话已结束。");
        return;
      }

      const searchOutcome = await this.runSearchLoop(clarifyOutcome);
      if (searchOutcome.type === "quit") {
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
  }

  private async runClarifyLoop(initialInput: string): Promise<SearchConditions | null> {
    let query = initialInput.trim();
    this.setSessionStatus("clarifying", "正在理解你的搜索目标。");
    let conditions = await this.extractDraftFromQuery(query);
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
      console.log(chalk.dim(`Agent 决策：${decision.rationale}`));

      if (decision.action === "search") {
        this.setSessionStatus("searching", "澄清完成，准备开始搜索。");
        return conditions;
      }

      this.setSessionStatus("waiting-input", decision.prompt || "等待补充搜索条件。");
      const instruction = await this.chat.askFreeform(
        decision.prompt || "再补一句你最看重的技能、角色或地点。"
      );

      if (!instruction) {
        console.log(chalk.dim("未继续补充，我先按当前条件搜索。"));
        this.setSessionStatus("searching", "未收到更多补充，按当前条件开始搜索。");
        return conditions;
      }

      this.setSessionStatus("clarifying", "正在补充搜索条件。");
      this.spinner.start("正在补充搜索条件...");
      conditions = this.normalizeConditions(
        await this.chat.reviseConditions(conditions, instruction, "edit")
      );
      this.spinner.stop();
      this.applySessionState(recordClarification(this.sessionState, instruction, conditions));
    }
  }

  private async runSearchLoop(initialConditions: SearchConditions): Promise<SearchLoopOutcome> {
    let conditions = this.normalizeConditions(initialConditions);
    let sortMode: SortMode = "overall";
    this.applySessionState(setSessionConditions(this.sessionState, conditions));

    while (true) {
      const effectiveQuery = this.buildEffectiveQuery(conditions);
      if (!effectiveQuery) {
        console.log(chalk.yellow("\n当前没有可搜索的条件，请重新描述需求。"));
        this.setSessionStatus("blocked", "当前条件不足以形成有效搜索。");
        return { type: "restart" };
      }

      let candidates: HydratedCandidate[];
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
        this.spinner.stop();
      } catch (error) {
        this.spinner.fail("搜索失败。");
        throw error;
      }

      if (candidates.length === 0) {
        let nextState = setSessionShortlist(this.sessionState, []);
        nextState = setOpenUncertainties(nextState, ["当前条件下没有检索到足够候选人。"]);
        this.applySessionState(nextState);
        this.emitSessionEvent("search_completed", "搜索完成，但当前没有命中候选人。", {
          query: effectiveQuery,
          resultCount: 0
        });
        this.setSessionStatus("blocked", "当前条件下没有检索到足够候选人。");
        this.tui.displayNoResults(conditions);
        this.setSessionStatus("waiting-input", "等待你调整搜索方向。");
        const prompt = await this.chat.askFreeform("想怎么调整这轮搜索？例如：去掉销售 / 更看重最近活跃 / 更偏 Bonjour");
        if (!prompt) {
          this.setSessionStatus("blocked", "未收到新的 refine 指令。");
          return { type: "restart" };
        }

        conditions = await this.reviseSessionConditions(conditions, prompt);
        sortMode = "overall";
        continue;
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
      this.setSessionStatus("shortlist", `当前 shortlist 有 ${candidates.length} 位候选人。`);

      const preloadPromise = this.shouldPreloadProfiles()
        ? this.preloadProfiles(candidates, conditions)
        : undefined;
      const nextAction = decidePostSearchAction({ candidates });
      console.log(chalk.dim(`Agent 决策：${nextAction.rationale}`));
      if (nextAction.action === "compare") {
        const compareOutcome = await this.presentComparison(
          nextAction.targets,
          candidates,
          conditions,
          {
            clearProfilesBeforeCompare: false,
            loadingMessage: "正在自动收敛到 compare..."
          }
        );
        preloadPromise?.catch(() => {});
        if (compareOutcome === "quit") {
          return { type: "quit" };
        }
      }
      const result = await this.runShortlistLoop(candidates, conditions, sortMode);
      preloadPromise?.catch(() => {});

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

      conditions = await this.reviseSessionConditions(conditions, result.prompt || "", candidates);
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
    let selectedIndex = 0;
    const resultWarning = buildResultWarning(candidates);
    let statusMessage: ShortlistStatusMessage | undefined;
    let reuseViewport = false;

    await this.sortCandidates(candidates, sortMode, conditions);

    while (true) {
      this.tui.displayShortlist(candidates, conditions, {
        sortMode,
        showingCount: visibleCount,
        totalCount: candidates.length,
        poolCount: this.comparePool.length,
        poolPersonIds: this.comparePool.map((candidate) => candidate.personId),
        selectedIndex,
        resultWarning,
        statusMessage,
        reuseViewport
      });

      const command = await this.tui.promptShortlistAction({
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

      this.tui.resetShortlistViewport();
      return outcome.result;
    }
  }

  private async handleShortlistCommand(
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
      this.tui.resetShortlistViewport();
      this.tui.displayHelp();
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
      this.tui.resetShortlistViewport();
      const prompt = command.prompt || await this.chat.askFreeform("想怎么继续 refine？例如：去掉销售 / 更看重最近活跃 / 像 2 号但更偏后端");
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

      return continueWith({
        statusMessage: {
          tone: "success",
          text: `✓ 已从对比池移出 ${removedCount} 位候选人（当前 ${this.comparePool.length} 人）。`
        },
        reuseViewport: true
      });
    }

    if (command.type === "pool") {
      this.tui.resetShortlistViewport();
      if (this.comparePool.length === 0) {
        this.tui.displayPoolEmpty();
      } else {
        this.tui.displayPool(this.comparePool);
      }
      return continueWith();
    }

    if (command.type === "clear") {
      this.applySessionState(clearCompareSet(this.sessionState));
      return continueWith({
        statusMessage: {
          tone: "success",
          text: "✓ 对比池已清空。"
        },
        reuseViewport: true
      });
    }

    if (command.type === "history") {
      this.tui.resetShortlistViewport();
      this.tui.displayHistory(this.sessionState.searchHistory);
      return continueWith();
    }

    if (command.type === "show") {
      this.tui.resetShortlistViewport();
      this.tui.displayFilters(conditions);
      return continueWith();
    }

    if (command.type === "export") {
      this.tui.resetShortlistViewport();
      const exportTarget = command.exportTarget || "shortlist";
      const exportFormat = command.exportFormat || "md";
      const targets = exportTarget === "pool"
        ? [...this.comparePool]
        : candidates.slice(0, state.visibleCount);

      if (targets.length === 0) {
        this.tui.displayExportEmpty(exportTarget);
        return continueWith();
      }

      for (const target of targets) {
        this.refreshCandidateQueryExplanation(target, conditions);
      }

      let comparisonEntries: ComparisonEntry[] = [];
      if (exportTarget === "pool" && targets.length >= 2) {
        await this.ensureProfiles(targets, conditions, "正在准备对比池导出...");
        const prepared = await this.tools.prepareComparison({
          targets,
          allCandidates: candidates
        });
        comparisonEntries = prepared.entries;
      }

      const artifact = await this.exporter.export({
        format: exportFormat,
        target: exportTarget,
        querySummary: this.formatConditionsAsPrompt(conditions),
        records: this.buildExportRecords(targets, candidates, comparisonEntries)
      });

      this.tui.displayExportSuccess(artifact);
      return continueWith();
    }

    if (command.type === "undo") {
      // Get previous conditions from history (skip current entry)
      if (this.searchHistory.length < 2) {
        this.tui.resetShortlistViewport();
        this.tui.displayUndo(null);
        return continueWith();
      }

      const previousEntry = this.searchHistory[this.searchHistory.length - 2];
      this.tui.resetShortlistViewport();
      this.tui.displayUndo(previousEntry.conditions);

      this.applySessionState(rewindSearchHistory(this.sessionState, 2));

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
        return continueWith({
          statusMessage: this.buildCompareNeedsMoreCandidatesMessage(
            usePool ? this.comparePool.length : targets.length
          ),
          reuseViewport: true
        });
      }

      const compareOutcome = await this.presentComparison(targets, candidates, conditions, {
        clearProfilesBeforeCompare: usePool,
        loadingMessage: "正在准备候选人对比..."
      });
      if (compareOutcome === "quit") {
        return { type: "done", result: { type: "quit" } };
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

      this.tui.resetShortlistViewport();
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

  private async showCandidateDetail(
    selected: HydratedCandidate,
    conditions: SearchConditions
  ): Promise<DetailOutcome> {
    this.refreshCandidateQueryExplanation(selected, conditions);
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
          conditionAudit: selected.conditionAudit,
          queryReasons: selected.queryReasons,
          matchStrength: selected.matchStrength,
          sources: selected.sources,
          bonjourUrl: selected.bonjourUrl,
          primaryLinks: selected.primaryLinks,
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
        console.log(this.renderer.renderWhyMatched(selected, profile, conditions));
        continue;
      }

      if (action === "refine") {
        const prompt = await this.chat.askFreeform(
          `想基于 ${selected.name} 怎么继续收敛？例如：去掉销售 / 更看重最近活跃 / 更偏 Bonjour`
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

  private addCandidatesToPool(targets: HydratedCandidate[]): number {
    const beforeCount = this.comparePool.length;
    this.applySessionState(addCompareCandidates(this.sessionState, targets));
    const addedCount = this.comparePool.length - beforeCount;
    return addedCount;
  }

  private removeCandidatesFromPool(targets: HydratedCandidate[]): number {
    const beforeCount = this.comparePool.length;
    this.applySessionState(removeCompareCandidatesFromState(
      this.sessionState,
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
    candidate: Pick<ScoredCandidate, "name" | "bonjourUrl">
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

  private async extractDraftFromQuery(query: string): Promise<SearchConditions> {
    this.spinner.start("正在分析你的需求...");
    const extracted = await this.chat.extractConditions(query);
    this.spinner.stop();
    return this.normalizeConditions(extracted);
  }

  private getClarificationTurnCount(): number {
    return Math.max(0, this.sessionState.clarificationHistory.length - 1);
  }

  private async presentComparison(
    targets: HydratedCandidate[],
    allCandidates: HydratedCandidate[],
    conditions: SearchConditions,
    options: {
      clearProfilesBeforeCompare: boolean;
      loadingMessage: string;
    }
  ): Promise<"back" | "clear" | "quit"> {
    this.tui.resetShortlistViewport();
    for (const target of targets) {
      this.refreshCandidateQueryExplanation(target, conditions);
    }

    if (options.clearProfilesBeforeCompare) {
      for (const target of targets) {
        delete target.profile;
      }
    }

    this.setSessionStatus("comparing", `正在比较 ${targets.length} 位候选人。`);
    this.emitSessionEvent("compare_started", `开始 compare ${targets.length} 位候选人。`, {
      candidateIds: targets.map((target) => target.personId),
      total: targets.length
    });
    this.applySessionState(addCompareCandidates(this.sessionState, targets));
    await this.ensureProfiles(targets, conditions, options.loadingMessage);
    const prepared = await this.tools.prepareComparison({
      targets,
      allCandidates
    });
    const comparisonEntries = prepared.entries;
    const comparisonResult = prepared.result ?? {
      entries: comparisonEntries,
      outcome: {
        confidence: "low-confidence" as const,
        recommendationMode: "no-recommendation" as const,
        recommendation: "我还没有足够证据推荐单一候选人。",
        rationale: "当前 compare 结果缺少结构化 outcome。",
        largestUncertainty: "compare outcome 缺失。"
      }
    };
    this.applySessionState(setConfidenceStatus(
      this.sessionState,
      comparisonResult.outcome.confidence
    ));
    this.applySessionState(setOpenUncertainties(this.sessionState, [
      comparisonResult.outcome.largestUncertainty
    ]));
    if (
      comparisonResult.outcome.recommendedCandidateId
      && comparisonResult.outcome.recommendationMode !== "no-recommendation"
    ) {
      const targetRecommendation = targets.find(
        (candidate) => candidate.personId === comparisonResult.outcome.recommendedCandidateId
      );
      if (targetRecommendation) {
        const recommendation = setRecommendedCandidate(this.sessionState, targetRecommendation, {
          rationale: comparisonResult.outcome.rationale
        });
        this.applySessionState(recommendation.state);
      }
    }
    console.log(this.renderer.renderComparison(comparisonResult, conditions));
    this.setSessionStatus("waiting-input", "compare 已完成，等待下一步操作。");

    while (true) {
      const action = await this.tui.promptCompareAction();
      if (action === "back") {
        return "back";
      }

      if (action === "clear") {
        this.applySessionState(clearCompareSet(this.sessionState));
        this.tui.displayPoolCleared();
        return "clear";
      }

      if (action === "quit") {
        return "quit";
      }
    }
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

    const candidateAnchor = conditions.candidateAnchor
      ? {
          shortlistIndex:
            typeof conditions.candidateAnchor.shortlistIndex === "number" &&
            conditions.candidateAnchor.shortlistIndex > 0
              ? conditions.candidateAnchor.shortlistIndex
              : undefined,
          personId: conditions.candidateAnchor.personId?.trim() || undefined,
          name: conditions.candidateAnchor.name?.trim() || undefined
        }
      : undefined;

    return {
      skills: dedupe(conditions.skills),
      locations: dedupe(conditions.locations),
      experience: conditions.experience?.trim() || undefined,
      role: conditions.role?.trim() || undefined,
      sourceBias: conditions.sourceBias,
      mustHave: dedupe(conditions.mustHave),
      niceToHave: dedupe(conditions.niceToHave),
      exclude: dedupe(conditions.exclude),
      preferFresh: Boolean(conditions.preferFresh),
      candidateAnchor:
        candidateAnchor?.shortlistIndex || candidateAnchor?.personId || candidateAnchor?.name
          ? candidateAnchor
          : undefined,
      limit: conditions.limit || CLI_CONFIG.ui.defaultLimit
    };
  }

  private buildEffectiveQuery(conditions: SearchConditions): string {
    return [
      ...conditions.skills,
      ...conditions.locations,
      conditions.experience ?? "",
      conditions.role ?? "",
      conditions.sourceBias ?? "",
      ...conditions.mustHave.map((value) => `must have ${value}`),
      ...conditions.niceToHave.map((value) => `prefer ${value}`),
      ...conditions.exclude.map((value) => `exclude ${value}`),
      conditions.preferFresh ? "prefer recent active profiles" : "",
      conditions.candidateAnchor?.name ? `similar to ${conditions.candidateAnchor.name}` : "",
      conditions.candidateAnchor?.shortlistIndex
        ? `similar to shortlist ${conditions.candidateAnchor.shortlistIndex}`
        : ""
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
      sourceBias: conditions.sourceBias ?? "",
      mustHave: normalizeArray(conditions.mustHave),
      niceToHave: normalizeArray(conditions.niceToHave),
      exclude: normalizeArray(conditions.exclude),
      preferFresh: conditions.preferFresh,
      candidateAnchor: {
        shortlistIndex: conditions.candidateAnchor?.shortlistIndex ?? "",
        personId: conditions.candidateAnchor?.personId?.trim().toLowerCase() ?? "",
        name: conditions.candidateAnchor?.name?.trim().toLowerCase() ?? ""
      }
    };

    return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  }

  private async performSearch(query: string, conditions: SearchConditions): Promise<HydratedCandidate[]> {
    const limit = conditions.limit;
    const intent = this.mergeIntentWithConditions(await this.planner.parse(query), conditions);
    const queryEmbedding = await this.llmProvider.embed(intent.rawQuery);

    let retrieved = await this.retriever.retrieve(intent, { embedding: queryEmbedding.embedding });

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

    const filteredRetrieved = retrieved.filter((result) => {
      const person = personMap.get(result.personId);
      if (!person) {
        return false;
      }

      return this.matchesSearchState(
        person,
        documentMap.get(result.personId),
        evidenceMap.get(result.personId) || [],
        conditions
      );
    });

    const reranked = this.reranker.rerank(filteredRetrieved, intent, documentMap, evidenceMap);
    const hydrationWindow = conditions.preferFresh ? Math.min(reranked.length, limit * 2) : limit;
    const hydrated: HydratedCandidate[] = reranked.slice(0, hydrationWindow).map((result) => {
      const person = personMap.get(result.personId);
      if (!person) {
        throw new Error(`Candidate ${result.personId} not found in database.`);
      }

      const document = documentMap.get(result.personId);
      const candidateEvidence = evidenceMap.get(result.personId) || [];
      const personIdentities = identityMap.get(result.personId) || [];

      const { sources, bonjourUrl, primaryLinks } = buildCandidateSourceMetadata(
        personIdentities,
        sourceProfileMap,
        candidateEvidence,
        document?.facetSource ?? []
      );

      // Latest evidence timestamp
      const latestEvidenceAt = candidateEvidence.length > 0
        ? candidateEvidence
            .map((item) => item.occurredAt)
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : undefined;
      const referenceDate = latestEvidenceAt ?? person.updatedAt;
      const experienceMatched = conditions.experience
        ? this.scorer.calculateExperienceMatch(person, candidateEvidence, conditions) >= 10
        : false;
      const queryMatch = this.buildQueryMatchExplanation(
        person,
        document,
        candidateEvidence,
        conditions,
        {
          score: result.finalScore,
          retrievalReasons: result.matchReasons,
          sources,
          referenceDate
        }
      );
      const conditionAudit = buildConditionAudit(person, document, candidateEvidence, conditions, {
        sources,
        referenceDate,
        experienceMatched
      });

      return {
        personId: result.personId,
        name: person.primaryName,
        headline: person.primaryHeadline,
        location: person.primaryLocation,
        company: null,
        experienceYears: null,
        matchScore: result.finalScore,
        matchStrength: classifyMatchStrength(result.finalScore, queryMatch.reasons),
        matchReason: queryMatch.summary,
        queryReasons: queryMatch.reasons,
        conditionAudit,
        sources,
        bonjourUrl,
        primaryLinks,
        lastSyncedAt: person.updatedAt,
        latestEvidenceAt,
        _hydrated: {
          person,
          document,
          evidence: candidateEvidence
        }
      };
    });

    const disambiguationNotes = buildDisambiguationNotes(
      this.buildEffectiveQuery(conditions),
      hydrated.map((candidate) => ({
        personId: candidate.personId,
        name: candidate.name,
        headline: candidate.headline,
        matchReasons: candidate.queryReasons,
        document: candidate._hydrated.document
      }))
    );

    hydrated.forEach((candidate) => {
      const disambiguation = disambiguationNotes.get(candidate.personId);
      if (!disambiguation) {
        return;
      }

      candidate.disambiguation = disambiguation;
      candidate.matchReason = `${candidate.matchReason} ${disambiguation}`;
    });

    const ordered = this.applySearchStateOrdering(hydrated, conditions).slice(0, limit);
    return ordered.length > 0 ? ordered : this.performFallbackSearch(conditions);
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
        ...conditions.skills,
        ...conditions.mustHave
      ]),
      niceToHaves: unique([
        ...intent.niceToHaves,
        ...conditions.niceToHave
      ])
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

    if (conditions.sourceBias) {
      filters.push(sql`${searchDocuments.facetSource} && ARRAY[${conditions.sourceBias}]::text[]`);
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

    const fallbackDocumentMap = new Map<string, SearchDocument>(
      rows.map((row) => [row.person.id, row.document as SearchDocument])
    );

    const scored: HydratedCandidate[] = rows
      .map((row) => {
        const person = row.person as Person;
        const document = row.document as SearchDocument;
        const candidateEvidence = evidenceMap.get(person.id) || [];
        const personIdentities = identityMap.get(person.id) || [];
        const heuristicScore = this.computeFallbackScore(person, document, candidateEvidence, conditions);

        const { sources, bonjourUrl, primaryLinks } = buildCandidateSourceMetadata(
          personIdentities,
          sourceProfileMap,
          candidateEvidence,
          document.facetSource ?? []
        );

        // Latest evidence timestamp
        const latestEvidenceAt = candidateEvidence.length > 0
          ? candidateEvidence
              .map((item) => item.occurredAt)
              .filter((date): date is Date => Boolean(date))
              .sort((a, b) => b.getTime() - a.getTime())[0]
          : undefined;
        const referenceDate = latestEvidenceAt ?? person.updatedAt;
        const experienceMatched = conditions.experience
          ? this.scorer.calculateExperienceMatch(person, candidateEvidence, conditions) >= 10
          : false;
        const queryMatch = this.buildQueryMatchExplanation(
          person,
          document,
          candidateEvidence,
          conditions,
          {
            score: heuristicScore,
            sources,
            referenceDate
          }
        );
        const conditionAudit = buildConditionAudit(person, document, candidateEvidence, conditions, {
          sources,
          referenceDate,
          experienceMatched
        });

        return {
          personId: person.id,
          name: person.primaryName,
          headline: person.primaryHeadline,
          location: person.primaryLocation,
          company: null,
          experienceYears: null,
          matchScore: heuristicScore,
          matchStrength: classifyMatchStrength(heuristicScore, queryMatch.reasons),
          matchReason: queryMatch.summary,
          queryReasons: queryMatch.reasons,
          conditionAudit,
          sources,
          bonjourUrl,
          primaryLinks,
          lastSyncedAt: person.updatedAt,
          latestEvidenceAt,
          _hydrated: {
            person,
            document,
            evidence: candidateEvidence
          }
        } satisfies HydratedCandidate;
      })
      .filter((candidate) =>
        this.matchesSearchState(
          candidate._hydrated.person,
          fallbackDocumentMap.get(candidate.personId),
          candidate._hydrated.evidence,
          conditions
        )
      )
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, conditions.limit);

    const disambiguationNotes = buildDisambiguationNotes(
      this.buildEffectiveQuery(conditions),
      scored.map((candidate) => ({
        personId: candidate.personId,
        name: candidate.name,
        headline: candidate.headline,
        matchReasons: candidate.queryReasons,
        document: candidate._hydrated.document
      }))
    );

    scored.forEach((candidate) => {
      const disambiguation = disambiguationNotes.get(candidate.personId);
      if (!disambiguation) {
        return;
      }

      candidate.disambiguation = disambiguation;
      candidate.matchReason = `${candidate.matchReason} ${disambiguation}`;
    });

    return this.applySearchStateOrdering(scored, conditions);
  }

  private computeFallbackScore(
    person: Person,
    document: SearchDocument,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): number {
    const context = this.buildSearchStateContext(person, document, evidence.slice(0, 8));

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

    if (conditions.role && contextHasTermValue(conditions.role, context)) {
      score += 15;
    }

    if (conditions.skills.length > 0) {
      const matchedSkills = conditions.skills.filter((skill) => contextHasTermValue(skill, context));
      score += Math.round((matchedSkills.length / conditions.skills.length) * 25);
    }

    if (conditions.niceToHave.length > 0) {
      const matchedNiceToHave = conditions.niceToHave.filter((term) => contextHasTermValue(term, context));
      score += Math.min(10, matchedNiceToHave.length * 4);
    }

    return Math.min(100, score);
  }

  private matchesSearchState(
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    conditions: SearchConditions
  ): boolean {
    const context = this.buildSearchStateContext(person, document, evidence);

    if (conditions.mustHave.length > 0) {
      const hasMissingMustHave = conditions.mustHave.some(
        (term) => !contextHasTermValue(term, context)
      );
      if (hasMissingMustHave) {
        return false;
      }
    }

    if (conditions.exclude.length > 0) {
      const hasExcludedTerm = conditions.exclude.some(
        (term) => contextHasTermValue(term, context)
      );
      if (hasExcludedTerm) {
        return false;
      }
    }

    if (conditions.sourceBias) {
      const expectedSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
      // This is the 'hard filter' part - even if the retriever allowed it, we strictly filter here
      if (document && !document.facetSource.includes(expectedSource)) {
        return false;
      }
    }

    return true;
  }

  private buildSearchStateContext(
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[]
  ): string {
    return buildSearchStateContextValue(person, document, evidence);
  }

  private buildQueryMatchExplanation(
    person: Person,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    conditions: SearchConditions,
    options: {
      score?: number;
      retrievalReasons?: string[];
      sources?: string[];
      referenceDate?: Date;
    } = {}
  ): QueryMatchExplanation {
    const experienceMatched = conditions.experience
      ? this.scorer.calculateExperienceMatch(person, evidence, conditions) >= 10
      : false;

    return buildQueryMatchExplanation(person, document, evidence, conditions, {
      ...options,
      experienceMatched
    });
  }

  private refreshCandidateQueryExplanation(
    candidate: HydratedCandidate,
    conditions: SearchConditions
  ) {
    const referenceDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
    const experienceMatched = conditions.experience
      ? this.scorer.calculateExperienceMatch(candidate._hydrated.person, candidate._hydrated.evidence, conditions) >= 10
      : false;
    const explanation = this.buildQueryMatchExplanation(
      candidate._hydrated.person,
      candidate._hydrated.document,
      candidate._hydrated.evidence,
      conditions,
      {
        score: candidate.matchScore,
        sources: candidate.sources,
        referenceDate
      }
    );

    candidate.matchReason = explanation.summary;
    candidate.queryReasons = explanation.reasons;
    candidate.matchStrength = classifyMatchStrength(candidate.matchScore, explanation.reasons);
    candidate.conditionAudit = buildConditionAudit(
      candidate._hydrated.person,
      candidate._hydrated.document,
      candidate._hydrated.evidence,
      conditions,
      {
        sources: candidate.sources,
        referenceDate,
        experienceMatched
      }
    );
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
    return terms.filter((term) => contextHasTermValue(term, context));
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
      return `相关项目：${this.truncateForDisplay(projectMatch[1].trim(), 36)}`;
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

    return `相关证据：${this.buildEvidenceHeadline(fallbackEvidence)}`;
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
        whyMatched: buildFullMatchReason(candidate),
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

    if (profile.dimensions.techMatch >= 80) {
      score += 3;
    }

    if (profile.dimensions.projectDepth >= 70) {
      score += 2;
    }

    return score;
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
    decisionTag: ComparisonEntry["decisionTag"],
    conditions?: SearchConditions
  ): string {
    const reasons: string[] = [];

    if (candidate.queryReasons && candidate.queryReasons.length > 0) {
      reasons.push(...candidate.queryReasons.slice(0, 2));
    }

    if (profile.dimensions.techMatch >= 75) {
      reasons.push("技术相关性强");
    }

    if (profile.dimensions.projectDepth >= 65) {
      reasons.push("项目证据更扎实");
    }

    if (profile.dimensions.locationMatch >= 90) {
      reasons.push("地点完全匹配");
    }

    if (conditions?.sourceBias && candidate.sources.includes(conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub")) {
      reasons.push("满足当前来源过滤");
    }

    if (candidate.latestEvidenceAt || candidate.lastSyncedAt) {
      const freshnessDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
      const freshnessText = freshnessDate ? this.describeRelativeDate(freshnessDate) : undefined;
      if (freshnessText && freshnessText !== "时间未知") {
        reasons.push(`资料${freshnessText}`);
      }
    }

    const prefix =
      decisionTag === "优先深看"
        ? "建议优先打开"
        : decisionTag === "继续比较"
          ? "建议继续对照"
          : "建议作为备选";

    const dedupedReasons = [...new Set(reasons)];
    return `${prefix}：${dedupedReasons.slice(0, 2).join("，") || "信息完整，可继续判断"}`;
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
    return describeRelativeDate(date);
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
    prompt: string,
    candidates: HydratedCandidate[] = []
  ): Promise<SearchConditions> {
    const revised = await this.tools.reviseQuery({
      currentConditions: current,
      prompt,
      shortlist: candidates
    });
    this.applySessionState(recordClarification(this.sessionState, prompt, revised.conditions));
    return revised.conditions;
  }

  private applySearchStateOrdering(
    candidates: HydratedCandidate[],
    conditions: SearchConditions
  ): HydratedCandidate[] {
    if (!conditions.preferFresh && !conditions.sourceBias) {
      return candidates;
    }

    return [...candidates].sort((left, right) => {
      const delta =
        this.computeSearchStateOrderingScore(right, conditions) -
        this.computeSearchStateOrderingScore(left, conditions);

      if (delta !== 0) {
        return delta;
      }

      return right.matchScore - left.matchScore;
    });
  }

  private computeSearchStateOrderingScore(
    candidate: HydratedCandidate,
    conditions: SearchConditions
  ): number {
    let score = candidate.matchScore * 100;

    if (conditions.sourceBias) {
      const expectedSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
      if (candidate.sources.includes(expectedSource)) {
        score += 18;
      }
    }

    if (conditions.preferFresh) {
      const referenceDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
      if (referenceDate) {
        const ageInDays = Math.floor(
          (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (ageInDays <= 7) {
          score += 20;
        } else if (ageInDays <= 30) {
          score += 12;
        } else if (ageInDays <= 90) {
          score += 5;
        }
      }
    }

    return score;
  }

  private async sortCandidates(
    candidates: HydratedCandidate[],
    sortMode: SortMode,
    conditions: SearchConditions
  ): Promise<void> {
    if (sortMode === "overall") {
      const ordered = this.applySearchStateOrdering(candidates, conditions);
      candidates.splice(0, candidates.length, ...ordered);
      this.applySessionState(setSessionShortlist(this.sessionState, candidates));
      return;
    }

    if (this.isRerankOnlySortMode(sortMode)) {
      candidates.sort((left, right) => this.compareRerankOnlyCandidates(left, right, sortMode));
      this.applySessionState(setSessionShortlist(this.sessionState, candidates));
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
    this.applySessionState(setSessionShortlist(this.sessionState, candidates));
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
      this.scorer.scoreRerankCandidate(sortMode, right, right._hydrated.evidence) -
      this.scorer.scoreRerankCandidate(sortMode, left, left._hydrated.evidence);

    if (Math.abs(compositeDelta) > 0.001) {
      return compositeDelta;
    }

    const leftSignals = this.buildRerankSignals(left);
    const rightSignals = this.buildRerankSignals(right);
    const tieBreakerOrder: Record<
      Extract<SortMode, "fresh" | "source" | "evidence">,
      Array<keyof ReturnType<SearchWorkflow["buildRerankSignals"]>>
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
      fresh: this.scorer.scoreFreshness(candidate),
      source: this.scorer.scoreSourcePriority(candidate),
      evidence: this.scorer.scoreEvidenceStrength(candidate._hydrated.evidence),
      match: this.scorer.normalizeMatchScore(candidate.matchScore)
    };
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
    conditions: SearchConditions,
    options: {
      quiet?: boolean;
      maxRetries?: number;
    } = {}
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
        const llm = await this.scorer.scoreByLLM(person, evidence, {
          quiet: options.quiet,
          maxRetries: options.maxRetries
        });
        const experienceBonus = this.scorer.calculateExperienceMatch(person, evidence, conditions);
        innerProfile = this.scorer.aggregate(rules, llm, experienceBonus);

        innerProfile = await this.generator.generate(person, evidence, innerProfile, conditions, {
          quiet: options.quiet,
          maxRetries: options.maxRetries
        });
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
        const profile = await this.getOrGenerateProfile(candidate.personId, person, evidence, conditions, {
          quiet: true,
          maxRetries: 0
        });
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

  private shouldPreloadProfiles(): boolean {
    return !process.stdin.isTTY;
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

    if (conditions.mustHave.length > 0) {
      parts.push(`必须项 ${conditions.mustHave.join(" / ")}`);
    }

    if (conditions.niceToHave.length > 0) {
      parts.push(`优先项 ${conditions.niceToHave.join(" / ")}`);
    }

    if (conditions.exclude.length > 0) {
      parts.push(`排除项 ${conditions.exclude.join(" / ")}`);
    }

    if (conditions.preferFresh) {
      parts.push("偏好最近活跃");
    }

    if (conditions.candidateAnchor?.name) {
      parts.push(`参考候选 ${conditions.candidateAnchor.name}`);
    } else if (conditions.candidateAnchor?.shortlistIndex) {
      parts.push(`参考 shortlist #${conditions.candidateAnchor.shortlistIndex}`);
    }

    return parts.length > 0 ? parts.join("，") : "不限条件";
  }
}
