import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface HandleRecord {
  handle: string;
  name?: string | null;
  occurrences?: number;
  sourceKinds?: string[];
}

interface FreshSeedCandidate {
  handle: string;
  name: string | null;
  occurrences: number;
  sourceKinds: string[];
  freshSourceCount: number;
  historySourceCount: number;
}

interface FreshSeedScoreBreakdown {
  occurrences: number;
  freshInput: number;
  repeatedFresh: number;
  hasName: number;
  conversation: number;
  importSignal: number;
  visibleTimeline: number;
  keyword: number;
  multiSignal: number;
}

interface RankedFreshSeedCandidate extends FreshSeedCandidate {
  score: number;
  scoreBreakdown: FreshSeedScoreBreakdown;
}

interface BuildBonjourFreshAuthSeedsOptions {
  freshInputPaths: string[];
  historyInputPaths: string[];
  excludePaths: string[];
  outputPath?: string;
  limit: number;
  skip: number;
  minOccurrences: number;
  excludePurePostLike: boolean;
  requireProfileName: boolean;
  requiredSourceKinds: string[];
  excludedSourceKinds: string[];
  keywords: string[];
  help: boolean;
}

interface BuildBonjourFreshAuthSeedsSummary {
  freshInputCount: number;
  historyInputCount: number;
  mergedUniqueCount: number;
  excludedCount: number;
  candidateCount: number;
  outputCount: number;
  limit: number;
  skip: number;
  minOccurrences: number;
  keywords: string[];
  outputPath: string;
}

export const BUILD_BONJOUR_FRESH_AUTH_SEEDS_HELP_TEXT = `Seeku build-bonjour-fresh-auth-seeds

Usage:
  seeku build-bonjour-fresh-auth-seeds [options]

Behavior:
  - Merge one or more recent ("fresh") Bonjour candidate sources.
  - Optionally merge older supporting sources without giving them the same freshness bonus.
  - Score candidates toward a small auth-probe seed set.
  - Exclude already-consumed seed/import files before probing.

Options:
  --fresh-input <path>         Repeatable fresh candidate source file
  --history-input <path>       Repeatable older supporting source file
  --exclude <path>             Repeatable exclude-handle file
  --output <path>              Output JSON path
  --limit <number>             Max output handles. Default: 50
  --skip <number>              Skip the first N ranked candidates. Default: 0
  --min-occurrences <number>   Minimum occurrence count. Default: 1
  --keyword <text>             Repeatable keyword bonus for name/handle match
  --no-exclude-pure-post-like  Keep candidates whose only signal is post_like
  --require-profile-name       Keep only handles with at least one observed profile name
  --require-source-kind <kind> Repeatable required source kind
  --exclude-source-kind <kind> Repeatable forbidden source kind
  -h, --help                   Show command help`;

function requireFlagValue(flagName: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return value;
}

function parsePositiveIntegerFlag(flagName: string, value: string | undefined, max?: number) {
  const parsed = Number.parseInt(requireFlagValue(flagName, value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || (max !== undefined && parsed > max)) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }

  return parsed;
}

function parseNonNegativeIntegerFlag(flagName: string, value: string | undefined, max?: number) {
  const parsed = Number.parseInt(requireFlagValue(flagName, value), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || (max !== undefined && parsed > max)) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }

  return parsed;
}

function normalizeHandle(handle: string) {
  return handle.trim();
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

function extractHandleRecord(value: unknown): HandleRecord | null {
  if (typeof value === "string") {
    const handle = normalizeHandle(value);
    return handle ? { handle, name: null, occurrences: 1, sourceKinds: [] } : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["handle", "profile_link", "profileLink", "sourceHandle", "slug", "username"]) {
    const candidate = record[key];
    if (typeof candidate !== "string") {
      continue;
    }

    const handle = normalizeHandle(candidate);
    if (!handle) {
      continue;
    }

    const sourceKinds = Array.isArray(record.sourceKinds)
      ? record.sourceKinds.filter((item): item is string => typeof item === "string")
      : [];
    const name =
      typeof record.name === "string"
        ? record.name
        : Array.isArray(record.profileNames) && typeof record.profileNames[0] === "string"
          ? record.profileNames[0]
          : typeof record.displayName === "string"
            ? record.displayName
            : null;

    return {
      handle,
      name,
      occurrences:
        typeof record.occurrences === "number" && Number.isFinite(record.occurrences)
          ? record.occurrences
          : 1,
      sourceKinds
    };
  }

  return null;
}

function extractHandleRecords(payload: unknown): HandleRecord[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => extractHandleRecord(item))
      .filter((item): item is HandleRecord => Boolean(item));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["valid", "handles", "profiles", "items", "results", "data"]) {
    if (Array.isArray(record[key])) {
      return extractHandleRecords(record[key]);
    }
  }

  const single = extractHandleRecord(record);
  return single ? [single] : [];
}

async function readHandleRecords(path: string): Promise<HandleRecord[]> {
  const raw = await readFile(resolve(path), "utf8");
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return extractHandleRecords(JSON.parse(trimmed));
  }

  return trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((handle) => ({ handle, name: null, occurrences: 1, sourceKinds: [] }));
}

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonFile(path: string, value: unknown) {
  const resolvedPath = resolve(path);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, toPrettyJson(value), "utf8");
}

function isCategoryVisible(sourceKinds: string[]) {
  const kinds = new Set(sourceKinds);
  return kinds.has("category") || kinds.has("global_timeline") || kinds.has("profile_timeline");
}

function scoreKeywordMatches(candidate: FreshSeedCandidate, keywords: string[]) {
  if (keywords.length === 0) {
    return 0;
  }

  const haystack = `${candidate.handle} ${candidate.name ?? ""}`.toLowerCase();
  let matches = 0;
  for (const keyword of keywords) {
    if (keyword && haystack.includes(keyword)) {
      matches += 1;
    }
  }

  return Math.min(matches, 2);
}

export function scoreFreshSeedCandidate(
  candidate: FreshSeedCandidate,
  keywords: string[]
): RankedFreshSeedCandidate {
  const scoreBreakdown: FreshSeedScoreBreakdown = {
    occurrences: Math.min(candidate.occurrences, 5),
    freshInput: candidate.freshSourceCount > 0 ? 3 : 0,
    repeatedFresh: candidate.freshSourceCount > 1 ? 1 : 0,
    hasName: candidate.name ? 2 : 0,
    conversation: candidate.sourceKinds.includes("post_comment") ? 2 : 0,
    importSignal: candidate.sourceKinds.includes("external_import") ? 2 : 0,
    visibleTimeline: isCategoryVisible(candidate.sourceKinds) ? 1 : 0,
    keyword: scoreKeywordMatches(candidate, keywords),
    multiSignal: candidate.sourceKinds.length >= 2 ? 1 : 0
  };

  const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    ...candidate,
    score,
    scoreBreakdown
  };
}

function compareRankedCandidates(left: RankedFreshSeedCandidate, right: RankedFreshSeedCandidate) {
  return (
    right.score - left.score ||
    right.occurrences - left.occurrences ||
    right.freshSourceCount - left.freshSourceCount ||
    Number(Boolean(right.name)) - Number(Boolean(left.name)) ||
    right.sourceKinds.length - left.sourceKinds.length ||
    left.handle.localeCompare(right.handle)
  );
}

export function parseBuildBonjourFreshAuthSeedsArgs(
  argv: string[]
): BuildBonjourFreshAuthSeedsOptions {
  const options: BuildBonjourFreshAuthSeedsOptions = {
    freshInputPaths: [],
    historyInputPaths: [],
    excludePaths: [],
    limit: 50,
    skip: 0,
    minOccurrences: 1,
    excludePurePostLike: true,
    requireProfileName: false,
    requiredSourceKinds: [],
    excludedSourceKinds: [],
    keywords: [],
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--no-exclude-pure-post-like") {
      options.excludePurePostLike = false;
      continue;
    }

    if (arg === "--require-profile-name") {
      options.requireProfileName = true;
      continue;
    }

    if (arg === "--require-source-kind") {
      options.requiredSourceKinds.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-source-kind") {
      options.excludedSourceKinds.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--keyword") {
      options.keywords.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--fresh-input") {
      options.freshInputPaths.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--history-input") {
      options.historyInputPaths.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude") {
      options.excludePaths.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.outputPath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveIntegerFlag(arg, argv[index + 1], 100_000);
      index += 1;
      continue;
    }

    if (arg === "--skip") {
      options.skip = parseNonNegativeIntegerFlag(arg, argv[index + 1], 100_000);
      index += 1;
      continue;
    }

    if (arg === "--min-occurrences") {
      options.minOccurrences = parsePositiveIntegerFlag(arg, argv[index + 1], 100_000);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for build-bonjour-fresh-auth-seeds: ${arg}`);
  }

  return options;
}

export async function runBuildBonjourFreshAuthSeedsCommand(argv: string[]) {
  const options = parseBuildBonjourFreshAuthSeedsArgs(argv);

  if (options.help) {
    console.log(BUILD_BONJOUR_FRESH_AUTH_SEEDS_HELP_TEXT);
    return;
  }

  if (options.freshInputPaths.length === 0) {
    throw new Error("Missing --fresh-input");
  }

  const merged = new Map<string, FreshSeedCandidate>();
  let freshInputCount = 0;
  let historyInputCount = 0;

  const mergeRecords = async (paths: string[], sourceType: "fresh" | "history") => {
    for (const inputPath of paths) {
      const records = await readHandleRecords(inputPath);
      if (sourceType === "fresh") {
        freshInputCount += records.length;
      } else {
        historyInputCount += records.length;
      }

      for (const record of records) {
        const handle = normalizeHandle(record.handle);
        if (!handle) {
          continue;
        }

        const existing = merged.get(handle);
        const sourceKinds = new Set([...(existing?.sourceKinds ?? []), ...(record.sourceKinds ?? [])]);
        const name =
          typeof existing?.name === "string" && existing.name.length > 0
            ? existing.name
            : typeof record.name === "string" && record.name.length > 0
              ? record.name
              : null;

        merged.set(handle, {
          handle,
          name,
          occurrences: Math.max(existing?.occurrences ?? 0, record.occurrences ?? 1),
          sourceKinds: [...sourceKinds].sort(),
          freshSourceCount: (existing?.freshSourceCount ?? 0) + (sourceType === "fresh" ? 1 : 0),
          historySourceCount: (existing?.historySourceCount ?? 0) + (sourceType === "history" ? 1 : 0)
        });
      }
    }
  };

  await mergeRecords(options.freshInputPaths, "fresh");
  await mergeRecords(options.historyInputPaths, "history");

  const excludeSet = new Set<string>();
  for (const excludePath of options.excludePaths) {
    const records = await readHandleRecords(excludePath);
    for (const record of records) {
      const handle = normalizeHandle(record.handle);
      if (handle) {
        excludeSet.add(handle);
      }
    }
  }

  const keywords = options.keywords.map(normalizeKeyword).filter(Boolean);
  const candidates = [...merged.values()].filter((candidate) => {
    const candidateKinds = new Set(candidate.sourceKinds);

    if (excludeSet.has(candidate.handle)) {
      return false;
    }

    if (candidate.occurrences < options.minOccurrences) {
      return false;
    }

    if (options.excludePurePostLike) {
      const kinds = candidate.sourceKinds;
      if (kinds.length === 1 && kinds[0] === "post_like") {
        return false;
      }
    }

    if (options.requireProfileName && !candidate.name) {
      return false;
    }

    if (options.requiredSourceKinds.some((kind) => !candidateKinds.has(kind))) {
      return false;
    }

    if (options.excludedSourceKinds.some((kind) => candidateKinds.has(kind))) {
      return false;
    }

    return true;
  });

  const rankedCandidates = candidates
    .map((candidate) => scoreFreshSeedCandidate(candidate, keywords))
    .sort(compareRankedCandidates);

  const outputPath = resolve(
    options.outputPath ?? resolve(dirname(resolve(options.freshInputPaths[0]!)), "bonjour-fresh-auth-seeds.json")
  );
  const outputRecords = rankedCandidates
    .slice(options.skip, options.skip + options.limit)
    .map((candidate) => ({
      handle: candidate.handle,
      name: candidate.name,
      occurrences: candidate.occurrences,
      sourceKinds: candidate.sourceKinds,
      freshSourceCount: candidate.freshSourceCount,
      historySourceCount: candidate.historySourceCount,
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown
    }));

  await writeJsonFile(outputPath, outputRecords);

  const summary: BuildBonjourFreshAuthSeedsSummary = {
    freshInputCount,
    historyInputCount,
    mergedUniqueCount: merged.size,
    excludedCount: excludeSet.size,
    candidateCount: rankedCandidates.length,
    outputCount: outputRecords.length,
    limit: options.limit,
    skip: options.skip,
    minOccurrences: options.minOccurrences,
    keywords,
    outputPath
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
