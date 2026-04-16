import type {
  ComparisonEntry,
  ComparisonEvidenceSummary,
  MultiDimensionProfile,
  ScoredCandidate,
  SearchConditions
} from "./types.js";

interface CandidateEvidenceItem {
  evidenceType: string;
  title?: string | null;
  description?: string | null;
  source: string;
  occurredAt?: Date | null;
}

interface ComparisonHydratedCandidate extends ScoredCandidate {
  profile: MultiDimensionProfile;
  queryReasons?: string[];
  lastSyncedAt?: Date;
  latestEvidenceAt?: Date;
  bonjourUrl?: string;
  _hydrated: {
    evidence: CandidateEvidenceItem[];
  };
}

export interface RefineContextCandidate {
  shortlistIndex: number;
  personId: string;
  name: string;
  headline: string | null;
  location: string | null;
  sources: string[];
  matchReason?: string;
  summary?: string;
}

export interface AgentSearchCandidatesInput {
  query: string;
  conditions: SearchConditions;
}

export interface SearchCliToolInput {
  query: string;
  limit?: number;
}

export interface SearchCliToolOutput {
  query: string;
  limit?: number;
  results: unknown[];
  total: number;
  resultWarning?: string;
}

export interface InspectCandidateToolInput {
  personId: string;
}

export interface InspectCandidateToolOutput {
  personId: string;
  person: unknown;
  evidence: unknown[];
}

export interface AgentSearchCandidatesOutput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  query: string;
  conditions: SearchConditions;
  candidates: TCandidate[];
}

export interface AgentInspectCandidateInput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  personId: string;
  shortlist: TCandidate[];
  activeCompareSet?: TCandidate[];
}

export interface AgentInspectCandidateOutput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  candidate: TCandidate | null;
  source: "shortlist" | "compare-set" | "not-found";
}

export interface AgentReviseQueryInput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  currentConditions: SearchConditions;
  prompt: string;
  shortlist?: TCandidate[];
}

export interface AgentReviseQueryOutput {
  conditions: SearchConditions;
  context: RefineContextCandidate[];
}

export interface PreparedComparisonCandidate<TCandidate extends ScoredCandidate = ScoredCandidate> {
  shortlistIndex?: number;
  candidate: TCandidate;
  decisionScore: number;
  decisionTag: ComparisonEntry["decisionTag"];
  recommendation: string;
  nextStep: string;
}

export interface PreparedComparisonEntry extends PreparedComparisonCandidate<ComparisonHydratedCandidate> {
  profile: MultiDimensionProfile;
  topEvidence: ComparisonEvidenceSummary[];
}

export interface AgentPrepareComparisonInput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  targets: TCandidate[];
  allCandidates: TCandidate[];
}

export interface AgentPrepareComparisonOutput<
  TCandidate extends ScoredCandidate = ScoredCandidate,
  TEntry = PreparedComparisonCandidate<TCandidate>
> {
  targets: TCandidate[];
  entries: TEntry[];
}

export interface SearchAgentTools<
  TCandidate extends ScoredCandidate = ScoredCandidate,
  TInspect = AgentInspectCandidateOutput<TCandidate>,
  TComparison = PreparedComparisonCandidate<TCandidate>
> {
  searchCandidates(input: AgentSearchCandidatesInput): Promise<AgentSearchCandidatesOutput<TCandidate>>;
  inspectCandidate(input: AgentInspectCandidateInput<TCandidate>): Promise<TInspect>;
  reviseQuery(input: AgentReviseQueryInput<TCandidate>): Promise<AgentReviseQueryOutput>;
  prepareComparison(
    input: AgentPrepareComparisonInput<TCandidate>
  ): Promise<AgentPrepareComparisonOutput<TCandidate, TComparison>>;
}

export function createSearchAgentTools<
  TCandidate extends ScoredCandidate = ScoredCandidate,
  TInspect = AgentInspectCandidateOutput<TCandidate>,
  TComparison = PreparedComparisonCandidate<TCandidate>
>(
  tools: SearchAgentTools<TCandidate, TInspect, TComparison>
): SearchAgentTools<TCandidate, TInspect, TComparison> {
  return tools;
}

export async function searchCandidates(
  input: SearchCliToolInput
): Promise<SearchCliToolOutput> {
  const { runSearchCli } = await import("../search-cli.js");
  const result = await runSearchCli({
    query: input.query,
    limit: input.limit,
    json: true
  });

  if (typeof result === "string") {
    return {
      query: input.query,
      limit: input.limit,
      results: [],
      total: 0
    };
  }

  return {
    query: input.query,
    limit: input.limit,
    results: result.results,
    total: result.total,
    resultWarning: result.resultWarning
  };
}

export async function inspectCandidate(
  input: InspectCandidateToolInput
): Promise<InspectCandidateToolOutput> {
  const { runShowCli } = await import("../search-cli.js");
  const result = await runShowCli({
    personId: input.personId,
    json: true
  });

  if (typeof result === "string") {
    return {
      personId: input.personId,
      person: null,
      evidence: []
    };
  }

  return {
    personId: input.personId,
    person: result.person,
    evidence: result.evidence
  };
}

export function buildRefineContextCandidates<
  TCandidate extends ScoredCandidate & { profile?: Pick<MultiDimensionProfile, "summary"> }
>(candidates: TCandidate[]): RefineContextCandidate[] {
  return candidates
    .slice(0, 8)
    .map((candidate, index) => ({
      shortlistIndex: index + 1,
      personId: candidate.personId,
      name: candidate.name,
      headline: candidate.headline,
      location: candidate.location,
      sources: candidate.sources,
      matchReason: candidate.matchReason,
      summary: candidate.profile?.summary
    }));
}

export function resolveCandidateAnchorWithContext(
  prompt: string,
  conditions: SearchConditions,
  context: RefineContextCandidate[]
): SearchConditions {
  const anchor = conditions.candidateAnchor ? { ...conditions.candidateAnchor } : undefined;
  const indexMatch = prompt.match(/(?:像|参考|类似)\s*(\d+)\s*号/);
  const index = indexMatch?.[1] ? Number(indexMatch[1]) : anchor?.shortlistIndex;
  const byIndex = typeof index === "number"
    ? context.find((candidate) => candidate.shortlistIndex === index)
    : undefined;
  const loweredPrompt = prompt.toLowerCase();
  const byName = context.find((candidate) => loweredPrompt.includes(candidate.name.toLowerCase()));
  const resolved = byIndex || byName;

  if (!resolved) {
    return conditions;
  }

  return {
    ...conditions,
    candidateAnchor: {
      shortlistIndex: resolved.shortlistIndex,
      personId: resolved.personId,
      name: resolved.name
    }
  };
}

export function inspectCandidateFromState<TCandidate extends ScoredCandidate>(
  input: AgentInspectCandidateInput<TCandidate>
): AgentInspectCandidateOutput<TCandidate> {
  const shortlistCandidate = input.shortlist.find((candidate) => candidate.personId === input.personId);
  if (shortlistCandidate) {
    return {
      candidate: shortlistCandidate,
      source: "shortlist"
    };
  }

  const compareCandidate = input.activeCompareSet?.find((candidate) => candidate.personId === input.personId);
  if (compareCandidate) {
    return {
      candidate: compareCandidate,
      source: "compare-set"
    };
  }

  return {
    candidate: null,
    source: "not-found"
  };
}

export function classifyComparisonDecisionTag(rank: number): ComparisonEntry["decisionTag"] {
  if (rank === 0) {
    return "优先深看";
  }

  if (rank === 1) {
    return "继续比较";
  }

  return "补充候选";
}

export function prepareComparisonCandidates<TCandidate extends ScoredCandidate>(
  input: AgentPrepareComparisonInput<TCandidate>,
  options: {
    score(candidate: TCandidate): number;
    recommendation(candidate: TCandidate, decisionTag: ComparisonEntry["decisionTag"]): string;
    nextStep(
      candidate: TCandidate,
      shortlistIndex: number | undefined,
      decisionTag: ComparisonEntry["decisionTag"]
    ): string;
  }
): PreparedComparisonCandidate<TCandidate>[] {
  const entries = input.targets.map((candidate) => {
    const shortlistIndex = input.allCandidates.findIndex((item) => item.personId === candidate.personId);
    return {
      shortlistIndex: shortlistIndex >= 0 ? shortlistIndex + 1 : undefined,
      candidate,
      decisionScore: options.score(candidate)
    };
  });

  const rankedIds = [...entries]
    .sort((left, right) => right.decisionScore - left.decisionScore)
    .map((entry) => entry.candidate.personId);

  return entries.map((entry) => {
    const rank = rankedIds.indexOf(entry.candidate.personId);
    const decisionTag = classifyComparisonDecisionTag(rank);
    return {
      ...entry,
      decisionTag,
      recommendation: options.recommendation(entry.candidate, decisionTag),
      nextStep: options.nextStep(entry.candidate, entry.shortlistIndex, decisionTag)
    };
  });
}

function describeRelativeDate(date: Date): string {
  const ageInDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageInDays <= 0) {
    return "今天";
  }

  return `${ageInDays}天前`;
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) {
    return normalized;
  }

  return `${chars.slice(0, maxLength - 3).join("")}...`;
}

function buildEvidenceHeadline(item: CandidateEvidenceItem): string {
  const title = item.title?.trim();
  const description = item.description?.trim();

  if (item.evidenceType === "profile_field" && title && description) {
    return truncate(`${title}: ${description}`, 54);
  }

  if (title) {
    return truncate(title, 54);
  }

  return truncate(description || "未命名证据", 54);
}

function buildComparisonEvidence(evidence: CandidateEvidenceItem[]): ComparisonEvidenceSummary[] {
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
      title: buildEvidenceHeadline(item),
      sourceLabel: item.source === "bonjour" ? "Bonjour" : item.source === "github" ? "GitHub" : item.source,
      freshnessLabel: item.occurredAt ? describeRelativeDate(item.occurredAt) : undefined
    }));
}

function computeComparisonDecisionScore(
  candidate: ComparisonHydratedCandidate
): number {
  let score = candidate.profile.overallScore * 0.7 + candidate.matchScore * 100 * 0.2;

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

  if (candidate.profile.dimensions.techMatch >= 80) {
    score += 3;
  }

  if (candidate.profile.dimensions.projectDepth >= 70) {
    score += 2;
  }

  return score;
}

function buildComparisonRecommendation(
  candidate: ComparisonHydratedCandidate,
  decisionTag: ComparisonEntry["decisionTag"],
  conditions?: SearchConditions
): string {
  const reasons: string[] = [];

  if (candidate.queryReasons && candidate.queryReasons.length > 0) {
    reasons.push(...candidate.queryReasons.slice(0, 2));
  }

  if (candidate.profile.dimensions.techMatch >= 75) {
    reasons.push("技术相关性强");
  }

  if (candidate.profile.dimensions.projectDepth >= 65) {
    reasons.push("项目证据更扎实");
  }

  if (candidate.profile.dimensions.locationMatch >= 90) {
    reasons.push("地点完全匹配");
  }

  if (conditions?.sourceBias) {
    const expectedSource = conditions.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
    if (candidate.sources.includes(expectedSource)) {
      reasons.push("满足当前来源过滤");
    }
  }

  const freshnessDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
  if (freshnessDate) {
    reasons.push(`资料${describeRelativeDate(freshnessDate)}`);
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

function buildComparisonNextStep(
  candidate: ComparisonHydratedCandidate,
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

export function prepareComparisonEntries(
  targets: ComparisonHydratedCandidate[],
  allCandidates: ComparisonHydratedCandidate[],
  conditions?: SearchConditions
): PreparedComparisonEntry[] {
  return prepareComparisonCandidates(
    {
      targets,
      allCandidates
    },
    {
      score: (candidate) => computeComparisonDecisionScore(candidate),
      recommendation: (candidate, decisionTag) =>
        buildComparisonRecommendation(candidate, decisionTag, conditions),
      nextStep: (candidate, shortlistIndex, decisionTag) =>
        buildComparisonNextStep(candidate, shortlistIndex, decisionTag)
    }
  ).map((entry) => ({
    ...entry,
    profile: entry.candidate.profile,
    topEvidence: buildComparisonEvidence(entry.candidate._hydrated.evidence)
  }));
}
