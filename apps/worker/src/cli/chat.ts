import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import enquirer from "enquirer";
import chalk from "chalk";
import type { Ora } from "ora";
const { Input } = enquirer as unknown as { Input: any };
import { SearchCandidateAnchor, SearchConditions, MissingField } from "./types.js";
import { ConditionsSchema, sanitizeForPrompt, safeParseJSON, isEmptyInput, dedupeArray } from "./schemas.js";
import { CLI_CONFIG } from "./config.js";
import { withRetry } from "./retry.js";

// Skip keywords that indicate user wants to skip the question
const SKIP_KEYWORDS = new Set(["不限", "随便", "无", "none", "skip", "跳过", "都可以", "都行"]);

function createEmptyConditions(): SearchConditions {
  return {
    skills: [],
    locations: [],
    experience: undefined,
    role: undefined,
    sourceBias: undefined,
    mustHave: [],
    niceToHave: [],
    exclude: [],
    preferFresh: false,
    candidateAnchor: undefined,
    limit: CLI_CONFIG.ui.defaultLimit
  };
}

function normalizeCandidateAnchor(
  anchor:
    | SearchCandidateAnchor
    | {
        shortlistIndex?: number | null | undefined;
        personId?: string | null | undefined;
        name?: string | null | undefined;
      }
    | null
    | undefined
): SearchCandidateAnchor | undefined {
  if (!anchor) {
    return undefined;
  }

  const normalized: SearchCandidateAnchor = {
    shortlistIndex:
      typeof anchor.shortlistIndex === "number" && anchor.shortlistIndex > 0
        ? anchor.shortlistIndex
        : undefined,
    personId: anchor.personId?.trim() || undefined,
    name: anchor.name?.trim() || undefined
  };

  return normalized.shortlistIndex || normalized.personId || normalized.name
    ? normalized
    : undefined;
}

interface RefineContextCandidate {
  shortlistIndex: number;
  personId?: string;
  name: string;
  headline?: string | null;
  location?: string | null;
  sources?: string[];
  matchReason?: string;
  summary?: string;
}

interface ReviseConditionsContext {
  shortlist?: RefineContextCandidate[];
}

function serializeReviseContext(context?: ReviseConditionsContext): string {
  if (!context?.shortlist || context.shortlist.length === 0) {
    return "No shortlist context.";
  }

  return context.shortlist
    .map((candidate) =>
      [
        `#${candidate.shortlistIndex} ${candidate.name}`,
        candidate.headline ? `headline=${candidate.headline}` : "",
        candidate.location ? `location=${candidate.location}` : "",
        candidate.sources && candidate.sources.length > 0 ? `source=${candidate.sources.join("/")}` : "",
        candidate.matchReason ? `why=${candidate.matchReason}` : "",
        candidate.summary ? `summary=${candidate.summary}` : ""
      ]
        .filter(Boolean)
        .join(" | ")
    )
    .join("\n");
}

function resolveAnchorFromShortlistContext(
  anchor: SearchCandidateAnchor | undefined,
  context?: ReviseConditionsContext
): SearchCandidateAnchor | undefined {
  const normalized = normalizeCandidateAnchor(anchor);
  if (!normalized) {
    return undefined;
  }

  const shortlist = context?.shortlist ?? [];
  const byIndex = typeof normalized.shortlistIndex === "number"
    ? shortlist.find((candidate) => candidate.shortlistIndex === normalized.shortlistIndex)
    : undefined;
  const byName = normalized.name
    ? shortlist.find((candidate) => candidate.name.toLowerCase() === normalized.name?.toLowerCase())
    : undefined;
  const match = byIndex || byName;

  if (!match) {
    return normalized;
  }

  return {
    shortlistIndex: normalized.shortlistIndex ?? match.shortlistIndex,
    personId: normalized.personId ?? match.personId,
    name: normalized.name ?? match.name
  };
}

export class ChatInterface {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): ChatInterface {
    return new ChatInterface(SiliconFlowProvider.fromEnv());
  }

  async extractConditions(input: string): Promise<Partial<SearchConditions>> {
    // ISSUE-001: Block empty input early
    if (isEmptyInput(input)) {
      return createEmptyConditions();
    }

    // Sanitize user input to prevent prompt injection
    const safeInput = sanitizeForPrompt(input, "userQuery");

    const prompt = `
Extract structured search conditions from the user query below.

${safeInput}

Return ONLY a JSON object with this exact schema:
{
  "skills": string[],     // Technology keywords extracted from query
  "locations": string[],  // Location names mentioned
  "experience": string | null,  // e.g., "5年", "senior", "3-5年"
  "role": string | null,        // e.g., "AI工程师", "后端开发"
  "sourceBias": "bonjour" | "github" | null,
  "mustHave": string[],         // Hard requirements explicitly mentioned
  "niceToHave": string[],       // Preferred but optional requirements
  "exclude": string[],          // Things user explicitly does not want
  "preferFresh": boolean | null, // True if user prefers recent / active profiles
  "candidateAnchor": {
    "shortlistIndex": number | null,
    "personId": string | null,
    "name": string | null
  } | null,
  "limit": number | null
}

CRITICAL RULES:
1. Return ONLY the JSON object, no markdown, no explanation
2. If a field is not mentioned, use empty array or null
3. Do NOT include any text outside the JSON object
4. For experience: extract years (e.g., "5年以上", "3-5年") or seniority level (e.g., "senior", "高级")
5. For role: extract job title or role description
6. mustHave is for explicit hard constraints like "必须", "一定要", "must have"
7. niceToHave is for preferences like "最好", "优先", "prefer"
8. exclude is for explicit negatives like "不要销售", "排除外包"
9. preferFresh should be true for phrases like "最近活跃", "最新", "fresh", "recent"
10. candidateAnchor is usually null unless the user explicitly refers to an existing candidate by id/name
`;

    try {
      const response = await withRetry(
        async () => {
          // P2: Create fresh AbortController and timeout for EACH retry attempt
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CLI_CONFIG.llm.timeoutMs);
          
          try {
            return await this.llm.chat([
              { role: "system", content: "You are a precise data extraction engine. You output only valid JSON." },
              { role: "user", content: prompt }
            ], { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
        },
        { maxRetries: CLI_CONFIG.llm.maxRetries }
      );

      const result = safeParseJSON(
        response.content,
        ConditionsSchema,
        createEmptyConditions()
      );

      if (!result.success) {
        console.warn("LLM condition extraction validation failed:", result.error);
      }

      return {
        skills: result.data.skills ?? [],
        locations: result.data.locations ?? [],
        experience: result.data.experience ?? undefined,
        role: result.data.role ?? undefined,
        sourceBias: result.data.sourceBias ?? undefined,
        mustHave: dedupeArray(result.data.mustHave ?? []),
        niceToHave: dedupeArray(result.data.niceToHave ?? []),
        exclude: dedupeArray(result.data.exclude ?? []),
        preferFresh: Boolean(result.data.preferFresh),
        candidateAnchor: normalizeCandidateAnchor(result.data.candidateAnchor),
        limit: result.data.limit ?? CLI_CONFIG.ui.defaultLimit
      };
    } catch (e) {
      console.warn("Failed to extract exact conditions:", e instanceof Error ? e.message : String(e));
      return this.extractConditionsHeuristically(input);
    }
  }

  detectMissing(conditions: Partial<SearchConditions>): MissingField[] {
    const missing: MissingField[] = [];
    if (!conditions.skills || conditions.skills.length === 0) missing.push("skills");
    if (!conditions.locations || conditions.locations.length === 0) missing.push("locations");
    if (!conditions.experience) missing.push("experience");
    return missing;
  }

  async askInitial(): Promise<string> {
    while (true) {
      const promptBuffer = new Input({
        message: `🔎 ${chalk.bold("请描述你想找的人才")} ${chalk.dim("(例如: 3年经验的AI工程师, 在北京, 会CUDA)")}`,
        initial: ""
      });

      const result = await promptBuffer.run();
      const trimmed = result.trim();
      
      if (trimmed) {
        return trimmed;
      }
      
      console.log(chalk.yellow("⚠️ 请输入有效的搜索条件"));
    }
  }

  async askFollowUp(field: MissingField): Promise<string> {
    const questions: Record<MissingField, string> = {
      skills: "🔍 还想补充哪些核心技能或关键词？(例如: vLLM, PyTorch)",
      locations: "📍 地点有要求吗？(例如: 杭州, 远程, 按 Enter 跳过)",
      experience: "⏱ 对工作年限或职级有要求吗？(按 Enter 跳过)"
    };

    const promptBuffer = new Input({
      message: questions[field],
      initial: ""
    });

    // P1: Handle user input timeout
    const INPUT_TIMEOUT_MS = CLI_CONFIG.ui.inputTimeoutMs;
    
    let timeoutId: NodeJS.Timeout | undefined;
    const promptPromise = promptBuffer.run();
    try {
      const result = await Promise.race([
        promptPromise,
        new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Input timeout")), INPUT_TIMEOUT_MS);
        })
      ]);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "Input timeout") {
        await Promise.resolve(promptBuffer.cancel?.(error)).catch(() => undefined);
        await promptPromise.catch(() => undefined);
        console.warn(chalk.yellow(`\n⚠️  Input timed out after ${INPUT_TIMEOUT_MS / 1000}s. Proceeding...`));
        return "";
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async askFreeform(message: string, initial = ""): Promise<string> {
    const promptBuffer = new Input({
      message,
      initial
    });

    const result = await promptBuffer.run();
    return result.trim();
  }

  /**
   * Check if the answer indicates user wants to skip
   */
  private shouldSkipAnswer(answer: string): boolean {
    if (isEmptyInput(answer)) return true;
    const normalized = answer.trim().toLowerCase();
    return SKIP_KEYWORDS.has(normalized);
  }

  async refineConditions(initialInput: string, spinner?: Ora): Promise<SearchConditions> {
    if (isEmptyInput(initialInput)) {
      return createEmptyConditions();
    }

    let conditions = await this.extractConditions(initialInput);

    // Filter missing fields: only ask for what's NOT already in the results
    const missing = this.detectMissing(conditions);
    const askedFields = new Set<MissingField>();
    
    for (const field of missing) {
      if (askedFields.has(field)) continue;
      askedFields.add(field);

      if (spinner) spinner.stop();
      const answer = await this.askFollowUp(field);
      
      if (this.shouldSkipAnswer(answer)) {
        if (field === "locations") conditions.locations = [];
        if (field === "skills") conditions.skills = [];
        if (field === "experience") conditions.experience = undefined;
        continue;
      }

      if (spinner) spinner.start(`Extracting additional requirements for ${field}...`);
      const extra = await this.extractConditions(answer);

      conditions = {
        ...conditions,
        skills: dedupeArray([...(conditions.skills || []), ...(extra.skills || [])]),
        locations: dedupeArray([...(conditions.locations || []), ...(extra.locations || [])]),
        experience: extra.experience || conditions.experience,
        role: extra.role || conditions.role,
        sourceBias: extra.sourceBias || conditions.sourceBias,
        mustHave: dedupeArray([...(conditions.mustHave || []), ...(extra.mustHave || [])]),
        niceToHave: dedupeArray([...(conditions.niceToHave || []), ...(extra.niceToHave || [])]),
        exclude: dedupeArray([...(conditions.exclude || []), ...(extra.exclude || [])]),
        preferFresh: Boolean(conditions.preferFresh || extra.preferFresh),
        candidateAnchor: extra.candidateAnchor || conditions.candidateAnchor
      };
    }

    return {
      skills: dedupeArray(conditions.skills || []),
      locations: dedupeArray(conditions.locations || []),
      experience: conditions.experience || undefined,
      role: conditions.role || undefined,
      sourceBias: conditions.sourceBias || undefined,
      mustHave: dedupeArray(conditions.mustHave || []),
      niceToHave: dedupeArray(conditions.niceToHave || []),
      exclude: dedupeArray(conditions.exclude || []),
      preferFresh: Boolean(conditions.preferFresh),
      candidateAnchor: conditions.candidateAnchor || undefined,
      limit: conditions.limit || CLI_CONFIG.ui.defaultLimit
    };
  }

  async reviseConditions(
    current: SearchConditions,
    instruction: string,
    mode: "tighten" | "relax" | "edit" = "edit",
    context?: ReviseConditionsContext
  ): Promise<SearchConditions> {
    if (isEmptyInput(instruction)) {
      return current;
    }

    const safeInstruction = sanitizeForPrompt(instruction, "userInstruction");
    const safeCurrent = sanitizeForPrompt(JSON.stringify(current), "currentConditions");
    const safeContext = sanitizeForPrompt(serializeReviseContext(context), "shortlistContext");

    const prompt = `
You are updating a structured recruiting search brief for a CLI product.

Current conditions:
${safeCurrent}

Current shortlist context:
${safeContext}

User instruction:
${safeInstruction}

Update mode: ${mode}

Return ONLY a JSON object with this exact schema:
{
  "skills": string[],
  "locations": string[],
  "experience": string | null,
  "role": string | null,
  "sourceBias": "bonjour" | "github" | null,
  "mustHave": string[],
  "niceToHave": string[],
  "exclude": string[],
  "preferFresh": boolean | null,
  "candidateAnchor": {
    "shortlistIndex": number | null,
    "personId": string | null,
    "name": string | null
  } | null,
  "limit": number | null
}

RULES:
1. Always return the full updated condition object.
2. In "tighten" mode, preserve existing constraints unless the user explicitly replaces them.
3. In "relax" mode, broaden or remove constraints the user asks to loosen.
4. Keep the output concise and normalized.
5. exclude is for explicit negatives such as "去掉销售", "不要外包", "排除猎头".
6. preferFresh should be true when the user says to prioritize recent / active profiles.
7. If the user references a shortlist candidate like "像 2 号", set candidateAnchor using shortlistContext.
8. For phrases like "像 2 号但更偏后端", keep candidateAnchor and add the delta preference into role / mustHave / niceToHave.
9. candidateAnchor should stay null unless the user is clearly referring to an existing chosen candidate.
10. Return JSON only.
`;

    try {
      const response = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CLI_CONFIG.llm.timeoutMs);

          try {
            return await this.llm.chat([
              { role: "system", content: "You update recruiting search conditions and output only valid JSON." },
              { role: "user", content: prompt }
            ], { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
        },
        { maxRetries: CLI_CONFIG.llm.maxRetries }
      );

      const result = safeParseJSON(
        response.content,
        ConditionsSchema,
        {
          skills: current.skills,
          locations: current.locations,
          experience: current.experience,
          role: current.role,
          sourceBias: current.sourceBias,
          mustHave: current.mustHave,
          niceToHave: current.niceToHave,
          exclude: current.exclude,
          preferFresh: current.preferFresh,
          candidateAnchor: current.candidateAnchor,
          limit: current.limit
        }
      );

      const updated = {
        skills: dedupeArray(result.data.skills ?? current.skills),
        locations: dedupeArray(result.data.locations ?? current.locations),
        experience: result.data.experience ?? undefined,
        role: result.data.role ?? undefined,
        sourceBias: result.data.sourceBias ?? current.sourceBias,
        mustHave: dedupeArray(result.data.mustHave ?? current.mustHave),
        niceToHave: dedupeArray(result.data.niceToHave ?? current.niceToHave),
        exclude: dedupeArray(result.data.exclude ?? current.exclude),
        preferFresh: result.data.preferFresh ?? current.preferFresh,
        candidateAnchor:
          resolveAnchorFromShortlistContext(
            normalizeCandidateAnchor(result.data.candidateAnchor) ?? current.candidateAnchor,
            context
          ) ?? current.candidateAnchor,
        limit: result.data.limit || current.limit || CLI_CONFIG.ui.defaultLimit
      };
      return this.preserveConditionsForRelax(current, updated, instruction, mode);
    } catch (error) {
      console.warn("Failed to revise conditions:", error instanceof Error ? error.message : String(error));
      return this.reviseConditionsHeuristically(current, instruction, mode, context);
    }
  }

  private extractConditionsHeuristically(
    input: string,
    context?: ReviseConditionsContext
  ): Partial<SearchConditions> {
    const normalized = input.toLowerCase();
    const skills: string[] = [];
    const locations: string[] = [];
    const mustHave: string[] = [];
    const niceToHave: string[] = [];
    const exclude: string[] = [];
    let role: string | undefined;
    let experience: string | undefined;
    let sourceBias: SearchConditions["sourceBias"];
    let preferFresh = false;

    const knownSkills = ["python", "java", "go", "rust", "typescript", "javascript", "pytorch", "tensorflow", "rag", "llm", "cuda", "vllm"];
    const knownLocations = ["杭州", "上海", "北京", "深圳", "广州", "remote", "远程", "hangzhou", "shanghai", "beijing", "shenzhen", "guangzhou"];
    const roleHints = ["后端", "前端", "python工程师", "工程师", "researcher", "engineer", "backend", "frontend"];

    for (const skill of knownSkills) {
      if (normalized.includes(skill)) {
        skills.push(skill);
      }
    }

    for (const location of knownLocations) {
      if (input.includes(location) || normalized.includes(location)) {
        locations.push(location);
      }
    }

    role = roleHints.find((item) => input.includes(item) || normalized.includes(item));

    const experienceMatch = input.match(/(\d+\s*年(?:以上)?)/);
    if (experienceMatch?.[1]) {
      experience = experienceMatch[1];
    } else if (input.includes("资深") || normalized.includes("senior")) {
      experience = "资深";
    }

    if (normalized.includes("bonjour")) {
      sourceBias = "bonjour";
    } else if (normalized.includes("github")) {
      sourceBias = "github";
    }

    const mustHavePatterns = [
      /必须会?([^，。；;\n]+)/g,
      /一定要([^，。；;\n]+)/g,
      /must have ([^,.;]+)/g,
      /required ([^,.;]+)/g
    ];

    for (const pattern of mustHavePatterns) {
      for (const match of normalized.matchAll(pattern)) {
        const value = match[1]?.trim();
        if (value) {
          mustHave.push(value);
        }
      }
    }

    const niceToHavePatterns = [
      /最好([^，。；;\n]+)/g,
      /优先([^，。；;\n]+)/g,
      /加分项?[：: ]?([^，。；;\n]+)/g,
      /prefer ([^,.;]+)/g
    ];

    for (const pattern of niceToHavePatterns) {
      for (const match of normalized.matchAll(pattern)) {
        const value = match[1]?.trim();
        if (value) {
          niceToHave.push(value);
        }
      }
    }

    const excludePatterns = [
      /不要([^，。；;\n]+)/g,
      /排除([^，。；;\n]+)/g,
      /去掉([^，。；;\n]+)/g,
      /exclude ([^,.;]+)/g,
      /without ([^,.;]+)/g
    ];

    for (const pattern of excludePatterns) {
      for (const match of normalized.matchAll(pattern)) {
        const value = match[1]?.trim();
        if (value) {
          exclude.push(value);
        }
      }
    }

    if (/最近|近期|活跃|最新|fresh|recent|active/.test(normalized)) {
      preferFresh = true;
    }

    const candidateAnchorMatch = input.match(/(?:像|参考|类似)\s*(\d+)\s*号/);
    const anchorByIndex = candidateAnchorMatch?.[1]
      ? { shortlistIndex: Number(candidateAnchorMatch[1]) }
      : undefined;
    const anchorByName = context?.shortlist?.find((candidate) =>
      normalized.includes(candidate.name.toLowerCase())
    );
    const candidateAnchor = resolveAnchorFromShortlistContext(
      anchorByIndex || (anchorByName
        ? {
            shortlistIndex: anchorByName.shortlistIndex,
            personId: anchorByName.personId,
            name: anchorByName.name
          }
        : undefined),
      context
    );

    return {
      skills: dedupeArray(skills),
      locations: dedupeArray(locations),
      experience,
      role,
      sourceBias,
      mustHave: dedupeArray(mustHave),
      niceToHave: dedupeArray(niceToHave),
      exclude: dedupeArray(exclude),
      preferFresh,
      candidateAnchor,
      limit: CLI_CONFIG.ui.defaultLimit
    };
  }

  private reviseConditionsHeuristically(
    current: SearchConditions,
    instruction: string,
    mode: "tighten" | "relax" | "edit",
    context?: ReviseConditionsContext
  ): SearchConditions {
    const normalized = instruction.toLowerCase();
    const next: SearchConditions = {
      ...current,
      skills: [...current.skills],
      locations: [...current.locations],
      mustHave: [...current.mustHave],
      niceToHave: [...current.niceToHave],
      exclude: [...current.exclude]
    };

    if (normalized.includes("bonjour")) {
      next.sourceBias = "bonjour";
    }
    if (normalized.includes("github")) {
      next.sourceBias = "github";
    }

    const extracted = this.extractConditionsHeuristically(instruction, context);

    if (mode === "tighten") {
      next.skills = dedupeArray([...next.skills, ...(extracted.skills || [])]);
      next.locations = dedupeArray([...next.locations, ...(extracted.locations || [])]);
      next.mustHave = dedupeArray([...next.mustHave, ...(extracted.mustHave || [])]);
      next.niceToHave = dedupeArray([...next.niceToHave, ...(extracted.niceToHave || [])]);
      next.exclude = dedupeArray([...next.exclude, ...(extracted.exclude || [])]);
      next.role = extracted.role || next.role;
      next.experience = extracted.experience || next.experience;
      next.sourceBias = extracted.sourceBias || next.sourceBias;
      next.preferFresh = Boolean(next.preferFresh || extracted.preferFresh);
      next.candidateAnchor = extracted.candidateAnchor || next.candidateAnchor;
      return next;
    }

    const asksToRelax = mode === "relax" || /放宽|宽一点|不限|都可以|随便|几个人选|先给我看看/.test(instruction);
    if (asksToRelax) {
      if (/地点|城市|remote|远程|杭州|上海|北京|深圳|广州/.test(instruction)) {
        next.locations = extracted.locations && extracted.locations.length > 0 ? dedupeArray(extracted.locations) : [];
      }

      if (/经验|年限|资深|senior|junior/.test(instruction)) {
        next.experience = extracted.experience;
      }

      if (/技术|技术栈|关键词|python|java|go|rust|vllm|cuda|llm|rag/.test(normalized)) {
        next.skills = extracted.skills && extracted.skills.length > 0 ? dedupeArray(extracted.skills) : [];
      }

      if (/角色|后端|前端|工程师|researcher|engineer|backend|frontend/.test(instruction)) {
        next.role = extracted.role;
      }

      if (/放宽要求|给我提供几个|先给我几个/.test(instruction)) {
        next.experience = undefined;
      }

      if (extracted.mustHave && extracted.mustHave.length > 0) {
        next.mustHave = dedupeArray([...next.mustHave, ...extracted.mustHave]);
      }

      if (extracted.niceToHave && extracted.niceToHave.length > 0) {
        next.niceToHave = dedupeArray([...next.niceToHave, ...extracted.niceToHave]);
      }

      if (extracted.exclude && extracted.exclude.length > 0) {
        next.exclude = dedupeArray([...next.exclude, ...extracted.exclude]);
      }

      if (/最近|活跃|最新|fresh|recent/.test(normalized)) {
        next.preferFresh = Boolean(extracted.preferFresh);
      }

      next.candidateAnchor = extracted.candidateAnchor || next.candidateAnchor;

      return next;
    }

    next.skills = extracted.skills && extracted.skills.length > 0 ? dedupeArray(extracted.skills) : next.skills;
    next.locations = extracted.locations && extracted.locations.length > 0 ? dedupeArray(extracted.locations) : next.locations;
    next.mustHave = extracted.mustHave && extracted.mustHave.length > 0 ? dedupeArray([...next.mustHave, ...extracted.mustHave]) : next.mustHave;
    next.niceToHave = extracted.niceToHave && extracted.niceToHave.length > 0 ? dedupeArray([...next.niceToHave, ...extracted.niceToHave]) : next.niceToHave;
    next.exclude = extracted.exclude && extracted.exclude.length > 0 ? dedupeArray([...next.exclude, ...extracted.exclude]) : next.exclude;
    next.role = extracted.role || next.role;
    next.experience = extracted.experience || next.experience;
    next.sourceBias = extracted.sourceBias || next.sourceBias;
    next.preferFresh = Boolean(next.preferFresh || extracted.preferFresh);
    next.candidateAnchor = extracted.candidateAnchor || next.candidateAnchor;
    return next;
  }

  private preserveConditionsForRelax(
    current: SearchConditions,
    updated: SearchConditions,
    instruction: string,
    mode: "tighten" | "relax" | "edit"
  ): SearchConditions {
    const normalized = instruction.toLowerCase();
    const broadRelax = /放宽要求|放宽一点|给我几个|提供几个|先给我几个|先给我看看|宽一点/.test(normalized);
    const keepLocations = !/地点|城市|杭州|上海|北京|深圳|广州|远程|remote|改成|换成|放宽到/.test(normalized);
    const keepSkills = !/技术|技术栈|关键词|python|java|go|rust|vllm|cuda|llm|rag|不要技能|去掉技能/.test(normalized);
    const keepRole = !/角色|岗位|后端|前端|工程师|researcher|engineer|backend|frontend|改成/.test(normalized);
    const keepExperience = !/经验|年限|资深|senior|junior|不限经验|去掉经验/.test(normalized);
    const keepMustHave = !/必须|一定要|must have|required/.test(normalized);
    const keepNiceToHave = !/最好|优先|加分|prefer/.test(normalized);
    const keepExclude = !/不要|排除|去掉|exclude|without/.test(normalized);
    const keepPreferFresh = !/最近|近期|活跃|最新|fresh|recent/.test(normalized);

    if (mode === "relax" || broadRelax) {
      return {
        ...updated,
        locations: updated.locations.length > 0 || !keepLocations ? updated.locations : current.locations,
        skills: updated.skills.length > 0 || !keepSkills ? updated.skills : current.skills,
        role: updated.role || !keepRole ? updated.role : current.role,
        experience: broadRelax ? updated.experience : (updated.experience || !keepExperience ? updated.experience : current.experience),
        sourceBias: updated.sourceBias || current.sourceBias,
        mustHave: updated.mustHave.length > 0 || !keepMustHave ? updated.mustHave : current.mustHave,
        niceToHave: updated.niceToHave.length > 0 || !keepNiceToHave ? updated.niceToHave : current.niceToHave,
        exclude: updated.exclude.length > 0 || !keepExclude ? updated.exclude : current.exclude,
        preferFresh: !keepPreferFresh ? updated.preferFresh : current.preferFresh,
        candidateAnchor: updated.candidateAnchor || current.candidateAnchor
      };
    }

    return updated;
  }
}
