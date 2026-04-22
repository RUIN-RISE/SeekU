import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BonjourClient,
  dumpBonjourRawData,
  type DumpBonjourImportedHandleSource
} from "@seeku/adapters";

import {
  WorkflowInterruptedError,
  createWorkflowInterruptionMonitor
} from "./workflow-interruption.js";

const COMMANDS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(COMMANDS_DIR, "../../../../output/bonjour-raw");

export const DUMP_BONJOUR_RAW_HELP_TEXT = `Seeku dump-bonjour-raw

Usage:
  seeku dump-bonjour-raw [options]

Behavior:
  - Download raw Bonjour JSON from the public internal API.
  - Save categories, fetched community pages, a deduped handles index, and profile JSON files.
  - Optionally expand the acquisition with the global timeline and external handle JSON imports.
  - This is the acquisition-first step before import-bonjour-dump and dedupe-bonjour.

Options:
  --page-size <number>            Category community page size. Default: 100
  --max-pages-per-category <n>    0 = scan category until empty. Default: 0
  --skip-category-timeline        Do not crawl per-category community timelines
  --scan-global-timeline          Also crawl anonymous global /user/community timeline
  --scan-commenters               Also crawl anonymous /user/communitycomment by post id
  --scan-imported-profile-timelines  Also crawl /user/community?type=profile_link for imported handles
  --global-page-size <number>     Requested page size for global timeline. Default: 100
  --max-global-pages <n>          0 = scan global timeline until empty. Default: 0
  --profile-timeline-page-size <n> Requested page size for imported profile timelines. Default: 20
  --max-profile-pages-per-handle <n> 0 = scan each imported handle timeline until empty. Default: 1
  --import-handles <path>         Repeatable JSON file containing validated Bonjour handles
  --profile-limit <number>        Optional cap for downloaded profile JSON files
  --timeline-concurrency <number> Parallel imported profile timeline workers. Default: 8
  --profile-concurrency <number>  Parallel profile fetch workers. Default: 8
  --comment-concurrency <number>  Parallel comment fetch workers. Default: 8
  --skip-profiles                 Only dump categories/community/handles; skip profile fetch
  --no-inflate                    Do not call ?inflate=true even when profile says inflationRequired
  --output <path>                 Output directory. Default: auto-generate under output/bonjour-raw
  -h, --help                      Show command help`;

export interface DumpBonjourRawCommandOptions {
  pageSize: number;
  maxPagesPerCategory: number;
  scanCategoryTimeline: boolean;
  scanGlobalTimeline: boolean;
  scanPostComments: boolean;
  scanImportedProfileTimelines: boolean;
  globalTimelinePageSize: number;
  maxGlobalTimelinePages: number;
  profileTimelinePageSize: number;
  maxProfileTimelinePages: number;
  importHandlePaths: string[];
  timelineConcurrency: number;
  profileLimit?: number;
  profileConcurrency: number;
  commentConcurrency: number;
  skipProfiles: boolean;
  inflateProfiles: boolean;
  outputPath?: string;
  help: boolean;
}

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

function buildDefaultOutputPath() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return resolve(DEFAULT_OUTPUT_DIR, date, `bonjour-raw-${timestamp}`);
}

function extractHandle(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const key of ["handle", "profile_link", "sourceHandle", "username", "slug"]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function extractHandlesFromCollection(values: unknown[]) {
  return [...new Set(values.map(extractHandle).filter((value): value is string => Boolean(value)))];
}

function extractImportedHandles(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return extractHandlesFromCollection(payload);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["valid", "handles", "profiles", "items", "results", "data"]) {
    if (Array.isArray(record[key])) {
      return extractHandlesFromCollection(record[key]);
    }
  }

  const directHandle = extractHandle(record);
  return directHandle ? [directHandle] : [];
}

async function loadImportedHandleSource(path: string): Promise<DumpBonjourImportedHandleSource> {
  const resolvedPath = resolve(path);
  const raw = await readFile(resolvedPath, "utf8");
  const payload = JSON.parse(raw) as unknown;
  const handles = extractImportedHandles(payload);

  if (handles.length === 0) {
    throw new Error(`No handles found in import file: ${resolvedPath}`);
  }

  return {
    label: basename(resolvedPath),
    handles,
    metadata: {
      sourcePath: resolvedPath
    }
  };
}

export function parseDumpBonjourRawArgs(argv: string[]): DumpBonjourRawCommandOptions {
  const options: DumpBonjourRawCommandOptions = {
    pageSize: 100,
    maxPagesPerCategory: 0,
    scanCategoryTimeline: true,
    scanGlobalTimeline: false,
    scanPostComments: false,
    scanImportedProfileTimelines: false,
    globalTimelinePageSize: 100,
    maxGlobalTimelinePages: 0,
    profileTimelinePageSize: 20,
    maxProfileTimelinePages: 1,
    importHandlePaths: [],
    timelineConcurrency: 8,
    profileConcurrency: 8,
    commentConcurrency: 8,
    skipProfiles: false,
    inflateProfiles: true,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--skip-profiles") {
      options.skipProfiles = true;
      continue;
    }

    if (arg === "--no-inflate") {
      options.inflateProfiles = false;
      continue;
    }

    if (arg === "--skip-category-timeline") {
      options.scanCategoryTimeline = false;
      continue;
    }

    if (arg === "--scan-global-timeline") {
      options.scanGlobalTimeline = true;
      continue;
    }

    if (arg === "--scan-commenters") {
      options.scanPostComments = true;
      continue;
    }

    if (arg === "--scan-imported-profile-timelines") {
      options.scanImportedProfileTimelines = true;
      continue;
    }

    if (arg === "--page-size") {
      options.pageSize = parsePositiveIntegerFlag(arg, argv[index + 1], 100);
      index += 1;
      continue;
    }

    if (arg === "--global-page-size") {
      options.globalTimelinePageSize = parsePositiveIntegerFlag(arg, argv[index + 1], 100);
      index += 1;
      continue;
    }

    if (arg === "--max-pages-per-category") {
      options.maxPagesPerCategory = parseNonNegativeIntegerFlag(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--max-global-pages") {
      options.maxGlobalTimelinePages = parseNonNegativeIntegerFlag(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--profile-timeline-page-size") {
      options.profileTimelinePageSize = parsePositiveIntegerFlag(arg, argv[index + 1], 100);
      index += 1;
      continue;
    }

    if (arg === "--max-profile-pages-per-handle") {
      options.maxProfileTimelinePages = parseNonNegativeIntegerFlag(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--import-handles") {
      options.importHandlePaths.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--timeline-concurrency") {
      options.timelineConcurrency = parsePositiveIntegerFlag(arg, argv[index + 1], 32);
      index += 1;
      continue;
    }

    if (arg === "--profile-concurrency") {
      options.profileConcurrency = parsePositiveIntegerFlag(arg, argv[index + 1], 32);
      index += 1;
      continue;
    }

    if (arg === "--comment-concurrency") {
      options.commentConcurrency = parsePositiveIntegerFlag(arg, argv[index + 1], 32);
      index += 1;
      continue;
    }

    if (arg === "--profile-limit") {
      options.profileLimit = parsePositiveIntegerFlag(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.outputPath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for dump-bonjour-raw: ${arg}`);
  }

  return options;
}

export async function runDumpBonjourRawCommand(argv: string[]) {
  const abortController = new AbortController();
  const interruption = createWorkflowInterruptionMonitor({
    onInterrupt: (signal) => abortController.abort(new WorkflowInterruptedError(signal))
  });

  const options = parseDumpBonjourRawArgs(argv);

  try {
    if (options.help) {
      console.log(DUMP_BONJOUR_RAW_HELP_TEXT);
      return;
    }

    const outputDir = options.outputPath ? resolve(options.outputPath) : buildDefaultOutputPath();
    const importedHandleSources = await Promise.all(
      options.importHandlePaths.map((path) => loadImportedHandleSource(path))
    );

    const timelineClients = Array.from(
      { length: Math.max(1, options.timelineConcurrency) },
      () => new BonjourClient()
    );
    const profileClients = Array.from(
      { length: Math.max(1, options.profileConcurrency) },
      () => new BonjourClient()
    );
    const commentClients = Array.from(
      { length: Math.max(1, options.commentConcurrency) },
      () => new BonjourClient()
    );

    const result = await dumpBonjourRawData({
      outputDir,
      signal: abortController.signal,
      pageSize: options.pageSize,
      maxPagesPerCategory: options.maxPagesPerCategory,
      scanCategoryTimeline: options.scanCategoryTimeline,
      scanGlobalTimeline: options.scanGlobalTimeline,
      scanPostComments: options.scanPostComments,
      scanImportedProfileTimelines: options.scanImportedProfileTimelines,
      globalTimelinePageSize: options.globalTimelinePageSize,
      maxGlobalTimelinePages: options.maxGlobalTimelinePages,
      profileTimelinePageSize: options.profileTimelinePageSize,
      maxProfileTimelinePages: options.maxProfileTimelinePages,
      importedHandleSources,
      timelineClients,
      profileClients,
      commentClients,
      profileLimit: options.profileLimit,
      fetchProfiles: !options.skipProfiles,
      inflateProfiles: options.inflateProfiles
    });

    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    interruption.dispose();
  }
}
