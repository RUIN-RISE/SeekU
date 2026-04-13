import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface HandleRecord {
  handle: string;
  name?: string | null;
  occurrences?: number;
  sourceKinds?: string[];
}

interface BuildBonjourAuthProbeSeedsOptions {
  inputPaths: string[];
  excludePaths: string[];
  outputPath?: string;
  limit: number;
  skip: number;
  minOccurrences: number;
  excludePurePostLike: boolean;
  requireCategoryVisible: boolean;
  requireProfileName: boolean;
  requiredSourceKinds: string[];
  excludedSourceKinds: string[];
  help: boolean;
}

interface SeedCandidate {
  handle: string;
  name: string | null;
  occurrences: number;
  sourceKinds: string[];
}

interface BuildBonjourAuthProbeSeedsSummary {
  inputCount: number;
  mergedUniqueCount: number;
  excludedCount: number;
  candidateCount: number;
  outputCount: number;
  minOccurrences: number;
  limit: number;
  skip: number;
  excludePurePostLike: boolean;
  requireCategoryVisible: boolean;
  requireProfileName: boolean;
  requiredSourceKinds: string[];
  excludedSourceKinds: string[];
  outputPath: string;
}

export const BUILD_BONJOUR_AUTH_PROBE_SEEDS_HELP_TEXT = `Seeku build-bonjour-auth-probe-seeds

Usage:
  seeku build-bonjour-auth-probe-seeds [options]

Behavior:
  - Merge one or more Bonjour handles.json / import-handles.json inputs.
  - Exclude handles already present in one or more auth/import handle files.
  - Rank remaining candidates by descending occurrence count.
  - Output a seed JSON file ready for dump-bonjour-auth-handles --seed-file.

Options:
  --input <path>                Repeatable handles source file
  --exclude <path>              Repeatable exclude-handle file
  --output <path>               Output JSON path
  --limit <number>              Max output handles. Default: 100
  --skip <number>               Skip the first N ranked candidates. Default: 0
  --min-occurrences <number>    Minimum occurrence count. Default: 1
  --no-exclude-pure-post-like   Keep candidates whose only signal is post_like
  --require-category-visible    Keep only handles seen in category/global/profile timelines
  --require-profile-name        Keep only handles with at least one observed profile name
  --require-source-kind <kind>  Repeatable required source kind
  --exclude-source-kind <kind>  Repeatable forbidden source kind
  -h, --help                    Show command help`;

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
    if (typeof candidate === "string" && normalizeHandle(candidate)) {
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
        handle: normalizeHandle(candidate),
        name,
        occurrences:
          typeof record.occurrences === "number" && Number.isFinite(record.occurrences)
            ? record.occurrences
            : 1,
        sourceKinds
      };
    }
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
  const resolvedPath = resolve(path);
  const raw = await readFile(resolvedPath, "utf8");
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
  await writeFile(resolve(path), toPrettyJson(value), "utf8");
}

function isCategoryVisible(sourceKinds: string[]) {
  const kinds = new Set(sourceKinds);
  return (
    kinds.has("category") ||
    kinds.has("global_timeline") ||
    kinds.has("profile_timeline")
  );
}

function compareSeedCandidates(left: SeedCandidate, right: SeedCandidate) {
  return (
    right.occurrences - left.occurrences ||
    Number(Boolean(right.name)) - Number(Boolean(left.name)) ||
    right.sourceKinds.length - left.sourceKinds.length ||
    left.handle.localeCompare(right.handle)
  );
}

export function parseBuildBonjourAuthProbeSeedsArgs(
  argv: string[]
): BuildBonjourAuthProbeSeedsOptions {
  const options: BuildBonjourAuthProbeSeedsOptions = {
    inputPaths: [],
    excludePaths: [],
    limit: 100,
    skip: 0,
    minOccurrences: 1,
    excludePurePostLike: true,
    requireCategoryVisible: false,
    requireProfileName: false,
    requiredSourceKinds: [],
    excludedSourceKinds: [],
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

    if (arg === "--require-category-visible") {
      options.requireCategoryVisible = true;
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

    if (arg === "--input") {
      options.inputPaths.push(requireFlagValue(arg, argv[index + 1]));
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

    throw new Error(`Unknown option for build-bonjour-auth-probe-seeds: ${arg}`);
  }

  return options;
}

export async function runBuildBonjourAuthProbeSeedsCommand(argv: string[]) {
  const options = parseBuildBonjourAuthProbeSeedsArgs(argv);

  if (options.help) {
    console.log(BUILD_BONJOUR_AUTH_PROBE_SEEDS_HELP_TEXT);
    return;
  }

  if (options.inputPaths.length === 0) {
    throw new Error("Missing --input");
  }

  const merged = new Map<string, SeedCandidate>();
  let inputCount = 0;

  for (const inputPath of options.inputPaths) {
    const records = await readHandleRecords(inputPath);
    inputCount += records.length;
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
        sourceKinds: [...sourceKinds].sort()
      });
    }
  }

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

    if (options.requireCategoryVisible && !isCategoryVisible(candidate.sourceKinds)) {
      return false;
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

  candidates.sort(compareSeedCandidates);

  const outputPath = resolve(
    options.outputPath ?? resolve(dirname(resolve(options.inputPaths[0]!)), "bonjour-auth-probe-seeds.json")
  );
  const outputRecords = candidates.slice(options.skip, options.skip + options.limit).map((candidate) => ({
    handle: candidate.handle,
    name: candidate.name,
    occurrences: candidate.occurrences,
    sourceKinds: candidate.sourceKinds
  }));

  await writeJsonFile(outputPath, outputRecords);

  const summary: BuildBonjourAuthProbeSeedsSummary = {
    inputCount,
    mergedUniqueCount: merged.size,
    excludedCount: excludeSet.size,
    candidateCount: candidates.length,
    outputCount: outputRecords.length,
    minOccurrences: options.minOccurrences,
    limit: options.limit,
    skip: options.skip,
    excludePurePostLike: options.excludePurePostLike,
    requireCategoryVisible: options.requireCategoryVisible,
    requireProfileName: options.requireProfileName,
    requiredSourceKinds: [...options.requiredSourceKinds],
    excludedSourceKinds: [...options.excludedSourceKinds],
    outputPath
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
