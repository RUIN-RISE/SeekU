import type { EvidenceItem, EvidenceType, Person } from "@seeku/db";

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
    .map((tag) => DIRECTION_PATTERNS.find((entry) => entry.tag === tag)?.label ?? tag)
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
  const recentDirectionTags = uniqueDirectionTags(
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

  const allDirectionTags = [
    ...explicitDirectionTags,
    ...currentDirectionTags,
    ...recentDirectionTags,
    ...feedbackDirectionTags,
    ...interactionDirectionTags
  ];

  const directionCounts = countDirectionTags(allDirectionTags);
  const dominantDirectionTags = sortDirectionTagsByCount(directionCounts);
  const driftStatus = inferDriftStatus(
    explicitDirectionTags,
    uniqueDirectionTags([...currentDirectionTags, ...recentDirectionTags])
  );

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
    recentDirectionTags: uniqueDirectionTags([...currentDirectionTags, ...recentDirectionTags]),
    negativeDirectionTags,
    directionCounts,
    driftStatus,
    feedbackWeights,
    signalSources,
    summary: buildGoalModelSummary(
      dominantDirectionTags,
      explicitDirectionTags,
      uniqueDirectionTags([...currentDirectionTags, ...recentDirectionTags]),
      driftStatus
    ),
    updatedAt: input.updatedAt ?? new Date()
  };
}
