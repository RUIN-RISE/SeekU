import type { Person, EvidenceItem, NewSearchDocument, RankFeatures } from "@seeku/db";

export interface SearchDocumentInput {
  person: Person;
  evidence: EvidenceItem[];
}

export function buildSearchDocument(input: SearchDocumentInput): NewSearchDocument {
  const { person, evidence } = input;

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
  const facetSource = extractSources(evidence);
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

function extractRoles(person: Person, evidence: EvidenceItem[]): string[] {
  const roles: Set<string> = new Set();

  // From headline (e.g., "AI Engineer @ Startup" -> "AI Engineer")
  if (person.primaryHeadline) {
    const headlineRoles = person.primaryHeadline
      .split(/[,@]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 50);
    headlineRoles.forEach(r => roles.add(r.toLowerCase()));
  }

  // From evidence (job signals, experience)
  evidence
    .filter(e => e.evidenceType === "job_signal" || e.evidenceType === "experience")
    .forEach(e => {
      if (e.title) roles.add(e.title.toLowerCase());
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

function extractSources(evidence: EvidenceItem[]): string[] {
  const sources: Set<string> = new Set();
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
  evidenceByPerson: Map<string, EvidenceItem[]>
): Promise<NewSearchDocument[]> {
  return persons.map(person => {
    const evidence = evidenceByPerson.get(person.id) ?? [];
    return buildSearchDocument({ person, evidence });
  });
}