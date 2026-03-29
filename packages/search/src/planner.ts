import type { ChatMessage, LLMProvider } from "@seeku/llm";

export interface QueryIntent {
  rawQuery: string;
  roles: string[];
  skills: string[];
  locations: string[];
  experienceLevel?: string;
  sourceBias?: string;
  mustHaves: string[];
  niceToHaves: string[];
}

export interface QueryPlannerConfig {
  provider: LLMProvider;
  model?: string;
}

const QUERY_PLANNER_PROMPT = `You are a query parser for Seeku, an AI talent search engine.
Parse the user's request into structured search intent.

Return ONLY a compact JSON object with these fields:
{
  "roles": string[],
  "skills": string[],
  "locations": string[],
  "experienceLevel": string | null,
  "sourceBias": string | null,
  "mustHaves": string[],
  "niceToHaves": string[]
}

Rules:
- Normalize values to lowercase.
- Roles are titles or functions.
- Skills are technologies, domains, or methods.
- Locations are cities, countries, or regions.
- sourceBias is only a source preference explicitly mentioned by the user.
- Put hard requirements in mustHaves and preferences in niceToHaves.
- If something is not clearly present, return an empty array or null.`;

const EXPERIENCE_HINTS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "lead",
  "principal",
  "founder"
] as const;

const SOURCE_HINTS = ["github", "bonjour"] as const;

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values)]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractQuotedTerms(query: string): string[] {
  return [...query.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

function heuristicIntent(query: string): QueryIntent {
  const normalized = query.toLowerCase();
  const mustHaves = new Set<string>();
  const niceToHaves = new Set<string>();
  const skills = new Set<string>();
  const roles = new Set<string>();
  const locations = new Set<string>();

  for (const term of extractQuotedTerms(query)) {
    mustHaves.add(term);
  }

  const mustHavePatterns = [
    /must have ([^,.;]+)/gi,
    /required ([^,.;]+)/gi,
    /need ([^,.;]+)/gi,
    /with ([^,.;]+) experience/gi
  ];

  for (const pattern of mustHavePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (value) {
        mustHaves.add(value);
      }
    }
  }

  const niceToHavePatterns = [/nice to have ([^,.;]+)/gi, /prefer ([^,.;]+)/gi];

  for (const pattern of niceToHavePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (value) {
        niceToHaves.add(value);
      }
    }
  }

  const roleHints = [
    "engineer",
    "researcher",
    "scientist",
    "founder",
    "cto",
    "product",
    "designer",
    "manager"
  ];
  const skillHints = [
    "python",
    "typescript",
    "javascript",
    "rust",
    "go",
    "java",
    "pytorch",
    "tensorflow",
    "machine learning",
    "deep learning",
    "rag",
    "llm",
    "nlp",
    "agent",
    "ai"
  ];

  for (const role of roleHints) {
    if (normalized.includes(role)) {
      roles.add(role);
    }
  }

  for (const skill of skillHints) {
    if (normalized.includes(skill)) {
      skills.add(skill);
    }
  }

  for (const source of SOURCE_HINTS) {
    if (normalized.includes(source)) {
      mustHaves.add(source);
    }
  }

  const locationMatches = normalized.match(
    /\b(beijing|shanghai|shenzhen|hangzhou|guangzhou|china|singapore|remote)\b/g
  );
  for (const location of locationMatches ?? []) {
    locations.add(location);
  }

  const experienceLevel = EXPERIENCE_HINTS.find((value) => normalized.includes(value));
  const sourceBias = SOURCE_HINTS.find((value) => normalized.includes(value));

  return {
    rawQuery: query,
    roles: [...roles],
    skills: [...skills],
    locations: [...locations],
    experienceLevel,
    sourceBias,
    mustHaves: [...mustHaves],
    niceToHaves: [...niceToHaves]
  };
}

function sanitizeIntent(query: string, parsed: Record<string, unknown> | null): QueryIntent {
  if (!parsed) {
    return heuristicIntent(query);
  }

  return {
    rawQuery: query,
    roles: normalizeList(parsed.roles),
    skills: normalizeList(parsed.skills),
    locations: normalizeList(parsed.locations),
    experienceLevel:
      typeof parsed.experienceLevel === "string" ? parsed.experienceLevel.toLowerCase() : undefined,
    sourceBias: typeof parsed.sourceBias === "string" ? parsed.sourceBias.toLowerCase() : undefined,
    mustHaves: normalizeList(parsed.mustHaves),
    niceToHaves: normalizeList(parsed.niceToHaves)
  };
}

export class QueryPlanner {
  private readonly provider: LLMProvider;
  private readonly model?: string;

  constructor(config: QueryPlannerConfig) {
    this.provider = config.provider;
    this.model = config.model;
  }

  async parse(query: string): Promise<QueryIntent> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        rawQuery: "",
        roles: [],
        skills: [],
        locations: [],
        mustHaves: [],
        niceToHaves: []
      };
    }

    const messages: ChatMessage[] = [
      { role: "system", content: QUERY_PLANNER_PROMPT },
      { role: "user", content: trimmedQuery }
    ];

    try {
      const response = await this.provider.chat(messages, {
        model: this.model,
        temperature: 0
      });

      return sanitizeIntent(trimmedQuery, parseJsonObject(response.content));
    } catch {
      return heuristicIntent(trimmedQuery);
    }
  }
}

export async function parseQuery(
  provider: LLMProvider,
  query: string,
  config: Omit<Partial<QueryPlannerConfig>, "provider"> = {}
): Promise<QueryIntent> {
  const planner = new QueryPlanner({
    provider,
    ...config
  });

  return planner.parse(query);
}
