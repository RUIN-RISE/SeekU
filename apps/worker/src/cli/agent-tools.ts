import type {
  ComparisonEntry,
  ComparisonConfidenceLevel,
  ComparisonDimensionAssessment,
  ComparisonDimensionVerdict,
  ComparisonEvidenceSummary,
  ComparisonOutcome,
  ComparisonResult,
  ComparisonUncertainty,
  MultiDimensionProfile,
  RecommendationMode,
  ScoredCandidate,
  SearchConditions
} from "./types.js";
import {
  describeRelativeDate,
  buildEvidenceHeadline,
  buildComparisonEvidence
} from "./comparison-formatters.js";

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
  diagnostics?: import("./search-executor.js").SearchExecutionDiagnostics;
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
  goalFit: ComparisonDimensionAssessment;
  evidenceStrength: ComparisonDimensionAssessment;
  technicalRelevance: ComparisonDimensionAssessment;
  sourceQualityRecency: ComparisonDimensionAssessment;
  uncertainty: ComparisonUncertainty;
  whySelected: string;
  whyNotSelected: string;
  evidenceTrace: string[];
  recommendation: string;
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
  result?: ComparisonResult;
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

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

function classifyDimensionVerdict(score: number): ComparisonDimensionVerdict {
  if (score >= 75) {
    return "strong";
  }

  if (score >= 55) {
    return "mixed";
  }

  return "weak";
}

function buildDimensionAssessment(
  score: number,
  summary: string,
  evidenceTrace: string[]
): ComparisonDimensionAssessment {
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    verdict: classifyDimensionVerdict(score),
    summary,
    evidenceTrace: dedupeStrings(evidenceTrace)
  };
}

export function computeComparisonDecisionScore(
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

function computeFreshnessScore(candidate: ComparisonHydratedCandidate): number {
  const freshnessDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
  if (!freshnessDate) {
    return 35;
  }

  const ageInDays = Math.floor(
    (Date.now() - freshnessDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageInDays <= 7) {
    return 90;
  }

  if (ageInDays <= 30) {
    return 75;
  }

  if (ageInDays <= 90) {
    return 60;
  }

  return 42;
}

function computeSourceScore(candidate: ComparisonHydratedCandidate): number {
  const normalizedSources = new Set(candidate.sources);
  if (normalizedSources.has("Bonjour") && normalizedSources.has("GitHub")) {
    return 88;
  }

  if (normalizedSources.has("Bonjour") || normalizedSources.has("GitHub")) {
    return 72;
  }

  return 48;
}

function buildGoalFitAssessment(candidate: ComparisonHydratedCandidate): ComparisonDimensionAssessment {
  const querySignals = candidate.queryReasons ?? [];
  const score = candidate.matchScore * 100 * 0.7 + candidate.profile.overallScore * 0.3;
  const summary = querySignals.length > 0
    ? `与当前目标的直接命中较明确：${querySignals.slice(0, 2).join("；")}`
    : "整体匹配分可用，但缺少更细的 query-aware 目标命中说明。";
  return buildDimensionAssessment(score, summary, querySignals);
}

function buildEvidenceStrengthAssessment(
  candidate: ComparisonHydratedCandidate,
  topEvidence: ComparisonEvidenceSummary[]
): ComparisonDimensionAssessment {
  const evidenceCount = topEvidence.length;
  const projectSignals = topEvidence.filter((item) =>
    item.evidenceType === "project" || item.evidenceType === "repository"
  ).length;
  const score = candidate.profile.dimensions.projectDepth * 0.6 + evidenceCount * 10 + projectSignals * 8;
  const summary = evidenceCount > 0
    ? `可直接引用 ${evidenceCount} 条高价值证据，其中项目/仓库证据 ${projectSignals} 条。`
    : "当前缺少足够的高价值证据，结论稳定性偏弱。";
  return buildDimensionAssessment(score, summary, topEvidence.map((item) => item.title));
}

function buildTechnicalRelevanceAssessment(candidate: ComparisonHydratedCandidate): ComparisonDimensionAssessment {
  const techSignals = (candidate.queryReasons ?? []).filter((reason) =>
    reason.includes("技术") || reason.includes("skill") || reason.includes("检索技能")
  );
  const summary = techSignals.length > 0
    ? `技术相关性有直接命中：${techSignals.slice(0, 2).join("；")}`
    : "技术相关性主要来自画像与匹配分，缺少更明确的技术命中说明。";
  return buildDimensionAssessment(
    candidate.profile.dimensions.techMatch,
    summary,
    techSignals.length > 0 ? techSignals : [candidate.matchReason || "技术相关性来自整体画像"]
  );
}

function buildSourceQualityRecencyAssessment(
  candidate: ComparisonHydratedCandidate,
  topEvidence: ComparisonEvidenceSummary[]
): ComparisonDimensionAssessment {
  const freshnessScore = computeFreshnessScore(candidate);
  const sourceScore = computeSourceScore(candidate);
  const combined = freshnessScore * 0.45 + sourceScore * 0.55;
  const summary = `来源覆盖 ${candidate.sources.join(" / ") || "未知"}，${topEvidence[0]?.freshnessLabel ? `最新证据${topEvidence[0].freshnessLabel}` : "证据时间不够明确"}。`;
  const evidenceTrace = [
    ...candidate.sources.map((source) => `来源:${source}`),
    ...(topEvidence[0]?.freshnessLabel ? [`新鲜度:${topEvidence[0].freshnessLabel}`] : [])
  ];
  return buildDimensionAssessment(combined, summary, evidenceTrace);
}

function buildUncertainty(
  candidate: ComparisonHydratedCandidate,
  evidenceStrength: ComparisonDimensionAssessment,
  sourceQualityRecency: ComparisonDimensionAssessment
): ComparisonUncertainty {
  const candidateReasons = candidate.queryReasons ?? [];
  if (evidenceStrength.verdict === "weak") {
    return {
      level: "high",
      summary: "高价值证据不足，当前推荐风险较高。"
    };
  }

  if (sourceQualityRecency.verdict === "weak" || candidateReasons.length === 0) {
    return {
      level: "medium",
      summary: "来源或新鲜度一般，需要补充更多直接证据再做决定。"
    };
  }

  return {
    level: "low",
    summary: "剩余不确定性可控，主要是不同维度取舍问题。"
  };
}

export function buildComparisonRecommendation(
  candidate: ComparisonHydratedCandidate,
  decisionTag: ComparisonEntry["decisionTag"],
  conditions: SearchConditions | undefined,
  goalFit: ComparisonDimensionAssessment,
  evidenceStrength: ComparisonDimensionAssessment,
  sourceQualityRecency: ComparisonDimensionAssessment,
  uncertainty: ComparisonUncertainty
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

  if (goalFit.verdict === "strong") {
    reasons.push("目标契合度高");
  }

  if (evidenceStrength.verdict === "weak") {
    reasons.push("证据仍偏薄");
  }

  if (sourceQualityRecency.verdict === "weak") {
    reasons.push("来源/新鲜度一般");
  }

  if (uncertainty.level === "high") {
    reasons.push("仍需补证");
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

function compareUncertaintyLevel(level: ComparisonUncertainty["level"]): number {
  return level === "high" ? 3 : level === "medium" ? 2 : 1;
}

function buildWhySelected(entry: PreparedComparisonEntry): string {
  const strongDimensions = [
    entry.goalFit,
    entry.evidenceStrength,
    entry.technicalRelevance,
    entry.sourceQualityRecency
  ]
    .filter((dimension) => dimension.verdict === "strong")
    .map((dimension) => dimension.summary);

  return strongDimensions[0] || "当前在综合比较中更接近本轮目标。";
}

function buildWhyNotSelected(
  entry: PreparedComparisonEntry,
  bestEntry: PreparedComparisonEntry
): string {
  if (entry.candidate.personId === bestEntry.candidate.personId) {
    return "当前是本轮 compare 中最稳的选择，但仍需关注剩余不确定性。";
  }

  if (entry.evidenceStrength.score < bestEntry.evidenceStrength.score) {
    return "相对首选项，直接证据支撑更弱。";
  }

  if (entry.goalFit.score < bestEntry.goalFit.score) {
    return "相对首选项，与当前目标的直接契合度稍弱。";
  }

  if (compareUncertaintyLevel(entry.uncertainty.level) > compareUncertaintyLevel(bestEntry.uncertainty.level)) {
    return "相对首选项，剩余不确定性更高。";
  }

  return "相对首选项，综合优势不够明显。";
}

function buildComparisonOutcome(entries: PreparedComparisonEntry[]): ComparisonOutcome {
  const ranked = [...entries].sort((left, right) => right.decisionScore - left.decisionScore);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || entries.length < 2) {
    return {
      confidence: "low-confidence",
      recommendationMode: "no-recommendation",
      recommendation: "当前还不足以形成有效对比，先补齐 2-3 位候选人再判断。",
      rationale: "候选集不足，compare 还不具备决策意义。",
      largestUncertainty: "当前 compare set 不完整。",
      suggestedRefinement: "先补一位更接近目标的候选人进入 compare。"
    };
  }

  const lead = top.decisionScore - second.decisionScore;
  const evidenceWeak = top.evidenceStrength.verdict === "weak";
  const highUncertainty = top.uncertainty.level === "high";
  const mediumUncertainty = top.uncertainty.level === "medium";

  if (evidenceWeak || highUncertainty || lead < 6) {
    return {
      confidence: "low-confidence",
      recommendationMode: "no-recommendation",
      recommendation: "我还没有足够证据推荐单一候选人。",
      rationale: "当前 compare 已完成，但领先优势或证据稳定性不足。",
      largestUncertainty: top.uncertainty.summary,
      suggestedRefinement: "继续 refine，补充更直接的项目/仓库证据，或再缩窄目标。"
    };
  }

  if (mediumUncertainty || lead < 12 || top.sourceQualityRecency.verdict === "mixed") {
    return {
      confidence: "medium-confidence",
      recommendationMode: "conditional-recommendation",
      recommendedCandidateId: top.candidate.personId,
      recommendation: `条件性推荐 ${top.candidate.name}，但这取决于你是否更看重当前强项而接受剩余不确定性。`,
      rationale: top.whySelected,
      largestUncertainty: top.uncertainty.summary,
      suggestedRefinement: "如果你更在意稳定证据，再补一轮 detail / refine。"
    };
  }

  return {
    confidence: "high-confidence",
    recommendationMode: "clear-recommendation",
    recommendedCandidateId: top.candidate.personId,
    recommendation: `优先推荐 ${top.candidate.name}。`,
    rationale: top.whySelected,
    largestUncertainty: top.uncertainty.summary,
    suggestedRefinement: undefined
  };
}

export function prepareComparisonEntries(
  targets: ComparisonHydratedCandidate[],
  allCandidates: ComparisonHydratedCandidate[],
  conditions?: SearchConditions
): PreparedComparisonEntry[] {
  const entries = prepareComparisonCandidates(
    {
      targets,
      allCandidates
    },
    {
      score: (candidate) => computeComparisonDecisionScore(candidate),
      recommendation: () => "",
      nextStep: (candidate, shortlistIndex, decisionTag) =>
        buildComparisonNextStep(candidate, shortlistIndex, decisionTag)
    }
  ).map((entry) => {
    const topEvidence = buildComparisonEvidence(entry.candidate._hydrated.evidence);
    const goalFit = buildGoalFitAssessment(entry.candidate);
    const evidenceStrength = buildEvidenceStrengthAssessment(entry.candidate, topEvidence);
    const technicalRelevance = buildTechnicalRelevanceAssessment(entry.candidate);
    const sourceQualityRecency = buildSourceQualityRecencyAssessment(entry.candidate, topEvidence);
    const uncertainty = buildUncertainty(entry.candidate, evidenceStrength, sourceQualityRecency);
    const evidenceTrace = dedupeStrings([
      ...goalFit.evidenceTrace,
      ...evidenceStrength.evidenceTrace,
      ...technicalRelevance.evidenceTrace,
      ...sourceQualityRecency.evidenceTrace
    ]);

    return {
      ...entry,
      profile: entry.candidate.profile,
      topEvidence,
      goalFit,
      evidenceStrength,
      technicalRelevance,
      sourceQualityRecency,
      uncertainty,
      whySelected: "",
      whyNotSelected: "",
      evidenceTrace,
      recommendation: ""
    };
  });

  const bestEntry = [...entries].sort((left, right) => right.decisionScore - left.decisionScore)[0];
  return entries.map((entry) => {
    const whySelected = buildWhySelected(entry);
    const whyNotSelected = bestEntry ? buildWhyNotSelected(entry, bestEntry) : "当前比较样本不足。";
    return {
      ...entry,
      whySelected,
      whyNotSelected,
      recommendation: buildComparisonRecommendation(
        entry.candidate,
        entry.decisionTag,
        conditions,
        entry.goalFit,
        entry.evidenceStrength,
        entry.sourceQualityRecency,
        entry.uncertainty
      )
    };
  });
}

export function prepareComparisonResult(
  targets: ComparisonHydratedCandidate[],
  allCandidates: ComparisonHydratedCandidate[],
  conditions?: SearchConditions
): ComparisonResult {
  const entries = prepareComparisonEntries(targets, allCandidates, conditions);
  return {
    entries,
    outcome: buildComparisonOutcome(entries)
  };
}
