import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { BonjourClient } from "@seeku/adapters";
import {
  createDatabaseConnection,
  eq,
  sourceProfiles,
  type SeekuDatabase
} from "@seeku/db";

interface HandleRecord {
  handle: string;
  name?: string | null;
  requestedHandle?: string;
  sourceProfileId?: string | null;
  [key: string]: unknown;
}

interface FilterBonjourImportHandlesOptions {
  inputPath?: string;
  outputPath?: string;
  excludePaths: string[];
  excludeExistingDb: boolean;
  resolveSourceProfiles: boolean;
  resolveConcurrency: number;
  help: boolean;
}

interface FilterBonjourImportHandlesSummary {
  inputPath: string;
  outputPath: string;
  inputCount: number;
  outputCount: number;
  excludedByDbCount: number;
  excludedByDbProfileIdCount: number;
  excludedByDbHandleCount: number;
  excludedByFileCount: number;
  duplicateInputCount: number;
  canonicalizedCount: number;
  resolvedCount: number;
  resolveErrorCount: number;
  collapsedAliasCount: number;
}

export const FILTER_BONJOUR_IMPORT_HANDLES_HELP_TEXT = `Seeku filter-bonjour-import-handles

Usage:
  seeku filter-bonjour-import-handles [options]

Behavior:
  - Read Bonjour handles from import-handles.json / handles.json / JSON arrays / newline text.
  - Remove duplicate handles inside the input.
  - Optionally exclude handles already present in Seeku's bonjour source_profiles.
  - Optionally resolve each handle to Bonjour sourceProfileId + canonical handle before filtering.
  - Optionally exclude handles from one or more extra files.
  - Write an import-ready JSON array for downstream dump-bonjour-raw.

Options:
  --input <path>                  Input handle file
  --output <path>                 Output JSON path
  --exclude <path>                Repeatable exclude-handle file
  --resolve-source-profiles       Resolve input handles to canonical handle + sourceProfileId before filtering
  --resolve-concurrency <number>  Parallel Bonjour profile resolutions. Default: 8
  --no-exclude-existing-db        Do not subtract existing bonjour source_profile handles
  -h, --help                      Show command help`;

function requireFlagValue(flagName: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return value;
}

function normalizeHandle(handle: string) {
  return handle.trim();
}

function normalizeSourceProfileId(value: string | null | undefined) {
  return value?.trim() || null;
}

function parsePositiveIntegerFlag(flagName: string, value: string | undefined, max?: number) {
  const parsed = Number.parseInt(requireFlagValue(flagName, value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || (max !== undefined && parsed > max)) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }

  return parsed;
}

function extractHandleRecord(value: unknown): HandleRecord | null {
  if (typeof value === "string") {
    const handle = normalizeHandle(value);
    return handle ? { handle } : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["handle", "profile_link", "profileLink", "sourceHandle", "slug", "username"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && normalizeHandle(candidate)) {
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.displayName === "string"
            ? record.displayName
            : null;

      return {
        ...record,
        handle: normalizeHandle(candidate),
        name
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
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return extractHandleRecords(candidate);
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
    .map((handle) => ({ handle }));
}

async function listExistingBonjourProfiles(db: SeekuDatabase) {
  const rows = await db
    .select({
      handle: sourceProfiles.sourceHandle,
      sourceProfileId: sourceProfiles.sourceProfileId
    })
    .from(sourceProfiles)
    .where(eq(sourceProfiles.source, "bonjour"));

  return {
    handleSet: new Set(
      rows
        .map((row) => normalizeHandle(row.handle))
        .filter(Boolean)
    ),
    sourceProfileIdSet: new Set(
      rows
        .map((row) => normalizeSourceProfileId(row.sourceProfileId))
        .filter((value): value is string => Boolean(value))
    )
  };
}

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonFile(path: string, value: unknown) {
  await writeFile(resolve(path), toPrettyJson(value), "utf8");
}

async function resolveHandleRecords(
  records: HandleRecord[],
  concurrency: number
): Promise<{
  records: HandleRecord[];
  resolvedCount: number;
  canonicalizedCount: number;
  resolveErrorCount: number;
}> {
  if (records.length === 0) {
    return {
      records: [],
      resolvedCount: 0,
      canonicalizedCount: 0,
      resolveErrorCount: 0
    };
  }

  const results: HandleRecord[] = new Array(records.length);
  const clients = Array.from(
    { length: Math.max(1, concurrency) },
    () => new BonjourClient()
  );
  let nextIndex = 0;
  let resolvedCount = 0;
  let canonicalizedCount = 0;
  let resolveErrorCount = 0;

  const workers = clients.map((client) =>
    (async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= records.length) {
          return;
        }

        const record = records[currentIndex]!;
        try {
          const profile = await client.fetchProfileByHandle(record.handle);
          const canonicalHandle = normalizeHandle(profile.profile_link || record.handle);
          const sourceProfileId = normalizeSourceProfileId(profile._id);
          results[currentIndex] = {
            ...record,
            handle: canonicalHandle || record.handle,
            requestedHandle: record.handle,
            sourceProfileId,
            name:
              typeof profile.name === "string" && profile.name.trim().length > 0
                ? profile.name.trim()
                : typeof record.name === "string"
                  ? record.name
                  : null
          };
          resolvedCount += 1;
          if (canonicalHandle && canonicalHandle !== record.handle) {
            canonicalizedCount += 1;
          }
        } catch {
          results[currentIndex] = {
            ...record,
            requestedHandle: record.handle,
            sourceProfileId: null
          };
          resolveErrorCount += 1;
        }
      }
    })()
  );

  await Promise.all(workers);

  return {
    records: results,
    resolvedCount,
    canonicalizedCount,
    resolveErrorCount
  };
}

export function parseFilterBonjourImportHandlesArgs(argv: string[]): FilterBonjourImportHandlesOptions {
  const options: FilterBonjourImportHandlesOptions = {
    excludePaths: [],
    excludeExistingDb: true,
    resolveSourceProfiles: false,
    resolveConcurrency: 8,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--no-exclude-existing-db") {
      options.excludeExistingDb = false;
      continue;
    }

    if (arg === "--resolve-source-profiles") {
      options.resolveSourceProfiles = true;
      continue;
    }

    if (arg === "--input") {
      options.inputPath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.outputPath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--exclude") {
      options.excludePaths.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--resolve-concurrency") {
      options.resolveConcurrency = parsePositiveIntegerFlag(arg, argv[index + 1], 64);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for filter-bonjour-import-handles: ${arg}`);
  }

  return options;
}

export async function runFilterBonjourImportHandlesCommand(argv: string[]) {
  const options = parseFilterBonjourImportHandlesArgs(argv);

  if (options.help) {
    console.log(FILTER_BONJOUR_IMPORT_HANDLES_HELP_TEXT);
    return;
  }

  if (!options.inputPath) {
    throw new Error("Missing --input");
  }

  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(
    options.outputPath ?? resolve(dirname(inputPath), "delta-import-handles.json")
  );

  const inputRecords = await readHandleRecords(inputPath);
  const deduped = new Map<string, HandleRecord>();
  let duplicateInputCount = 0;

  for (const record of inputRecords) {
    const handle = normalizeHandle(record.handle);
    if (!handle) {
      continue;
    }

    if (deduped.has(handle)) {
      duplicateInputCount += 1;
      continue;
    }

    deduped.set(handle, {
      handle,
      name: typeof record.name === "string" ? record.name : null
    });
  }

  const fileExcludeSet = new Set<string>();
  const dbHandleSet = new Set<string>();
  const dbSourceProfileIdSet = new Set<string>();
  let excludedByDbCount = 0;
  let excludedByDbProfileIdCount = 0;
  let excludedByDbHandleCount = 0;
  let excludedByFileCount = 0;
  let collapsedAliasCount = 0;

  if (options.excludeExistingDb) {
    const ownedConnection = createDatabaseConnection();
    try {
      const existingProfiles = await listExistingBonjourProfiles(ownedConnection.db);
      for (const handle of existingProfiles.handleSet) {
        dbHandleSet.add(handle);
      }
      for (const sourceProfileId of existingProfiles.sourceProfileIdSet) {
        dbSourceProfileIdSet.add(sourceProfileId);
      }
    } finally {
      await ownedConnection.close();
    }
  }

  for (const excludePath of options.excludePaths) {
    const records = await readHandleRecords(excludePath);
    for (const record of records) {
      const handle = normalizeHandle(record.handle);
      if (handle) {
        fileExcludeSet.add(handle);
      }
    }
  }

  const preparedRecords = options.resolveSourceProfiles
    ? await resolveHandleRecords([...deduped.values()], options.resolveConcurrency)
    : {
        records: [...deduped.values()],
        resolvedCount: 0,
        canonicalizedCount: 0,
        resolveErrorCount: 0
      };

  const collapsedRecords = new Map<string, HandleRecord>();
  for (const record of preparedRecords.records) {
    const handle = normalizeHandle(record.handle);
    if (!handle) {
      continue;
    }

    const sourceProfileId = normalizeSourceProfileId(record.sourceProfileId);
    const collapseKey = sourceProfileId ? `profile:${sourceProfileId}` : `handle:${handle}`;
    if (collapsedRecords.has(collapseKey)) {
      collapsedAliasCount += 1;
      continue;
    }

    collapsedRecords.set(collapseKey, {
      handle,
      name: typeof record.name === "string" ? record.name : null,
      requestedHandle:
        typeof record.requestedHandle === "string" ? normalizeHandle(record.requestedHandle) : handle,
      sourceProfileId
    });
  }

  const outputRecords: Array<{
    handle: string;
    name: string | null;
    requestedHandle?: string;
    sourceProfileId?: string | null;
  }> = [];

  for (const record of collapsedRecords.values()) {
    const handle = normalizeHandle(record.handle);
    const sourceProfileId = normalizeSourceProfileId(record.sourceProfileId);

    if (options.excludeExistingDb && sourceProfileId && dbSourceProfileIdSet.has(sourceProfileId)) {
      excludedByDbProfileIdCount += 1;
      excludedByDbCount += 1;
      continue;
    }

    if (options.excludeExistingDb && dbHandleSet.has(handle)) {
      excludedByDbHandleCount += 1;
      excludedByDbCount += 1;
      continue;
    }

    if (fileExcludeSet.has(handle)) {
      excludedByFileCount += 1;
      continue;
    }

    outputRecords.push({
      handle,
      name: typeof record.name === "string" ? record.name : null,
      requestedHandle:
        typeof record.requestedHandle === "string" ? record.requestedHandle : undefined,
      sourceProfileId
    });
  }

  await writeJsonFile(outputPath, outputRecords);

  const summary: FilterBonjourImportHandlesSummary = {
    inputPath,
    outputPath,
    inputCount: inputRecords.length,
    outputCount: outputRecords.length,
    excludedByDbCount,
    excludedByDbProfileIdCount,
    excludedByDbHandleCount,
    excludedByFileCount,
    duplicateInputCount,
    canonicalizedCount: preparedRecords.canonicalizedCount,
    resolvedCount: preparedRecords.resolvedCount,
    resolveErrorCount: preparedRecords.resolveErrorCount,
    collapsedAliasCount
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
