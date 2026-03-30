import type { Person, EvidenceItem, NewSearchDocument, RankFeatures } from "@seeku/db";

export interface SearchDocumentInput {
  person: Person;
  evidence: EvidenceItem[];
  sourceHints?: string[];
}

export function buildSearchDocument(input: SearchDocumentInput): NewSearchDocument {
  const { person, evidence, sourceHints = [] } = input;

  // Build doc_text from person and evidence
  const textParts: string[] = [];

  // Person basic info
  if (person.primaryName) textParts.push(person.primaryName);
  if (person.primaryHeadline) textParts.push(person.primaryHeadline);
  if (person.summary) textParts.push(person.summary);
  if (person.primaryLocation) textParts.push(person.primaryLocation);

  // Evidence items
  for (const item of evidence) {
    if (item.title) textParts.push(item.title);
    if (item.description) textParts.push(item.description);
  }

  const docText = textParts.join(" ");

  // Extract facets
  const facetRole = extractRoles(person, evidence);
  const facetLocation = extractLocations(person, evidence);
  const facetSource = extractSources(evidence, sourceHints);
  const facetTags = extractTags(person, evidence);

  // Compute rank features
  const rankFeatures = computeRankFeatures(person, evidence);

  return {
    personId: person.id,
    docText,
    facetRole,
    facetLocation,
    facetSource,
    facetTags,
    rankFeatures,
    updatedAt: new Date()
  };
}

const ROLE_LABEL_MAX_LENGTH = 24;
const ROLE_SIGNAL_MAX_LENGTH = 160;
const SHORT_ROLE_SEGMENT_MAX_LENGTH = 36;
const RELEVANT_PROFILE_FIELDS = new Set(["role", "current_doing", "skill", "bio"]);

function normalizeRoleSourceText(value: string) {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[“”"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRoleSegments(value: string): string[] {
  const normalized = normalizeRoleSourceText(value);
  if (!normalized) {
    return [];
  }

  const prepared = normalized
    .replace(/\r?\n+/g, "\n")
    .replace(/[|｜;；]+/g, "\n")
    .replace(/[，,、]+/g, "\n")
    .replace(/\s*[\/／]\s*/g, "\n")
    .replace(/[。！？!?]+/g, "\n");

  return prepared
    .split("\n")
    .map((segment) =>
      segment
        .trim()
        .replace(/^[\-•·]+/u, "")
        .replace(/\s*@\s*[^@]+$/u, "")
        .replace(/\s+at\s+.+$/iu, "")
        .trim()
    )
    .filter((segment) => segment.length > 0 && Array.from(segment).length <= ROLE_SIGNAL_MAX_LENGTH);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function shouldIgnoreRoleSegment(segment: string, lower: string) {
  if (/(looking for|open to work|we are hiring|hiring|招聘|招募|寻找|求职)/i.test(lower)) {
    return true;
  }

  if (/合作伙伴/.test(segment)) {
    return true;
  }

  return false;
}

function classifyRoleSegment(segment: string): string[] {
  const normalized = segment.trim();
  if (!normalized) {
    return [];
  }

  const lower = normalized.toLowerCase();
  if (shouldIgnoreRoleSegment(normalized, lower)) {
    return [];
  }

  const isShortSegment = Array.from(normalized).length <= SHORT_ROLE_SEGMENT_MAX_LENGTH;
  const hasStrongRoleTitle =
    /(co[- ]?founder|founder|联合创始人|创始人|合伙人|\bpartner\b|investor|\bvc\b|投资人|产品经理|product manager|\bpm\b|designer|设计师|engineer|工程师|developer|开发者|独立开发者|researcher|研究员|sales|销售|顾问|consultant|student|学生|creator|创作者|aigcer|运营|operations?|后端|frontend|全栈|full[- ]?stack)/i.test(
      lower
    );

  if (!isShortSegment && !hasStrongRoleTitle) {
    return [];
  }

  const roles: string[] = [];
  const hasAiDomain =
    /(aigc|ai\b|agent|rag|llm|gpt|machine learning|deep learning|\bml\b|智能体|大模型|模型|算法|ai infra|infra|neocloud)/i.test(
      lower
    );
  const hasResearchSignal = /(researcher|research|研究员|研究|scientist)/i.test(lower);
  const hasExplicitResearcher = /(researcher|研究员|scientist)/i.test(lower);
  const hasEngineerSignal = /(engineer|工程师|研发)/i.test(lower);
  const hasDeveloperSignal =
    /(developer|开发者|builder|独立开发者|indie hacker|independent developer)/i.test(lower) ||
    /(网站开发|应用开发|软件开发)/i.test(lower);
  const hasProductManager = /(product manager|产品经理|\bpm\b)/i.test(lower);

  if (/(co[- ]?founder|联合创始人)/i.test(lower)) {
    roles.push("联合创始人");
  } else if (/(founder|创始人)/i.test(lower)) {
    roles.push("创始人");
  }

  if (/(合伙人|\bpartner\b)/i.test(lower)) {
    roles.push("合伙人");
  }

  if (/(investor|投资人|投资分析|\bvc\b|venture capital)/i.test(lower)) {
    roles.push("投资人");
  }

  if (hasProductManager) {
    roles.push("产品经理");
  }

  if (/(designer|设计师|品牌设计|\bux\b|\bui\b|视觉设计)/i.test(lower)) {
    roles.push("设计师");
  }

  const hasExplicitOperations = /(运营|operations?|operator|品牌运营|商业化运营|社区运营)/i.test(lower);
  if (hasExplicitOperations || (!hasProductManager && isShortSegment && /(growth|增长)/i.test(lower))) {
    roles.push("运营");
  }

  if (/(sales|商务|销售|\bbd\b|business development)/i.test(lower)) {
    roles.push("销售");
  }

  if (/(consultant|advisor|顾问)/i.test(lower)) {
    roles.push("顾问");
  }

  if (/(teacher|lecturer|讲师|导师)/i.test(lower)) {
    roles.push("讲师");
  }

  if (/(student|中学生|学生)/i.test(lower)) {
    roles.push("学生");
  }

  if (/(creator|创作者|aigcer|podcaster|播客主|视频创作|内容创作)/i.test(lower)) {
    roles.push("创作者");
  }

  let hasSpecificEngineeringRole = false;

  if (/full[- ]?stack|全栈/i.test(lower)) {
    roles.push("全栈工程师");
    hasSpecificEngineeringRole = true;
  } else if (/backend|后端/i.test(lower)) {
    roles.push("后端工程师");
    hasSpecificEngineeringRole = true;
  } else if (/frontend|前端/i.test(lower)) {
    roles.push("前端工程师");
    hasSpecificEngineeringRole = true;
  }

  if (hasAiDomain && hasResearchSignal) {
    roles.push("AI研究员");
  } else if (hasExplicitResearcher) {
    roles.push("研究员");
  }

  if (!hasSpecificEngineeringRole && hasAiDomain && (hasEngineerSignal || (isShortSegment && hasDeveloperSignal))) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /独立开发者|indie hacker|independent developer/i.test(lower)) {
    roles.push("独立开发者");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && hasEngineerSignal) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && hasDeveloperSignal) {
    roles.push("开发者");
  }

  return Array.from(new Set(roles)).filter(
    (role) => role.length > 0 && Array.from(role).length <= ROLE_LABEL_MAX_LENGTH
  );
}

function extractRoles(person: Person, evidence: EvidenceItem[]): string[] {
  const roles: Set<string> = new Set();

  const signals: string[] = [];

  if (person.primaryHeadline) {
    signals.push(person.primaryHeadline);
  }

  if (person.summary) {
    signals.push(person.summary);
  }

  evidence.forEach((item) => {
    if (item.evidenceType === "profile_field") {
      const field = typeof item.metadata?.field === "string" ? item.metadata.field : undefined;
      if (field && RELEVANT_PROFILE_FIELDS.has(field) && item.description) {
        signals.push(item.description);
      }

      readStringArray(item.metadata?.roleSignals).forEach((signal) => signals.push(signal));
    }

    if (item.evidenceType === "job_signal" || item.evidenceType === "experience") {
      if (item.title) {
        signals.push(item.title);
      }
      if (item.description) {
        signals.push(item.description);
      }
    }
  });

  signals
    .flatMap((signal) => splitRoleSegments(signal))
    .forEach((segment) => {
      classifyRoleSegment(segment).forEach((role) => roles.add(role));
    });

  return Array.from(roles);
}

function extractLocations(person: Person, evidence: EvidenceItem[]): string[] {
  const locations: Set<string> = new Set();

  if (person.primaryLocation) {
    // Add full path
    locations.add(person.primaryLocation.toLowerCase());

    // Split and add each segment: "中国 / 浙江省 / 杭州市" -> ["中国", "浙江省", "杭州市"]
    const parts = person.primaryLocation.split("/").map((s) => s.trim()).filter(Boolean);
    parts.forEach((part) => locations.add(part.toLowerCase()));

    // Add normalized short names: "浙江省" -> "浙江", "杭州市" -> "杭州"
    parts.forEach((part) => {
      // Remove 省/市/区/县 suffix
      const normalized = part.replace(/(省|市|区|县|自治区|特别行政区)$/, "");
      if (normalized && normalized !== part) {
        locations.add(normalized.toLowerCase());
      }
    });
  }

  // From evidence metadata (location field)
  evidence.forEach((e) => {
    const loc = e.metadata?.location as string | undefined;
    if (loc) locations.add(loc.toLowerCase());
  });

  return Array.from(locations);
}

function extractSources(evidence: EvidenceItem[], sourceHints: string[] = []): string[] {
  const sources: Set<string> = new Set(sourceHints.map((value) => value.toLowerCase()));
  evidence.forEach(e => {
    if (e.source) sources.add(e.source);
  });
  return Array.from(sources);
}

// Tech keywords for tag extraction
const TECH_KEYWORDS = [
  "python", "javascript", "typescript", "rust", "go", "java", "kotlin", "swift",
  "machine learning", "ai", "deep learning", "nlp", "rag", "llm", "gpt", "transformer",
  "react", "vue", "angular", "svelte", "node", "next.js", "django", "flask",
  "docker", "kubernetes", "aws", "gcp", "azure", "tensorflow", "pytorch", "cuda"
];

function extractTags(person: Person, evidence: EvidenceItem[]): string[] {
  const tags: Set<string> = new Set();

  const allText = [
    person.primaryHeadline,
    person.summary,
    ...evidence.map(e => `${e.title ?? ""} ${e.description ?? ""}`)
  ].join(" ").toLowerCase();

  TECH_KEYWORDS.forEach(kw => {
    if (allText.includes(kw)) tags.add(kw);
  });

  // From repository language
  evidence
    .filter(e => e.evidenceType === "repository")
    .forEach(e => {
      const lang = e.metadata?.language as string | undefined;
      if (lang) tags.add(lang.toLowerCase());
    });

  return Array.from(tags);
}

function computeRankFeatures(person: Person, evidence: EvidenceItem[]): RankFeatures {
  const now = Date.now();
  const updatedAt = person.updatedAt ? new Date(person.updatedAt).getTime() : now;
  const freshness = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)); // Days

  return {
    evidenceCount: evidence.length,
    projectCount: evidence.filter(e => e.evidenceType === "project").length,
    repoCount: evidence.filter(e => e.evidenceType === "repository").length,
    followerCount: 0, // Will be extracted from metadata when available
    freshness
  };
}

export async function buildAllSearchDocuments(
  persons: Person[],
  evidenceByPerson: Map<string, EvidenceItem[]>,
  sourceHintsByPerson: Map<string, string[]> = new Map()
): Promise<NewSearchDocument[]> {
  return persons.map(person => {
    const evidence = evidenceByPerson.get(person.id) ?? [];
    const sourceHints = sourceHintsByPerson.get(person.id) ?? [];
    return buildSearchDocument({ person, evidence, sourceHints });
  });
}
