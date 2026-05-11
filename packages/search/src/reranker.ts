import type { EvidenceItem, SearchDocument } from "@seeku/db";

import type { QueryIntent } from "./planner.js";
import type { SearchResult } from "./retriever.js";
import type { CrossEncoderScore } from "./cross-encoder.js";
import { SCORING_CONFIG } from "./scoring-config.js";
import {
  escapeRegexPattern,
  isBoundarySensitiveSearchTerm,
  normalizeSearchText,
  textHasUniversitySignal
} from "./search-normalization.js";
import { ZJU_MANUAL_SEED_TAG } from "./zju-alumni-seeds.js";

/**
 * Graph features for reranking.
 * Only pairwise features (relative to anchor) are used for reranking.
 * Candidate-global features (degree, component) are intentionally excluded from v1
 * to avoid popularity bias overwhelming relevance signals.
 */
export interface GraphRerankFeatures {
  /** Number of mutual connections with anchor person */
  mutualConnectionCount?: number;
  /** Whether this candidate is a direct neighbor of the anchor */
  isDirectNeighbor?: boolean;
  /** Whether this candidate is in the same component as the anchor */
  sameComponentAsAnchor?: boolean;
}

export interface RerankResult extends SearchResult {
  finalScore: number;
  evidenceBoost: number;
  freshnessPenalty: number;
  crossEncoderScore?: number;
  crossEncoderReasoning?: string;
  matchReasons: string[];
}

export interface RerankerConfig {
  projectMatchBoost: number;
  repoMatchBoost: number;
  followerBoostScale: number;
  freshnessDecayDays: number;
  /** Weight for cross-encoder score when available (0-1, default: from scoring-config) */
  crossEncoderWeight?: number;
  specializedGithubBoost?: number;
  specializedGithubRepoBoost?: number;
  openSourceGithubBoost?: number;
  openSourceTextBoost?: number;
  techLeadBoost?: number;
  universityFocusBoost?: number;
  universityManualSeedBoost?: number;
  strongVectorThreshold?: number;
  strongKeywordThreshold?: number;
  /** Master switch for graph rerank features. When false, graph features are ignored. */
  graphRerankEnabled?: boolean;
  /** Graph feature boost configuration */
  graphMutualConnectionBoost?: number;
  graphDirectNeighborBoost?: number;
  graphSameComponentBoost?: number;
  graphHighDegreeBoost?: number;
  graphHighDegreeThreshold?: number;
}

const DEFAULT_CONFIG: Required<RerankerConfig> = {
  projectMatchBoost: SCORING_CONFIG.reranker.projectMatchBoost,
  repoMatchBoost: SCORING_CONFIG.reranker.repoMatchBoost,
  followerBoostScale: SCORING_CONFIG.reranker.followerBoostScale,
  freshnessDecayDays: SCORING_CONFIG.reranker.freshnessDecayDays,
  crossEncoderWeight: SCORING_CONFIG.reranker.crossEncoderWeight,
  specializedGithubBoost: SCORING_CONFIG.reranker.specializedGithubBoost,
  specializedGithubRepoBoost: SCORING_CONFIG.reranker.specializedGithubRepoBoost,
  openSourceGithubBoost: SCORING_CONFIG.reranker.openSourceGithubBoost,
  openSourceTextBoost: SCORING_CONFIG.reranker.openSourceTextBoost,
  techLeadBoost: SCORING_CONFIG.reranker.techLeadBoost,
  universityFocusBoost: SCORING_CONFIG.reranker.universityFocusBoost,
  universityManualSeedBoost: SCORING_CONFIG.reranker.universityManualSeedBoost,
  strongVectorThreshold: SCORING_CONFIG.reranker.strongVectorThreshold,
  strongKeywordThreshold: SCORING_CONFIG.reranker.strongKeywordThreshold,
  // Graph feature configuration - from scoring-config
  graphRerankEnabled: SCORING_CONFIG.reranker.graphRerankEnabled,
  graphMutualConnectionBoost: SCORING_CONFIG.reranker.graphMutualConnectionBoost,
  graphDirectNeighborBoost: SCORING_CONFIG.reranker.graphDirectNeighborBoost,
  // Same-component boost disabled: 99.8% of graph is one giant component
  graphSameComponentBoost: SCORING_CONFIG.reranker.graphSameComponentBoost,
  graphHighDegreeBoost: 0.0,  // Disabled - avoid popularity bias
  graphHighDegreeThreshold: 100
};

const OPEN_SOURCE_QUERY_TERMS = ["open source", "开源"] as const;
const OPEN_SOURCE_TEXT_TERMS = ["open source", "open-source", "开源"] as const;
const TECH_LEAD_ROLE_TERMS = ["tech lead", "technical lead", "技术负责人", "负责人", "lead", "技术总监"] as const;
const STRICT_ROLE_QUERY_TERMS = [
  "founder",
  "创始人",
  "联合创始人",
  "co-founder",
  "cofounder",
  "tech lead",
  "technical lead",
  "技术负责人",
  "技术总监",
  "researcher",
  "研究员",
  "研究科学家",
  "research scientist",
  "scientist",
  "科学家",
  "product manager",
  "产品经理",
  "产品负责人",
  "manager",
  "管理者"
] as const;
const ROLE_MATCH_EQUIVALENTS: Record<string, string[]> = {
  "tech lead": ["tech lead", "technical lead", "技术负责人", "负责人", "技术总监"],
  engineer: ["engineer", "工程师", "ai工程师", "后端工程师", "算法工程师", "机器学习工程师", "ml engineer"],
  "ai engineer": ["ai engineer", "ai工程师", "人工智能工程师", "ml engineer", "机器学习工程师", "算法工程师", "nlp工程师", "cv工程师", "rag工程师", "agent工程师"],
  founder: ["founder", "创始人", "联合创始人", "co-founder", "cofounder", "创业"],
  researcher: ["researcher", "研究员", "研究者", "ai研究员", "研究科学家", "algorithm researcher", "算法研究员", "research scientist"],
  scientist: ["scientist", "科学家", "研究科学家", "research scientist"],
  manager: ["manager", "经理", "负责人", "管理者", "技术负责人", "产品负责人"],
  "product manager": ["product manager", "product", "pm", "产品经理", "产品负责人"],
  architect: ["architect", "架构师", "系统架构", "software architect"],
  developer: ["developer", "开发者", "独立开发者"]
};
const SPECIALIZED_QUERY_TERMS = [
  "rag",
  "retrieval",
  "检索",
  "检索增强",
  "向量检索",
  "vector search",
  "multimodal",
  "multi-modal",
  "多模态",
  "computer vision",
  "计算机视觉",
  "llm",
  "大模型",
  "大语言模型",
  "agent",
  "智能体",
  "agentic",
  "transformer",
  "diffusion",
  "rlhf",
  "fine-tuning",
  "微调",
  "nlp",
  "自然语言处理",
  "deep learning",
  "深度学习",
  "机器学习",
  "machine learning",
  "pytorch",
  "tensorflow",
  "cuda",
  "triton",
  "langchain",
  "llamaindex",
  "vllm"
] as const;
const SOFT_SKILL_DIMENSION_TERMS = [
  "ai",
  "artificial intelligence",
  "人工智能",
  "generative ai",
  "生成式 ai",
  "生成式人工智能",
  "生成式",
  "aigc",
  "open source",
  "open-source",
  "开源",
  "research",
  "researcher",
  "paper",
  "papers",
  "publication",
  "publications",
  "published",
  "论文",
  "发表",
  "产品",
  "product"
] as const;
const SKILL_MATCH_EQUIVALENTS: Record<string, string[]> = {
  algorithm: ["algorithm", "算法", "算法工程师", "算法研究员"],
  "computer vision": ["computer vision", "cv", "计算机视觉", "视觉"],
  rag: ["rag", "retrieval", "检索", "检索增强", "retrieval augmented", "向量检索"],
  retrieval: ["retrieval", "rag", "检索", "检索增强", "向量检索", "vector search", "vector database", "向量数据库"],
  nlp: ["nlp", "自然语言处理", "natural language processing"],
  llm: ["llm", "大模型", "大语言模型", "large language model"],
  agent: ["agent", "智能体", "agentic"],
  "machine learning": ["machine learning", "ml", "机器学习"],
  "deep learning": ["deep learning", "深度学习"],
  multimodal: ["multimodal", "multi-modal", "多模态"],
  "fine-tuning": ["fine-tuning", "fine tuning", "微调", "sft"],
  diffusion: ["diffusion", "扩散模型"],
  rlhf: ["rlhf", "rl", "rlvr", "强化学习", "reinforcement learning"],
  robotics: ["robotics", "机器人", "ros", "ros2"],
  speech: ["speech", "语音", "tts", "asr", "audio", "音频"],
  "generative ai": ["generative ai", "生成式 ai", "生成式人工智能", "生成式", "aigc", "ai"]
};

// Dimension coverage: soft penalty when query has multiple key dimensions.
// Multipliers by matched dimensions:
//  - all dimensions matched: 1.0
//  - partial match: 0.55 + 0.45 * matchedRatio
//  - zero dimensions: 0.5
const DIMENSION_COVERAGE_ZERO_MATCH_PENALTY = 0.5;
const DIMENSION_COVERAGE_PARTIAL_BASE = 0.55;
const DIMENSION_COVERAGE_PARTIAL_SCALE = 0.45;
const MULTI_SKILL_PARTIAL_COVERAGE_PENALTY = 0.3;
const MULTI_SKILL_FULL_COVERAGE_BOOST = 1.08;
const MULTI_SKILL_PARTIAL_COVERAGE_EXPONENT = 1.25;
const STRICT_ROLE_MISS_PENALTY = 0.72;

export type QueryArchetype = "leadership" | "researcher" | "product" | "engineer" | "general";

const ARCHETYPE_LEADERSHIP_PATTERN = /(founder|co-founder|创始人|联合创始人|ceo|cto|tech lead|technical lead|技术负责人|技术总监|vp of|director of)/;
const ARCHETYPE_RESEARCHER_PATTERN = /(researcher|research scientist|研究员|研究科学家|科学家|scientist)/;
const ARCHETYPE_PRODUCT_PATTERN = /(product manager|产品经理|产品负责人|\bpm\b)/;
const ARCHETYPE_ENGINEER_PATTERN = /(engineer|工程师|开发者|developer|算法)/;
const EVIDENCE_GATE_FALLBACK_QUERY_PATTERN = /(founder|创始人|联合创始人|co-founder|cofounder|tech lead|technical lead|技术负责人|技术总监|researcher|研究员|研究科学家|research scientist|scientist|科学家|product manager|产品经理|产品负责人|manager|管理者)/;
const EVIDENCE_GATE_FALLBACK_ROLE_PENALTY = 0.72;

export function deriveArchetype(intent: QueryIntent): QueryArchetype {
  const roleText = intent.roles.map(r => r.toLowerCase()).join(" ");
  const queryLower = intent.rawQuery.toLowerCase();
  const combined = `${roleText} ${queryLower}`;

  if (ARCHETYPE_LEADERSHIP_PATTERN.test(combined)) return "leadership";
  if (ARCHETYPE_RESEARCHER_PATTERN.test(combined)) return "researcher";
  if (ARCHETYPE_PRODUCT_PATTERN.test(combined)) return "product";
  if (ARCHETYPE_ENGINEER_PATTERN.test(combined)) return "engineer";
  return "general";
}

function textFromEvidence(item: EvidenceItem): string {
  return normalizeSearchText(`${item.title ?? ""} ${item.description ?? ""}`);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasRepositoryEvidence(evidence: EvidenceItem[]): boolean {
  return evidence.some((item) => item.evidenceType === "repository");
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))].slice(0, 5);
}

function textIncludesAny(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeSearchText(text);
  return terms.some((term) => normalized.includes(normalizeSearchText(term)));
}

function uniqueNormalized(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeSearchText(value)).filter(Boolean))];
}

function expandRoleMatchTerms(role: string): string[] {
  const normalized = normalizeSearchText(role);
  const expanded = new Set<string>([normalized]);

  for (const [canonical, variants] of Object.entries(ROLE_MATCH_EQUIVALENTS)) {
    const family = uniqueNormalized([canonical, ...variants]);
    if (family.includes(normalized)) {
      family.forEach((term) => expanded.add(term));
    }
  }

  return [...expanded].filter(Boolean);
}

function expandSkillMatchTerms(skill: string): string[] {
  const normalized = normalizeSearchText(skill);
  const expanded = new Set<string>([normalized]);

  for (const [canonical, variants] of Object.entries(SKILL_MATCH_EQUIVALENTS)) {
    const family = uniqueNormalized([canonical, ...variants]);
    if (family.includes(normalized)) {
      family.forEach((term) => expanded.add(term));
    }
  }

  return [...expanded].filter(Boolean);
}

function isSoftSkillDimension(skill: string): boolean {
  const terms = expandSkillMatchTerms(skill);
  return terms.some((term) => SOFT_SKILL_DIMENSION_TERMS.includes(term as typeof SOFT_SKILL_DIMENSION_TERMS[number]));
}

function mergeOverlappingTermFamilies(families: string[][]): string[][] {
  const merged: string[][] = [];

  for (const family of families) {
    const uniqueFamily = uniqueNormalized(family);
    if (uniqueFamily.length === 0) {
      continue;
    }

    const existing = merged.find((candidate) => candidate.some((term) => uniqueFamily.includes(term)));
    if (existing) {
      for (const term of uniqueFamily) {
        if (!existing.includes(term)) {
          existing.push(term);
        }
      }
      continue;
    }

    merged.push(uniqueFamily);
  }

  return merged;
}

function buildSubstantiveSkillFamilies(skills: string[]): string[][] {
  return mergeOverlappingTermFamilies(
    uniqueNormalized(skills)
      .filter((skill) => !isSoftSkillDimension(skill))
      .map((skill) => expandSkillMatchTerms(skill))
  );
}

export function analyzeSkillCoverage(
  skills: string[],
  document?: SearchDocument
): { familyCount: number; matchedCount: number } {
  const skillFamilies = buildSubstantiveSkillFamilies(skills);
  const matchedCount = skillFamilies.filter((terms) => candidateMatchesSkillFamily(terms, document)).length;
  return {
    familyCount: skillFamilies.length,
    matchedCount
  };
}

function textContainsTerm(text: string, term: string): boolean {
  if (!text || !term) {
    return false;
  }

  if (isBoundarySensitiveSearchTerm(term)) {
    return new RegExp(`\\b${escapeRegexPattern(term)}\\b`, "i").test(text);
  }

  return text.includes(term);
}

function candidateMatchesSkillFamily(
  terms: string[],
  document?: SearchDocument
): boolean {
  const docTags = (document?.facetTags ?? []).map((tag) => normalizeSearchText(tag));
  const docText = normalizeSearchText(document?.docText ?? "");

  return terms.some((term) =>
    docTags.some((tag) => {
      if (!tag) {
        return false;
      }
      if (tag === term) {
        return true;
      }
      if (tag.length >= 3 && term.length >= 3) {
        return tag.includes(term) || term.includes(tag);
      }
      return false;
    })
    || textContainsTerm(docText, term)
  );
}

function candidateMatchesRoleFamily(
  terms: string[],
  document?: SearchDocument
): boolean {
  const docRoles = (document?.facetRole ?? []).map((role) => normalizeSearchText(role));
  const docText = normalizeSearchText(document?.docText ?? "");

  return terms.some((term) =>
    docRoles.some((role) => {
      if (!role) {
        return false;
      }
      if (role === term) {
        return true;
      }
      if (role.length >= 3 && term.length >= 3) {
        return role.includes(term) || term.includes(role);
      }
      return false;
    })
    || textContainsTerm(docText, term)
  );
}

function candidateMatchesRoleFamilyInFacets(
  terms: string[],
  document?: SearchDocument
): boolean {
  const docRoles = (document?.facetRole ?? []).map((role) => normalizeSearchText(role));

  return terms.some((term) =>
    docRoles.some((role) => {
      if (!role) {
        return false;
      }
      if (role === term) {
        return true;
      }
      if (role.length >= 3 && term.length >= 3) {
        return role.includes(term) || term.includes(role);
      }
      return false;
    })
  );
}

export class Reranker {
  private readonly config: Required<RerankerConfig>;

  constructor(config: Partial<RerankerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current configuration for observability.
   * Used by SearchExecutor to log config at startup.
   */
  getConfig(): Required<RerankerConfig> {
    return this.config;
  }

  /**
   * Rerank search results with optional graph features.
   * Graph features are only applied when an anchor context exists.
   */
  rerank(
    results: SearchResult[],
    intent: QueryIntent,
    documents: Map<string, SearchDocument>,
    evidenceByPerson: Map<string, EvidenceItem[]>,
    crossEncoderScores?: Map<string, CrossEncoderScore>,
    graphFeaturesByPerson?: Map<string, GraphRerankFeatures>
  ): RerankResult[] {
    const archetype = deriveArchetype(intent);
    return results
      .map((result) => {
        const document = documents.get(result.personId);
        const evidence = evidenceByPerson.get(result.personId) ?? [];
        const evidenceBoost = this.computeEvidenceBoost(evidence, intent, document);
        const freshnessPenalty = this.computeFreshnessPenalty(document);
        const crossEncoderResult = crossEncoderScores?.get(result.personId);
        const graphFeatures = graphFeaturesByPerson?.get(result.personId);
        const graphBoost = this.computeGraphBoost(graphFeatures);
        const dimensionPenalty = this.computeDimensionCoveragePenalty(intent, document, evidence);
        const skillCoveragePenalty = this.computeSkillCoveragePenalty(intent, document);
        const rolePenalty = SCORING_CONFIG.evidenceGate.enabled
          ? this.computeEvidenceGatePenalty(intent, document, archetype)
          : this.computeEvidenceGateFallbackPenalty(intent, document, archetype);

        // Combine heuristic score with cross-encoder if available
        const heuristicScore = result.combinedScore
          * (1 + evidenceBoost + graphBoost)
          * freshnessPenalty
          * dimensionPenalty
          * skillCoveragePenalty;
        const crossEncoderWeight = this.config.crossEncoderWeight;

        const blendedScore = crossEncoderResult
          ? heuristicScore * (1 - crossEncoderWeight) +
            crossEncoderResult.relevanceScore * crossEncoderWeight
          : heuristicScore;
        const finalScore = blendedScore * rolePenalty;

        const matchReasons = this.extractMatchReasons(
          result,
          intent,
          document,
          evidence,
          crossEncoderResult,
          graphFeatures
        );

        return {
          ...result,
          finalScore,
          evidenceBoost,
          freshnessPenalty,
          crossEncoderScore: crossEncoderResult?.relevanceScore,
          crossEncoderReasoning: crossEncoderResult?.reasoning,
          matchReasons
        };
      })
      .sort((left, right) => right.finalScore - left.finalScore);
  }

  /**
   * Compute dimension coverage penalty.
   * If the query has 2+ key dimensions (role, skill, mustHave), apply a
   * multiplicative penalty proportional to the number of dimensions matched.
   * This implements "soft AND" — doesn't hard-filter, just pushes irrelevant
   * and incomplete candidates down in ranking.
   */
  private computeDimensionCoveragePenalty(
    intent: QueryIntent,
    document?: SearchDocument,
    evidence: EvidenceItem[] = []
  ): number {
    const dimensions: Array<{ queryTerms: string[]; matchCheck: () => boolean }> = [];
    const requireStrictRoleEvidence = this.queryWantsStrictRoleMatch(intent);

    // Role dimension
    if (intent.roles.length > 0) {
      dimensions.push({
        queryTerms: intent.roles,
        matchCheck: () => {
          const roleFamilies = mergeOverlappingTermFamilies(intent.roles.map((role) => expandRoleMatchTerms(role)));
          return roleFamilies.some((terms) => requireStrictRoleEvidence
            ? candidateMatchesRoleFamilyInFacets(terms, document)
            : candidateMatchesRoleFamily(terms, document));
        }
      });
    }

    // Skill dimension
    if (intent.skills.length > 0) {
      dimensions.push({
        queryTerms: intent.skills,
        matchCheck: () => {
          const skillFamilies = mergeOverlappingTermFamilies(intent.skills.map((skill) => expandSkillMatchTerms(skill)));
          return skillFamilies.some((terms) => candidateMatchesSkillFamily(terms, document));
        }
      });
    }

    // Must-have dimension
    if (intent.mustHaves.length > 0) {
      dimensions.push({
        queryTerms: intent.mustHaves,
        matchCheck: () => {
          const docText = normalizeSearchText(document?.docText ?? "");
          return intent.mustHaves.some(term => {
            const lower = term.toLowerCase();
            return docText.includes(lower)
              || evidence.some(e => normalizeSearchText(`${e.title ?? ""} ${e.description ?? ""}`).includes(lower));
          });
        }
      });
    }

    // Only apply penalty if query has 2+ dimensions
    if (dimensions.length < 2) {
      return 1.0;
    }

    const matchedDimensions = dimensions.filter(d => d.matchCheck()).length;

    if (matchedDimensions === dimensions.length) {
      return 1.0;
    }

    if (matchedDimensions === 0) {
      return DIMENSION_COVERAGE_ZERO_MATCH_PENALTY;
    }

    const matchedRatio = matchedDimensions / dimensions.length;
    return DIMENSION_COVERAGE_PARTIAL_BASE + DIMENSION_COVERAGE_PARTIAL_SCALE * matchedRatio;
  }

  private computeSkillCoveragePenalty(
    intent: QueryIntent,
    document?: SearchDocument
  ): number {
    const coverage = analyzeSkillCoverage(intent.skills, document);
    if (coverage.familyCount < 2) {
      return 1.0;
    }

    if (coverage.matchedCount === coverage.familyCount) {
      return MULTI_SKILL_FULL_COVERAGE_BOOST;
    }

    if (coverage.matchedCount === 0) {
      return MULTI_SKILL_PARTIAL_COVERAGE_PENALTY;
    }

    const ratio = coverage.matchedCount / coverage.familyCount;
    return MULTI_SKILL_PARTIAL_COVERAGE_PENALTY
      + (1 - MULTI_SKILL_PARTIAL_COVERAGE_PENALTY) * Math.pow(ratio, MULTI_SKILL_PARTIAL_COVERAGE_EXPONENT);
  }

  private computeStrictRolePenalty(
    intent: QueryIntent,
    document?: SearchDocument
  ): number {
    if (!this.queryWantsStrictRoleMatch(intent) || intent.roles.length === 0) {
      return 1.0;
    }

    const roleFamilies = mergeOverlappingTermFamilies(intent.roles.map((role) => expandRoleMatchTerms(role)));
    const hasRoleMatch = roleFamilies.some((terms) => candidateMatchesRoleFamilyInFacets(terms, document));
    return hasRoleMatch ? 1.0 : STRICT_ROLE_MISS_PENALTY;
  }

  private computeEvidenceGateFallbackPenalty(
    intent: QueryIntent,
    document: SearchDocument | undefined,
    archetype: QueryArchetype
  ): number {
    if (intent.roles.length === 0) {
      return 1.0;
    }

    const combined = `${intent.rawQuery} ${intent.roles.join(" ")}`.toLowerCase();
    if (!EVIDENCE_GATE_FALLBACK_QUERY_PATTERN.test(combined)) {
      return 1.0;
    }

    const facetText = normalizeSearchText((document?.facetRole ?? []).join(" "));
    if (!facetText) {
      return EVIDENCE_GATE_FALLBACK_ROLE_PENALTY;
    }

    const archetypePattern = (() => {
      switch (archetype) {
        case "leadership":
          return /(founder|创始人|联合创始人|管理者|技术负责人|负责人|ceo|cto)/;
        case "researcher":
          return /(研究员|ai研究员|研究科学家|算法工程师|researcher|research scientist|scientist)/;
        case "product":
          return /(产品经理|产品负责人|product manager|\bpm\b)/;
        case "engineer":
          return /(工程师|ai工程师|后端工程师|全栈工程师|算法工程师|开发者|engineer|developer)/;
        case "general":
          return null;
      }
    })();

    if (!archetypePattern) {
      return 1.0;
    }

    return archetypePattern.test(facetText) ? 1.0 : EVIDENCE_GATE_FALLBACK_ROLE_PENALTY;
  }

  private computeEvidenceGatePenalty(
    intent: QueryIntent,
    document: SearchDocument | undefined,
    archetype: QueryArchetype
  ): number {
    if (archetype === "general") return 1.0;

    const rf = document?.rankFeatures;
    const strongRoles = rf?.strongRoles ?? [];
    const strongSkills = rf?.strongSkills ?? [];
    const leadershipCount = rf?.leadershipEvidenceCount ?? 0;
    const hasResearchSignal = rf?.hasResearchSignal ?? false;

    switch (archetype) {
      case "leadership": {
        const hasLeadershipRole = strongRoles.some(role =>
          /(创始人|联合创始人|管理者|技术负责人|合伙人|投资人)/.test(role)
        );
        if (leadershipCount > 0 || hasLeadershipRole) return 1.0;
        return SCORING_CONFIG.evidenceGate.leadershipPenalty;
      }

      case "researcher": {
        const hasDirectResearchRole = strongRoles.some(role =>
          /(研究员|AI研究员|研究科学家)/.test(role)
        );
        if (hasDirectResearchRole) return 1.0;

        const hasAlgorithmRole = strongRoles.some(role => /算法工程师/.test(role));
        if (hasAlgorithmRole) {
          if (hasResearchSignal) return 1.0;
          return SCORING_CONFIG.evidenceGate.researcherPartialPenalty;
        }

        const facetRoles = document?.facetRole ?? [];
        const hasFacetResearchRole = facetRoles.some(role =>
          /(研究员|AI研究员|研究科学家)/.test(role)
        );
        if (hasFacetResearchRole) {
          return SCORING_CONFIG.evidenceGate.researcherPartialPenalty;
        }

        return SCORING_CONFIG.evidenceGate.researcherPenalty;
      }

      case "product": {
        const hasProductRole = strongRoles.some(role =>
          /^(产品经理)$/.test(role)
        );
        if (hasProductRole) return 1.0;

        const facetRoles = document?.facetRole ?? [];
        const hasFacetProductRole = facetRoles.some(role =>
          /^(产品经理|产品负责人)$/.test(role)
        );
        if (hasFacetProductRole) {
          return SCORING_CONFIG.evidenceGate.productPartialPenalty;
        }

        return SCORING_CONFIG.evidenceGate.productPenalty;
      }

      case "engineer": {
        const substantiveSkills = intent.skills.filter(s => !isSoftSkillDimension(s));
        if (substantiveSkills.length === 0) return 1.0;

        const hasSkillOverlap = substantiveSkills.some(skill => {
          const expanded = expandSkillMatchTerms(skill);
          return expanded.some(term =>
            strongSkills.some(ss => ss.includes(term) || term.includes(ss))
          );
        });
        if (hasSkillOverlap) return 1.0;
        return SCORING_CONFIG.evidenceGate.engineerPenalty;
      }
    }
  }

  /**
   * Compute graph feature boost.
   * Only pairwise features (relative to anchor) are used.
   * Returns 0 if no graph features, no anchor context, or graph rerank disabled.
   */
  private computeGraphBoost(graphFeatures?: GraphRerankFeatures): number {
    // Master switch: if graph rerank is disabled, return 0
    if (!this.config.graphRerankEnabled) {
      return 0;
    }

    if (!graphFeatures) {
      return 0;
    }

    let boost = 0;

    // Mutual connections boost (capped to avoid runaway scores)
    if (graphFeatures.mutualConnectionCount && graphFeatures.mutualConnectionCount > 0) {
      // Cap at 5 mutual connections to avoid over-boosting
      const cappedCount = Math.min(graphFeatures.mutualConnectionCount, 5);
      boost += cappedCount * this.config.graphMutualConnectionBoost;
    }

    // Direct neighbor boost
    if (graphFeatures.isDirectNeighbor) {
      boost += this.config.graphDirectNeighborBoost;
    }

    // Same component boost (disabled by default - 99.8% of graph is one giant component)
    if (graphFeatures.sameComponentAsAnchor) {
      boost += this.config.graphSameComponentBoost;
    }

    return boost;
  }

  private computeEvidenceBoost(
    evidence: EvidenceItem[],
    intent: QueryIntent,
    document?: SearchDocument
  ): number {
    const skills = intent.skills.map((skill) => skill.toLowerCase());
    let boost = 0;
    const wantsOpenSource = this.queryWantsOpenSource(intent);
    const wantsTechLead = this.queryWantsTechLead(intent);
    const wantsSpecializedFocus = this.queryWantsSpecializedFocus(intent);
    const wantsUniversityFocus = this.queryWantsUniversityFocus(intent);
    const documentText = normalizeSearchText(document?.docText ?? "");

    for (const item of evidence) {
      const text = textFromEvidence(item);
      const language = typeof item.metadata?.language === "string"
        ? item.metadata.language.toLowerCase()
        : "";
      const matchesSkill = skills.some((skill) => text.includes(skill) || language === skill);

      if (item.evidenceType === "project" && matchesSkill) {
        boost += this.config.projectMatchBoost;
      }

      if (item.evidenceType === "repository" && matchesSkill) {
        boost += this.config.repoMatchBoost;
      }
    }

    if (
      wantsSpecializedFocus
      && document?.facetSource?.includes("github")
      && (
        skills.some((skill) => documentText.includes(skill))
        || evidence.some((item) => {
          const text = textFromEvidence(item);
          return item.evidenceType === "repository" && skills.some((skill) => text.includes(skill));
        })
      )
    ) {
      boost += this.config.specializedGithubBoost;

      if (hasRepositoryEvidence(evidence)) {
        boost += this.config.specializedGithubRepoBoost;
      }
    }

    // Bonjour technical evidence: give comparable boost when Bonjour profile_field
    // or project evidence contains clear technical content matching query skills.
    // This balances the GitHub-specific boosts so Bonjour-only candidates aren't
    // structurally disadvantaged.
    if (wantsSpecializedFocus) {
      const hasBonjourTechnicalEvidence = evidence.some((item) => {
        if (item.source !== "bonjour") return false;
        const text = textFromEvidence(item);
        if (item.evidenceType === "profile_field") {
          const field = typeof item.metadata?.field === "string" ? item.metadata.field : "";
          return (field === "skill" || field === "current_doing" || field === "role")
            && skills.some((skill) => text.includes(skill));
        }
        if (item.evidenceType === "project") {
          return skills.some((skill) => text.includes(skill));
        }
        return false;
      });

      if (hasBonjourTechnicalEvidence) {
        // Same magnitude as specializedGithubBoost
        boost += this.config.specializedGithubBoost;
      }
    }

    if (wantsOpenSource) {
      if (document?.facetSource?.includes("github")) {
        boost += this.config.openSourceGithubBoost;
      }

      if ((document?.docText && textIncludesAny(document.docText, OPEN_SOURCE_TEXT_TERMS))
        || evidence.some((item) => item.evidenceType === "repository")) {
        boost += this.config.openSourceTextBoost;
      }
    }

    // Bonjour project evidence boost: Bonjour projects with technical content
    // should get a boost comparable to GitHub repo evidence
    if (skills.length > 0) {
      const hasBonjourProjectMatch = evidence.some((item) => {
        if (item.source !== "bonjour" || item.evidenceType !== "project") return false;
        const text = textFromEvidence(item);
        return skills.some((skill) => text.includes(skill));
      });
      if (hasBonjourProjectMatch) {
        boost += this.config.projectMatchBoost;
      }
    }

    if (wantsTechLead) {
      const roleText = [
        ...(document?.facetRole ?? []),
        document?.docText ?? ""
      ].join(" ");

      if (textIncludesAny(roleText, TECH_LEAD_ROLE_TERMS)) {
        boost += this.config.techLeadBoost;
      }
    }

    if (wantsUniversityFocus && this.documentHasUniversitySignal(document, evidence)) {
      boost += this.config.universityFocusBoost;
    }

    if (wantsUniversityFocus && document?.facetTags?.includes(ZJU_MANUAL_SEED_TAG)) {
      boost += this.config.universityManualSeedBoost;
    }

    const followerCount = evidence.reduce((sum, item) => {
      return (
        sum +
        asNumber(item.metadata?.followers) +
        asNumber(item.metadata?.followersCount) +
        asNumber(item.metadata?.stargazers_count)
      );
    }, 0);

    boost += this.config.followerBoostScale * Math.log10(followerCount + 1);

    return boost;
  }

  private queryWantsOpenSource(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.skills, ...intent.mustHaves, ...intent.niceToHaves].join(" ");
    return textIncludesAny(text, OPEN_SOURCE_QUERY_TERMS);
  }

  private queryWantsTechLead(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.roles].join(" ");
    return textIncludesAny(text, TECH_LEAD_ROLE_TERMS);
  }

  private queryWantsStrictRoleMatch(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.roles].join(" ");
    return textIncludesAny(text, STRICT_ROLE_QUERY_TERMS);
  }

  private queryWantsSpecializedFocus(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.skills, ...intent.mustHaves, ...intent.niceToHaves].join(" ");
    return textIncludesAny(text, SPECIALIZED_QUERY_TERMS);
  }

  private queryWantsUniversityFocus(intent: QueryIntent): boolean {
    const text = [
      intent.rawQuery,
      ...intent.mustHaves,
      ...intent.niceToHaves
    ].join(" ");
    return textHasUniversitySignal(text);
  }

  private documentHasUniversitySignal(document: SearchDocument | undefined, evidence: EvidenceItem[]): boolean {
    if (textHasUniversitySignal(document?.docText ?? "")) {
      return true;
    }

    return evidence.some((item) => textHasUniversitySignal(`${item.title ?? ""} ${item.description ?? ""}`));
  }

  private computeFreshnessPenalty(document?: SearchDocument): number {
    const freshness = document?.rankFeatures?.freshness ?? 365;
    return Math.max(0.35, Math.exp(-freshness / this.config.freshnessDecayDays));
  }

  private extractMatchReasons(
    result: SearchResult,
    intent: QueryIntent,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    crossEncoderResult?: CrossEncoderScore,
    graphFeatures?: GraphRerankFeatures
  ): string[] {
    const reasons: string[] = [];
    const matchedText = normalizeSearchText(result.matchedText);

    // Include cross-encoder reasoning if available and meaningful
    if (crossEncoderResult?.reasoning && crossEncoderResult.relevanceScore >= 0.5) {
      reasons.push(`LLM: ${crossEncoderResult.reasoning}`);
    }

    // Graph feature reasons (only when anchor context exists and graph rerank enabled)
    if (graphFeatures && this.config.graphRerankEnabled) {
      if (graphFeatures.mutualConnectionCount && graphFeatures.mutualConnectionCount > 0) {
        reasons.push(`graph: ${graphFeatures.mutualConnectionCount} mutual connections`);
      }
      if (graphFeatures.isDirectNeighbor) {
        reasons.push("graph: direct neighbor");
      }
      if (graphFeatures.sameComponentAsAnchor && this.config.graphSameComponentBoost > 0) {
        reasons.push("graph: same component");
      }
    }

    for (const role of intent.roles) {
      const roleTerms = expandRoleMatchTerms(role);
      const roleMatched = this.queryWantsStrictRoleMatch(intent)
        ? candidateMatchesRoleFamilyInFacets(roleTerms, document)
        : candidateMatchesRoleFamily(roleTerms, document) || matchedText.includes(role);
      if (roleMatched) {
        reasons.push(`role match: ${role}`);
      }
    }

    if (this.queryWantsOpenSource(intent) && document?.facetSource?.includes("github")) {
      reasons.push("github open-source evidence");
    }

    if (this.queryWantsSpecializedFocus(intent)) {
      const hasGithubSpecialized = document?.facetSource?.includes("github")
        && (
          intent.skills.some((skill) => (document?.docText ?? "").toLowerCase().includes(skill))
          || evidence.some((item) => {
            const text = textFromEvidence(item);
            return item.evidenceType === "repository"
              && intent.skills.some((skill) => text.includes(skill));
          })
        );
      if (hasGithubSpecialized) {
        reasons.push("github technical evidence");
      }

      // Bonjour technical evidence reason
      const hasBonjourSpecialized = evidence.some((item) => {
        if (item.source !== "bonjour") return false;
        const text = textFromEvidence(item);
        if (item.evidenceType === "profile_field") {
          const field = typeof item.metadata?.field === "string" ? item.metadata.field : "";
          return (field === "skill" || field === "current_doing" || field === "role")
            && intent.skills.some((skill) => text.includes(skill));
        }
        if (item.evidenceType === "project") {
          return intent.skills.some((skill) => text.includes(skill));
        }
        return false;
      });
      if (hasBonjourSpecialized && !hasGithubSpecialized) {
        reasons.push("bonjour technical evidence");
      }
    }

    if (this.queryWantsTechLead(intent)) {
      const roleText = [
        ...(document?.facetRole ?? []),
        document?.docText ?? ""
      ].join(" ");
      if (textIncludesAny(roleText, TECH_LEAD_ROLE_TERMS)) {
        reasons.push("tech lead evidence");
      }
    }

    if (this.queryWantsUniversityFocus(intent) && this.documentHasUniversitySignal(document, evidence)) {
      reasons.push("zju evidence");
    }

    if (this.queryWantsUniversityFocus(intent) && document?.facetTags?.includes(ZJU_MANUAL_SEED_TAG)) {
      reasons.push("zju manual seed");
    }

    for (const skill of intent.skills) {
      const matchedEvidence = evidence.find((item) => textFromEvidence(item).includes(skill));
      const matchedTag = document?.facetTags?.includes(skill);

      if (matchedTag || matchedEvidence) {
        reasons.push(`skill evidence: ${skill}`);
      }
    }

    for (const term of intent.mustHaves) {
      if (matchedText.includes(term)) {
        reasons.push(`must-have matched: ${term}`);
      }
    }

    if (result.vectorScore >= this.config.strongVectorThreshold) {
      reasons.push("strong semantic similarity");
    }

    if (result.keywordScore >= this.config.strongKeywordThreshold) {
      reasons.push("strong keyword overlap");
    }

    const featuredProject = evidence.find((item) => item.evidenceType === "project" && item.title);
    if (featuredProject?.title) {
      reasons.push(`project: ${featuredProject.title}`);
    }

    return uniqueReasons(reasons);
  }
}

export function rerank(
  results: SearchResult[],
  intent: QueryIntent,
  documents: Map<string, SearchDocument>,
  evidenceByPerson: Map<string, EvidenceItem[]>,
  config: Partial<RerankerConfig> = {},
  crossEncoderScores?: Map<string, CrossEncoderScore>,
  graphFeaturesByPerson?: Map<string, GraphRerankFeatures>
): RerankResult[] {
  const reranker = new Reranker(config);
  return reranker.rerank(results, intent, documents, evidenceByPerson, crossEncoderScores, graphFeaturesByPerson);
}
