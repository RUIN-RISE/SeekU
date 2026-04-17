import type { EvidenceItem, EvidenceType, Person, SearchDocument } from "@seeku/db";

export const DIRECTION_TAG_PREFIX = "direction:";

export type DirectionTag =
  | "ai_agents"
  | "ai_infra"
  | "developer_tools"
  | "education"
  | "enterprise_ai"
  | "open_source"
  | "robotics"
  | "healthcare"
  | "fintech"
  | "creator_media";

export type UserGoalSignalSource =
  | "explicit_goal"
  | "current_conditions"
  | "search_history"
  | "feedback"
  | "interaction";

export type CandidateDirectionSource =
  | "headline"
  | "summary"
  | "profile_field"
  | "project"
  | "repository"
  | "community_post"
  | "experience"
  | "job_signal"
  | "education"
  | "social"
  | "summary_evidence";

export interface CandidateDirectionSignal {
  tag: DirectionTag;
  label: string;
  source: CandidateDirectionSource;
  matchedText: string;
}

export interface CandidateDirectionProfile {
  personId: string;
  directionTags: DirectionTag[];
  summary: string;
  confidence: "high" | "medium" | "low";
  publicEvidenceCount: number;
  signals: CandidateDirectionSignal[];
}

export interface UserGoalModelSearchInput {
  query?: string | null;
  signalTexts?: string[];
  timestamp?: Date;
}

export interface UserGoalFeedbackEvent {
  kind: "interested" | "not_interested" | "contacted" | "revisit";
  directionTags?: DirectionTag[];
  note?: string | null;
  timestamp?: Date;
}

export interface UserGoalInteractionEvent {
  kind: "detail_view" | "repeat_view" | "evidence_expand" | "dwell";
  directionTags?: DirectionTag[];
  note?: string | null;
  timestamp?: Date;
}

export interface BuildUserGoalModelInput {
  explicitGoal?: string | null;
  currentSignalTexts?: string[];
  excludedSignalTexts?: string[];
  recentSearches?: UserGoalModelSearchInput[];
  feedbackEvents?: UserGoalFeedbackEvent[];
  interactionEvents?: UserGoalInteractionEvent[];
  updatedAt?: Date;
}

export interface UserGoalModel {
  explicitGoal: string | null;
  dominantDirectionTags: DirectionTag[];
  explicitDirectionTags: DirectionTag[];
  recentDirectionTags: DirectionTag[];
  negativeDirectionTags: DirectionTag[];
  directionCounts: Partial<Record<DirectionTag, number>>;
  driftStatus: "unknown" | "aligned" | "shifting";
  feedbackWeights: {
    interested: number;
    notInterested: number;
    contacted: number;
    revisit: number;
  };
  signalSources: UserGoalSignalSource[];
  summary: string;
  updatedAt: Date;
}

interface DirectionPattern {
  tag: DirectionTag;
  label: string;
  patterns: RegExp[];
}

interface TaggedDirectionSignal {
  tag: DirectionTag;
  label: string;
  matchedText: string;
}

interface CandidateDirectionTextInput {
  source: CandidateDirectionSource;
  text: string;
}

const DIRECTION_PATTERNS: DirectionPattern[] = [
  {
    tag: "ai_agents",
    label: "AI agents",
    patterns: [/\bagentic\b/i, /\bagents?\b/i, /\bmulti-agent\b/i, /智能体/u]
  },
  {
    tag: "ai_infra",
    label: "AI infra",
    patterns: [
      /\bai infra\b/i,
      /\binference\b/i,
      /\bserving\b/i,
      /\bllmops\b/i,
      /\bvllm\b/i,
      /\bcuda\b/i,
      /基础设施/u,
      /推理/u,
      /模型部署/u
    ]
  },
  {
    tag: "developer_tools",
    label: "Developer tools",
    patterns: [/\bdeveloper tools?\b/i, /\bdevtools?\b/i, /\btooling\b/i, /开发者工具/u, /\bsdk\b/i]
  },
  {
    tag: "education",
    label: "Education",
    patterns: [/\bedtech\b/i, /\beducation\b/i, /教育/u, /学习/u, /智能教育/u]
  },
  {
    tag: "enterprise_ai",
    label: "Enterprise AI",
    patterns: [
      /\benterprise ai\b/i,
      /\bb2b\b/i,
      /\benterprise automation\b/i,
      /企业ai/u,
      /企业服务/u,
      /自动化/u,
      /workflow automation/i
    ]
  },
  {
    tag: "open_source",
    label: "Open source",
    patterns: [/\bopen source\b/i, /\boss\b/i, /开源/u]
  },
  {
    tag: "robotics",
    label: "Robotics",
    patterns: [/\brobotics?\b/i, /\bembodied\b/i, /机器人/u]
  },
  {
    tag: "healthcare",
    label: "Healthcare",
    patterns: [/\bhealthcare\b/i, /\bmedical\b/i, /\bbiomed/i, /医疗/u, /生物医药/u]
  },
  {
    tag: "fintech",
    label: "Fintech",
    patterns: [/\bfintech\b/i, /\btrading\b/i, /\bquant\b/i, /金融科技/u, /支付/u]
  },
  {
    tag: "creator_media",
    label: "Creator media",
    patterns: [/\bcreator\b/i, /\bcontent\b/i, /\bcommunity\b/i, /内容创作/u, /播客/u, /社区/u]
  }
];

const PROFILE_FIELD_SOURCES = new Set([
  "bio",
  "current_doing",
  "role",
  "skill",
  "focus",
  "project_focus",
  "about",
  "summary"
]);

const DIRECTION_EVIDENCE_TYPES = new Set<EvidenceType>([
  "profile_field",
  "project",
  "repository",
  "community_post",
  "experience",
  "job_signal",
  "education",
  "summary"
]);

export type DealFlowBucket = "new" | "high-confidence" | "needs-validation" | "revisit";

export interface DealFlowCandidateState {
  seenCount?: number;
  detailViewCount?: number;
  repeatViewCount?: number;
  daysSinceLastSurfaced?: number | null;
  lastFeedbackKind?: UserGoalFeedbackEvent["kind"] | null;
  contactedAt?: Date | null;
}

export interface OpportunityCandidateInput {
  person: Person;
  document?: SearchDocument;
  evidence: EvidenceItem[];
  directionProfile?: CandidateDirectionProfile;
  state?: DealFlowCandidateState;
}

export interface OpportunityScoreBreakdown {
  directionMatch: number;
  freshness: number;
  reachability: number;
  engagementFit: number;
  revisitPressure: number;
  negativePenalty: number;
  total: number;
}

export interface OpportunityScoreResult {
  personId: string;
  name: string;
  headline: string | null;
  bucket: DealFlowBucket;
  totalScore: number;
  confidence: "high" | "medium" | "low";
  whyMatched: string;
  whyNow: string;
  approachPath: string;
  whyUncertain?: string;
  directionProfile: CandidateDirectionProfile;
  directionOverlapTags: DirectionTag[];
  breakdown: OpportunityScoreBreakdown;
  candidate: OpportunityCandidateInput;
}

export interface OpportunityScorerConfig {
  directionWeight: number;
  freshnessWeight: number;
  reachabilityWeight: number;
  engagementWeight: number;
  revisitWeight: number;
  lowDirectionSecondaryCap: number;
}

export interface DailyDealFlowArtifact {
  generatedForDate: string;
  generatedAt: string;
  topToday: OpportunityScoreResult[];
  moreOpportunities: OpportunityScoreResult[];
  totalCandidates: number;
  bucketCounts: Record<DealFlowBucket, number>;
}

export interface DailyDealFlowCuratorConfig {
  size: number;
  topCount: number;
  recentSuppressionDays: number;
}

function normalizeSignalText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSignalText(value: string, maxLength = 140): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function uniqueDirectionTags(values: readonly DirectionTag[]): DirectionTag[] {
  return Array.from(new Set(values));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function daysToFreshnessScore(days: number | undefined): number {
  if (typeof days !== "number" || !Number.isFinite(days)) {
    return 0.5;
  }

  return clampScore(Math.exp(-Math.max(days, 0) / 180));
}

function getDirectionLabel(tag: DirectionTag): string {
  return DIRECTION_PATTERNS.find((entry) => entry.tag === tag)?.label ?? tag;
}

function collectTaggedSignals(text: string): TaggedDirectionSignal[] {
  const normalized = normalizeSignalText(text);
  if (!normalized) {
    return [];
  }

  const signals: TaggedDirectionSignal[] = [];
  for (const pattern of DIRECTION_PATTERNS) {
    if (pattern.patterns.some((regex) => regex.test(normalized))) {
      signals.push({
        tag: pattern.tag,
        label: pattern.label,
        matchedText: truncateSignalText(normalized)
      });
    }
  }

  return signals;
}

function collectCandidateDirectionTexts(person: Person, evidence: EvidenceItem[]): CandidateDirectionTextInput[] {
  const texts: CandidateDirectionTextInput[] = [];

  if (person.primaryHeadline) {
    texts.push({ source: "headline", text: person.primaryHeadline });
  }

  if (person.summary) {
    texts.push({ source: "summary", text: person.summary });
  }

  for (const item of evidence) {
    if (!DIRECTION_EVIDENCE_TYPES.has(item.evidenceType)) {
      continue;
    }

    if (item.evidenceType === "profile_field") {
      const field = typeof item.metadata?.field === "string" ? item.metadata.field : undefined;
      if (field && PROFILE_FIELD_SOURCES.has(field) && item.description) {
        texts.push({ source: "profile_field", text: item.description });
      }
      continue;
    }

    if (item.evidenceType === "summary") {
      if (item.title) {
        texts.push({ source: "summary_evidence", text: item.title });
      }
      if (item.description) {
        texts.push({ source: "summary_evidence", text: item.description });
      }
      continue;
    }

    if (item.title) {
      texts.push({ source: item.evidenceType, text: item.title });
    }
    if (item.description) {
      texts.push({ source: item.evidenceType, text: item.description });
    }
  }

  return texts.filter((entry) => normalizeSignalText(entry.text).length > 0);
}

function createDirectionSummary(tags: readonly DirectionTag[]): string {
  if (tags.length === 0) {
    return "No clear public direction signals.";
  }

  const labels = tags
    .map((tag) => getDirectionLabel(tag))
    .slice(0, 3);
  return labels.join(" / ");
}

function classifyCandidateDirectionConfidence(
  tags: readonly DirectionTag[],
  sources: readonly CandidateDirectionSource[]
): CandidateDirectionProfile["confidence"] {
  const uniqueSources = new Set(sources);
  if (tags.length >= 2 && uniqueSources.size >= 2) {
    return "high";
  }

  if (tags.length >= 1) {
    return "medium";
  }

  return "low";
}

function countDirectionTags(values: readonly DirectionTag[]): Partial<Record<DirectionTag, number>> {
  const counts: Partial<Record<DirectionTag, number>> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sortDirectionTagsByCount(counts: Partial<Record<DirectionTag, number>>): DirectionTag[] {
  return (Object.entries(counts) as Array<[DirectionTag, number]>)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([tag]) => tag);
}

function inferDriftStatus(
  explicitTags: readonly DirectionTag[],
  recentTags: readonly DirectionTag[]
): UserGoalModel["driftStatus"] {
  if (explicitTags.length === 0 || recentTags.length === 0) {
    return "unknown";
  }

  const explicit = new Set(explicitTags);
  const hasOverlap = recentTags.some((tag) => explicit.has(tag));
  return hasOverlap ? "aligned" : "shifting";
}

function buildGoalModelSummary(
  dominantTags: readonly DirectionTag[],
  explicitTags: readonly DirectionTag[],
  recentTags: readonly DirectionTag[],
  driftStatus: UserGoalModel["driftStatus"]
): string {
  if (dominantTags.length === 0) {
    return "Goal direction is still under-specified.";
  }

  const dominantSummary = createDirectionSummary(dominantTags);
  if (driftStatus === "shifting" && explicitTags.length > 0 && recentTags.length > 0) {
    return `Explicit goal leans ${createDirectionSummary(explicitTags)}, while recent behavior leans ${createDirectionSummary(recentTags)}.`;
  }

  return `Current goal centers on ${dominantSummary}.`;
}

export function toDirectionFacetTags(tags: readonly DirectionTag[]): string[] {
  return uniqueDirectionTags(tags).map((tag) => `${DIRECTION_TAG_PREFIX}${tag}`);
}

export function buildCandidateDirectionProfile(
  person: Person,
  evidence: EvidenceItem[]
): CandidateDirectionProfile {
  const directionTexts = collectCandidateDirectionTexts(person, evidence);
  const signals: CandidateDirectionSignal[] = [];

  for (const entry of directionTexts) {
    for (const signal of collectTaggedSignals(entry.text)) {
      const exists = signals.some(
        (candidate) =>
          candidate.tag === signal.tag &&
          candidate.source === entry.source &&
          candidate.matchedText === signal.matchedText
      );
      if (exists) {
        continue;
      }

      signals.push({
        tag: signal.tag,
        label: signal.label,
        source: entry.source,
        matchedText: signal.matchedText
      });
    }
  }

  const directionTags = uniqueDirectionTags(signals.map((signal) => signal.tag));
  const confidence = classifyCandidateDirectionConfidence(
    directionTags,
    signals.map((signal) => signal.source)
  );

  return {
    personId: person.id,
    directionTags,
    summary: createDirectionSummary(directionTags),
    confidence,
    publicEvidenceCount: directionTexts.length,
    signals
  };
}

export function buildUserGoalModel(input: BuildUserGoalModelInput): UserGoalModel {
  const explicitDirectionTags = uniqueDirectionTags(
    collectTaggedSignals(input.explicitGoal ?? "").map((signal) => signal.tag)
  );
  const currentDirectionTags = uniqueDirectionTags(
    (input.currentSignalTexts ?? []).flatMap((text) =>
      collectTaggedSignals(text).map((signal) => signal.tag)
    )
  );
  const recentSearchDirectionTags = uniqueDirectionTags(
    (input.recentSearches ?? []).flatMap((search) => [
      ...collectTaggedSignals(search.query ?? "").map((signal) => signal.tag),
      ...(search.signalTexts ?? []).flatMap((text) =>
        collectTaggedSignals(text).map((signal) => signal.tag)
      )
    ])
  );
  const negativeDirectionTags = uniqueDirectionTags(
    (input.excludedSignalTexts ?? []).flatMap((text) =>
      collectTaggedSignals(text).map((signal) => signal.tag)
    )
  );

  const feedbackWeights = {
    interested: (input.feedbackEvents ?? []).filter((event) => event.kind === "interested").length,
    notInterested: (input.feedbackEvents ?? []).filter((event) => event.kind === "not_interested").length,
    contacted: (input.feedbackEvents ?? []).filter((event) => event.kind === "contacted").length,
    revisit: (input.feedbackEvents ?? []).filter((event) => event.kind === "revisit").length
  };

  const feedbackDirectionTags = uniqueDirectionTags(
    (input.feedbackEvents ?? []).flatMap((event) => event.directionTags ?? [])
  );
  const interactionDirectionTags = uniqueDirectionTags(
    (input.interactionEvents ?? []).flatMap((event) => event.directionTags ?? [])
  );
  const recentDirectionTags = uniqueDirectionTags([
    ...currentDirectionTags,
    ...recentSearchDirectionTags,
    ...feedbackDirectionTags,
    ...interactionDirectionTags
  ]);

  const allDirectionTags = [
    ...explicitDirectionTags,
    ...currentDirectionTags,
    ...recentSearchDirectionTags,
    ...feedbackDirectionTags,
    ...interactionDirectionTags
  ];

  const directionCounts = countDirectionTags(allDirectionTags);
  const dominantDirectionTags = sortDirectionTagsByCount(directionCounts);
  const driftStatus = inferDriftStatus(explicitDirectionTags, recentDirectionTags);

  const signalSources: UserGoalSignalSource[] = [];
  if (input.explicitGoal?.trim()) {
    signalSources.push("explicit_goal");
  }
  if ((input.currentSignalTexts ?? []).length > 0 || (input.excludedSignalTexts ?? []).length > 0) {
    signalSources.push("current_conditions");
  }
  if ((input.recentSearches ?? []).length > 0) {
    signalSources.push("search_history");
  }
  if ((input.feedbackEvents ?? []).length > 0) {
    signalSources.push("feedback");
  }
  if ((input.interactionEvents ?? []).length > 0) {
    signalSources.push("interaction");
  }

  return {
    explicitGoal: input.explicitGoal?.trim() || null,
    dominantDirectionTags,
    explicitDirectionTags,
    recentDirectionTags,
    negativeDirectionTags,
    directionCounts,
    driftStatus,
    feedbackWeights,
    signalSources,
    summary: buildGoalModelSummary(
      dominantDirectionTags,
      explicitDirectionTags,
      recentDirectionTags,
      driftStatus
    ),
    updatedAt: input.updatedAt ?? new Date()
  };
}

const DEFAULT_OPPORTUNITY_SCORER_CONFIG: OpportunityScorerConfig = {
  directionWeight: 0.72,
  freshnessWeight: 0.1,
  reachabilityWeight: 0.08,
  engagementWeight: 0.05,
  revisitWeight: 0.05,
  lowDirectionSecondaryCap: 0.18
};

const DEFAULT_DEAL_FLOW_CURATOR_CONFIG: DailyDealFlowCuratorConfig = {
  size: 7,
  topCount: 3,
  recentSuppressionDays: 1
};

function computeDirectionMatch(
  userGoalModel: UserGoalModel,
  directionTags: readonly DirectionTag[],
  confidence: CandidateDirectionProfile["confidence"]
) {
  const explicitSet = new Set(userGoalModel.explicitDirectionTags);
  const dominantSet = new Set(userGoalModel.dominantDirectionTags.slice(0, 3));
  const recentSet = new Set(userGoalModel.recentDirectionTags);
  const negativeSet = new Set(userGoalModel.negativeDirectionTags);

  const overlapTags = uniqueDirectionTags(
    directionTags.filter(
      (tag) => explicitSet.has(tag) || dominantSet.has(tag) || recentSet.has(tag)
    )
  );
  const negativeOverlapCount = directionTags.filter((tag) => negativeSet.has(tag)).length;

  let score = 0;
  for (const tag of overlapTags) {
    if (dominantSet.has(tag)) {
      score += 0.34;
    }
    if (explicitSet.has(tag)) {
      score += 0.22;
    }
    if (recentSet.has(tag)) {
      score += 0.12;
    }
  }

  if (overlapTags.length === 0 && directionTags.length > 0) {
    score += 0.05;
  }

  if (confidence === "high") {
    score += 0.08;
  } else if (confidence === "medium") {
    score += 0.03;
  }

  score -= negativeOverlapCount * 0.25;

  return {
    score: clampScore(score),
    overlapTags,
    negativeOverlapCount
  };
}

function computeReachabilityScore(input: OpportunityCandidateInput): number {
  const sources = new Set(input.document?.facetSource ?? []);
  const hasRepoEvidence = input.evidence.some((item) => item.evidenceType === "repository");
  const hasProjectEvidence = input.evidence.some((item) => item.evidenceType === "project");

  if (sources.has("bonjour")) {
    return 1;
  }

  if (sources.has("github") && hasRepoEvidence) {
    return 0.72;
  }

  if (hasProjectEvidence) {
    return 0.62;
  }

  if (sources.size > 0) {
    return 0.5;
  }

  return 0.35;
}

function computeEngagementFitScore(input: OpportunityCandidateInput): number {
  const state = input.state;
  if (!state) {
    return 0.5;
  }

  if (state.lastFeedbackKind === "not_interested") {
    return 0;
  }

  if (state.lastFeedbackKind === "interested") {
    return 1;
  }

  const detailViews = Math.min(state.detailViewCount ?? 0, 3) * 0.18;
  const repeatViews = Math.min(state.repeatViewCount ?? 0, 3) * 0.22;
  return clampScore(0.35 + detailViews + repeatViews);
}

function computeRevisitPressure(input: OpportunityCandidateInput): number {
  const state = input.state;
  if (!state) {
    return 0;
  }

  if (state.lastFeedbackKind !== "revisit") {
    return 0;
  }

  const days = state.daysSinceLastSurfaced ?? 0;
  if (days >= 7) {
    return 1;
  }

  if (days >= 3) {
    return 0.7;
  }

  return 0.3;
}

function buildWhyMatched(
  userGoalModel: UserGoalModel,
  directionProfile: CandidateDirectionProfile,
  overlapTags: readonly DirectionTag[]
): string {
  if (overlapTags.length > 0) {
    return `Shared direction around ${createDirectionSummary(overlapTags)}.`;
  }

  if (directionProfile.directionTags.length > 0) {
    return `Public profile leans ${directionProfile.summary}, but overlap with your current direction is still weak.`;
  }

  if (userGoalModel.explicitGoal) {
    return "Direction evidence is thin; surfaced as a weak-fit candidate for validation only.";
  }

  return "Direction evidence is still thin on both sides, so this is a low-confidence validation candidate.";
}

function buildWhyUncertain(
  directionProfile: CandidateDirectionProfile,
  overlapTags: readonly DirectionTag[],
  negativeOverlapCount: number
): string | undefined {
  if (negativeOverlapCount > 0) {
    return "Some public signals overlap with directions you have explicitly pushed away from.";
  }

  if (directionProfile.directionTags.length === 0) {
    return "Public-expression evidence is too sparse to infer a clear direction.";
  }

  if (overlapTags.length === 0) {
    return "The candidate's public direction signals do not line up clearly with your current goal model yet.";
  }

  if (directionProfile.confidence === "medium") {
    return "The direction match is plausible, but supported by only a small number of public signals.";
  }

  return undefined;
}

function buildApproachPath(input: OpportunityCandidateInput, directionProfile: CandidateDirectionProfile): string {
  const sources = new Set(input.document?.facetSource ?? []);
  const tags = new Set(directionProfile.directionTags);
  const hasRepoEvidence = input.evidence.some((item) => item.evidenceType === "repository");
  const hasProjectEvidence = input.evidence.some((item) => item.evidenceType === "project");

  if (sources.has("bonjour")) {
    return "Start with a direct peer-style intro from their Bonjour profile and anchor on the shared direction.";
  }

  if (tags.has("open_source") || hasRepoEvidence) {
    return "Lead with their open-source work and ask what they want to build next in this space.";
  }

  if (hasProjectEvidence) {
    return "Reference the project they are already building and ask how they think the space evolves from here.";
  }

  if (tags.has("developer_tools")) {
    return "Open with a concrete builder-to-builder question about developer tooling pain points.";
  }

  return "Use their public profile direction directly and ask what kind of company or product they actually want to build.";
}

function buildWhyNow(
  input: OpportunityCandidateInput,
  totalScore: number,
  breakdown: Pick<OpportunityScoreBreakdown, "freshness" | "reachability" | "revisitPressure">
): string {
  const state = input.state;

  if (state?.lastFeedbackKind === "revisit" && breakdown.revisitPressure >= 0.7) {
    return "You deferred this earlier and enough time has passed to revisit it with a fresh push.";
  }

  if (breakdown.freshness >= 0.75 && breakdown.reachability >= 0.7) {
    return "Signals are fresh and the path to outreach is comparatively direct, so it is worth acting now.";
  }

  if ((state?.repeatViewCount ?? 0) > 0 || (state?.detailViewCount ?? 0) > 1) {
    return "Your recent viewing behavior suggests this direction is worth turning into an actual outreach attempt.";
  }

  if (totalScore >= 0.65) {
    return "This is one of the strongest direction matches in today's pool, so it belongs near the top of the queue.";
  }

  return "This is still worth a lightweight validation touch because it survives the direction-first ranking without a strong contradiction.";
}

function classifyOpportunityConfidence(
  directionMatchScore: number,
  profileConfidence: CandidateDirectionProfile["confidence"],
  whyUncertain: string | undefined
): "high" | "medium" | "low" {
  if (directionMatchScore >= 0.55 && profileConfidence === "high" && !whyUncertain) {
    return "high";
  }

  if (directionMatchScore >= 0.24 && profileConfidence !== "low") {
    return "medium";
  }

  return "low";
}

function assignDealFlowBucket(
  input: OpportunityCandidateInput,
  score: number,
  directionMatchScore: number,
  confidence: "high" | "medium" | "low"
): DealFlowBucket {
  if (input.state?.lastFeedbackKind === "revisit") {
    return "revisit";
  }

  if (confidence === "high" && directionMatchScore >= 0.45 && score >= 0.58) {
    return "high-confidence";
  }

  if ((input.state?.seenCount ?? 0) === 0) {
    return "new";
  }

  return "needs-validation";
}

export class OpportunityScorer {
  private readonly config: OpportunityScorerConfig;

  constructor(config: Partial<OpportunityScorerConfig> = {}) {
    this.config = {
      ...DEFAULT_OPPORTUNITY_SCORER_CONFIG,
      ...config
    };
  }

  scoreCandidate(
    userGoalModel: UserGoalModel,
    candidate: OpportunityCandidateInput
  ): OpportunityScoreResult {
    const directionProfile = candidate.directionProfile
      ?? buildCandidateDirectionProfile(candidate.person, candidate.evidence);
    const directionMatch = computeDirectionMatch(
      userGoalModel,
      directionProfile.directionTags,
      directionProfile.confidence
    );
    const freshness = daysToFreshnessScore(candidate.document?.rankFeatures?.freshness);
    const reachability = computeReachabilityScore(candidate);
    const engagementFit = computeEngagementFitScore(candidate);
    const revisitPressure = computeRevisitPressure(candidate);
    const negativePenalty = clampScore(directionMatch.negativeOverlapCount * 0.18);

    const secondaryWeighted = (
      freshness * this.config.freshnessWeight +
      reachability * this.config.reachabilityWeight +
      engagementFit * this.config.engagementWeight +
      revisitPressure * this.config.revisitWeight
    );
    const cappedSecondary = directionMatch.score < 0.2
      ? Math.min(secondaryWeighted, this.config.lowDirectionSecondaryCap)
      : secondaryWeighted;
    const totalScore = clampScore(
      directionMatch.score * this.config.directionWeight +
      cappedSecondary -
      negativePenalty
    );

    const whyMatched = buildWhyMatched(userGoalModel, directionProfile, directionMatch.overlapTags);
    const whyUncertain = buildWhyUncertain(
      directionProfile,
      directionMatch.overlapTags,
      directionMatch.negativeOverlapCount
    );
    const confidence = classifyOpportunityConfidence(
      directionMatch.score,
      directionProfile.confidence,
      whyUncertain
    );
    const whyNow = buildWhyNow(candidate, totalScore, {
      freshness,
      reachability,
      revisitPressure
    });
    const approachPath = buildApproachPath(candidate, directionProfile);
    const bucket = assignDealFlowBucket(
      candidate,
      totalScore,
      directionMatch.score,
      confidence
    );

    return {
      personId: candidate.person.id,
      name: candidate.person.primaryName,
      headline: candidate.person.primaryHeadline ?? null,
      bucket,
      totalScore,
      confidence,
      whyMatched,
      whyNow,
      approachPath,
      whyUncertain,
      directionProfile,
      directionOverlapTags: directionMatch.overlapTags,
      breakdown: {
        directionMatch: directionMatch.score,
        freshness,
        reachability,
        engagementFit,
        revisitPressure,
        negativePenalty,
        total: totalScore
      },
      candidate
    };
  }

  scoreCandidates(
    userGoalModel: UserGoalModel,
    candidates: readonly OpportunityCandidateInput[]
  ): OpportunityScoreResult[] {
    return candidates
      .map((candidate) => this.scoreCandidate(userGoalModel, candidate))
      .sort((left, right) => right.totalScore - left.totalScore);
  }
}

function shouldSuppressCandidate(
  result: OpportunityScoreResult,
  config: DailyDealFlowCuratorConfig
): boolean {
  const state = result.candidate.state;

  if (state?.contactedAt || state?.lastFeedbackKind === "contacted") {
    return true;
  }

  if (
    state?.lastFeedbackKind === "not_interested"
    && result.totalScore < 0.75
  ) {
    return true;
  }

  if (
    typeof state?.daysSinceLastSurfaced === "number"
    && state.daysSinceLastSurfaced < config.recentSuppressionDays
    && state.lastFeedbackKind !== "revisit"
    && result.totalScore < 0.78
  ) {
    return true;
  }

  return false;
}

function countBuckets(results: readonly OpportunityScoreResult[]): Record<DealFlowBucket, number> {
  const counts: Record<DealFlowBucket, number> = {
    new: 0,
    "high-confidence": 0,
    "needs-validation": 0,
    revisit: 0
  };

  for (const result of results) {
    counts[result.bucket] += 1;
  }

  return counts;
}

function formatDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class DailyDealFlowCurator {
  private readonly config: DailyDealFlowCuratorConfig;

  constructor(config: Partial<DailyDealFlowCuratorConfig> = {}) {
    this.config = {
      ...DEFAULT_DEAL_FLOW_CURATOR_CONFIG,
      ...config
    };
  }

  curate(
    scoredCandidates: readonly OpportunityScoreResult[],
    date = new Date()
  ): DailyDealFlowArtifact {
    const filtered = scoredCandidates.filter(
      (candidate) => !shouldSuppressCandidate(candidate, this.config)
    );
    const deduped: OpportunityScoreResult[] = [];
    const seen = new Set<string>();

    for (const candidate of filtered) {
      if (seen.has(candidate.personId)) {
        continue;
      }
      seen.add(candidate.personId);
      deduped.push(candidate);
    }

    const limited = deduped.slice(0, this.config.size);
    const topToday = limited.slice(0, this.config.topCount);
    const moreOpportunities = limited.slice(this.config.topCount);

    return {
      generatedForDate: formatDateKey(date),
      generatedAt: date.toISOString(),
      topToday,
      moreOpportunities,
      totalCandidates: limited.length,
      bucketCounts: countBuckets(limited)
    };
  }
}
