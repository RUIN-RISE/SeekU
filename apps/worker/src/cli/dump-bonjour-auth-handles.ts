import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BonjourClient,
  type BonjourFriendLinkEntry,
  type BonjourFriendLinkResponse
} from "@seeku/adapters";

const COMMANDS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(COMMANDS_DIR, "../../../../output/bonjour-raw");
const DEFAULT_DEPTH = 2;
const DEFAULT_MAX_NODES = 1_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_CHECKPOINT_EVERY = 25;
const DEFAULT_MAX_NODE_RETRIES = 2;

export const DUMP_BONJOUR_AUTH_HANDLES_HELP_TEXT = `Seeku dump-bonjour-auth-handles

Usage:
  seeku dump-bonjour-auth-handles [options]

Behavior:
  - Use an authenticated Bonjour token from the local environment.
  - Crawl /user/friend and /user/friend/<handle> as a bounded BFS.
  - Persist checkpoint files so long-running crawls can resume safely.
  - Save raw friend-link responses plus an import-ready handles JSON file.
  - Do not paste the token into chat; set BONJOUR_TOKEN locally before running.

Options:
  --seed <handle>              Repeatable BFS seed. Default: own profile handle via /user/profile
  --seed-file <path>           JSON or newline-delimited file containing seed handles
  --depth <number>             Friend-graph BFS depth. Default: 2
  --max-nodes <number>         Hard cap on fetched graph nodes. Default: 1000
  --concurrency <number>       Parallel friend-link fetch workers. Default: 4
  --checkpoint-every <number>  Save checkpoint every N fetched nodes. Default: 25
  --max-node-retries <number>  Retry each failed handle up to N times. Default: 2
  --resume <path>              Resume a previous run from this output directory
  --output <path>              Output directory. Default: auto-generate under output/bonjour-raw
  -h, --help                   Show command help`;

export interface DumpBonjourAuthHandlesCommandOptions {
  seedHandles: string[];
  seedFilePath?: string;
  depth?: number;
  maxNodes?: number;
  concurrency?: number;
  checkpointEvery?: number;
  maxNodeRetries?: number;
  resumePath?: string;
  outputPath?: string;
  help: boolean;
}

interface HandleAccumulator {
  handle: string;
  firstDepth: number;
  discoveredFrom: Set<string>;
  profileNames: Set<string>;
  profileDescriptions: Set<string>;
  incomingEdges: number;
}

interface HandleSummary {
  handle: string;
  firstDepth: number;
  incomingEdges: number;
  discoveredFrom: string[];
  profileNames: string[];
  profileDescriptions: string[];
}

interface FriendLinkFetchRecord {
  handle: string;
  depth: number;
  direct: number;
  reverse: number;
  totalNeighbors: number;
  filePath: string;
}

interface FriendLinkFetchErrorRecord {
  handle: string;
  depth: number;
  attempt: number;
  error: string;
  willRetry: boolean;
  recordedAt: string;
}

interface FrontierState {
  currentDepth: number;
  pendingCurrentDepth: string[];
  pendingRetry: string[];
  queuedNextDepth: string[];
  retryCounts: Record<string, number>;
  finished: boolean;
}

interface PersistedManifest {
  generatedAt: string;
  outputDir: string;
  seedHandles: string[];
  selfHandle: string | null;
  depth: number;
  maxNodes: number;
  concurrency: number;
  checkpointEvery: number;
  maxNodeRetries: number;
  fetchedNodes: number;
  discoveredHandles: number;
  currentDepth: number;
  pendingCurrentDepth: number;
  pendingRetry: number;
  queuedNextDepth: number;
  errorCount: number;
  status: "running" | "completed" | "max_nodes_reached";
  frontierPath: string;
  visitedPath: string;
  errorsPath: string;
  handlesPath: string;
  importHandlesPath: string;
  fetchIndexPath: string;
}

interface ResumeState {
  manifest: PersistedManifest;
  frontier: FrontierState;
  fetchedHandles: Set<string>;
  accumulators: Map<string, HandleAccumulator>;
  responseRecords: FriendLinkFetchRecord[];
  errors: FriendLinkFetchErrorRecord[];
}

interface RuntimeState {
  outputDir: string;
  seedHandles: string[];
  selfHandle?: string;
  depth: number;
  maxNodes: number;
  concurrency: number;
  checkpointEvery: number;
  maxNodeRetries: number;
  accumulators: Map<string, HandleAccumulator>;
  responseRecords: FriendLinkFetchRecord[];
  fetchedHandles: Set<string>;
  errors: FriendLinkFetchErrorRecord[];
  currentDepth: number;
  pendingCurrentDepth: string[];
  pendingRetry: string[];
  queuedNextDepth: string[];
  retryCounts: Map<string, number>;
}

interface SeedFileHandleLike {
  handle?: unknown;
  profile_link?: unknown;
  profileLink?: unknown;
}

function requireFlagValue(flagName: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return value;
}

function normalizeHandle(handle: string) {
  return handle.trim();
}

function dedupeHandles(handles: string[]) {
  return [...new Set(handles.map(normalizeHandle).filter(Boolean))];
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
  return resolve(DEFAULT_OUTPUT_DIR, date, `bonjour-auth-handles-${timestamp}`);
}

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonFile(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toPrettyJson(value), "utf8");
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function extractSeedHandlesFromJsonValue(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSeedHandlesFromJsonValue(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown> & SeedFileHandleLike;
  const directHandleCandidates = [record.handle, record.profile_link, record.profileLink]
    .filter((candidate): candidate is string => typeof candidate === "string");

  if (directHandleCandidates.length > 0) {
    return directHandleCandidates;
  }

  for (const key of ["handles", "records", "items", "data", "results", "profiles"]) {
    if (key in record) {
      return extractSeedHandlesFromJsonValue(record[key]);
    }
  }

  return [];
}

async function loadSeedHandlesFromFile(path: string) {
  const raw = await readFile(path, "utf8");
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return dedupeHandles(extractSeedHandlesFromJsonValue(JSON.parse(trimmed)));
  }

  return dedupeHandles(
    trimmed
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
  );
}

function collectNeighborEntries(response: BonjourFriendLinkResponse) {
  const neighbors: Array<BonjourFriendLinkEntry & { edgeType: "friend" | "friended" }> = [];

  for (const entry of response.friend ?? []) {
    neighbors.push({ ...entry, edgeType: "friend" });
  }

  for (const entry of response.friended ?? []) {
    neighbors.push({ ...entry, edgeType: "friended" });
  }

  return neighbors;
}

function getOrCreateAccumulator(
  accumulators: Map<string, HandleAccumulator>,
  handle: string,
  depth: number
) {
  let accumulator = accumulators.get(handle);
  if (!accumulator) {
    accumulator = {
      handle,
      firstDepth: depth,
      discoveredFrom: new Set<string>(),
      profileNames: new Set<string>(),
      profileDescriptions: new Set<string>(),
      incomingEdges: 0
    };
    accumulators.set(handle, accumulator);
  }

  if (depth < accumulator.firstDepth) {
    accumulator.firstDepth = depth;
  }

  return accumulator;
}

function compareHandleSummary(
  left: {
    incomingEdges: number;
    firstDepth: number;
    handle: string;
  },
  right: {
    incomingEdges: number;
    firstDepth: number;
    handle: string;
  }
) {
  return (
    right.incomingEdges - left.incomingEdges ||
    left.firstDepth - right.firstDepth ||
    left.handle.localeCompare(right.handle)
  );
}

function serializeHandleSummaries(accumulators: Map<string, HandleAccumulator>) {
  return [...accumulators.values()]
    .map<HandleSummary>((accumulator) => ({
      handle: accumulator.handle,
      firstDepth: accumulator.firstDepth,
      incomingEdges: accumulator.incomingEdges,
      discoveredFrom: [...accumulator.discoveredFrom].sort(),
      profileNames: [...accumulator.profileNames].sort(),
      profileDescriptions: [...accumulator.profileDescriptions].sort()
    }))
    .sort(compareHandleSummary);
}

function restoreAccumulators(summaries: HandleSummary[]) {
  const accumulators = new Map<string, HandleAccumulator>();

  for (const summary of summaries) {
    accumulators.set(summary.handle, {
      handle: summary.handle,
      firstDepth: summary.firstDepth,
      incomingEdges: summary.incomingEdges,
      discoveredFrom: new Set(summary.discoveredFrom ?? []),
      profileNames: new Set(summary.profileNames ?? []),
      profileDescriptions: new Set(summary.profileDescriptions ?? [])
    });
  }

  return accumulators;
}

function buildPaths(outputDir: string) {
  return {
    frontierPath: resolve(outputDir, "frontier.json"),
    visitedPath: resolve(outputDir, "visited.json"),
    errorsPath: resolve(outputDir, "errors.json"),
    handlesPath: resolve(outputDir, "handles.json"),
    importHandlesPath: resolve(outputDir, "import-handles.json"),
    fetchIndexPath: resolve(outputDir, "friend-links-index.json"),
    manifestPath: resolve(outputDir, "manifest.json")
  };
}

async function persistCheckpoint(
  runtime: RuntimeState,
  status: PersistedManifest["status"]
) {
  const paths = buildPaths(runtime.outputDir);
  const handleSummaries = serializeHandleSummaries(runtime.accumulators);
  const fetchedHandles = [...runtime.fetchedHandles].sort();
  const frontierState: FrontierState = {
    currentDepth: runtime.currentDepth,
    pendingCurrentDepth: runtime.pendingCurrentDepth,
    pendingRetry: runtime.pendingRetry,
    queuedNextDepth: runtime.queuedNextDepth,
    retryCounts: Object.fromEntries(
      [...runtime.retryCounts.entries()].sort((left, right) =>
        left[0].localeCompare(right[0])
      )
    ),
    finished: status === "completed"
  };
  const manifest: PersistedManifest = {
    generatedAt: new Date().toISOString(),
    outputDir: runtime.outputDir,
    seedHandles: runtime.seedHandles,
    selfHandle: runtime.selfHandle ?? null,
    depth: runtime.depth,
    maxNodes: runtime.maxNodes,
    concurrency: runtime.concurrency,
    checkpointEvery: runtime.checkpointEvery,
    maxNodeRetries: runtime.maxNodeRetries,
    fetchedNodes: runtime.fetchedHandles.size,
    discoveredHandles: handleSummaries.length,
    currentDepth: runtime.currentDepth,
    pendingCurrentDepth: runtime.pendingCurrentDepth.length,
    pendingRetry: runtime.pendingRetry.length,
    queuedNextDepth: runtime.queuedNextDepth.length,
    errorCount: runtime.errors.length,
    status,
    frontierPath: basename(paths.frontierPath),
    visitedPath: basename(paths.visitedPath),
    errorsPath: basename(paths.errorsPath),
    handlesPath: basename(paths.handlesPath),
    importHandlesPath: basename(paths.importHandlesPath),
    fetchIndexPath: basename(paths.fetchIndexPath)
  };

  await Promise.all([
    writeJsonFile(paths.frontierPath, frontierState),
    writeJsonFile(paths.visitedPath, fetchedHandles),
    writeJsonFile(paths.errorsPath, runtime.errors),
    writeJsonFile(paths.handlesPath, handleSummaries),
    writeJsonFile(
      paths.importHandlesPath,
      handleSummaries.map((handle) => ({
        handle: handle.handle,
        name: handle.profileNames[0] ?? null
      }))
    ),
    writeJsonFile(paths.fetchIndexPath, runtime.responseRecords),
    writeJsonFile(paths.manifestPath, manifest)
  ]);
}

async function loadResumeState(outputDir: string): Promise<ResumeState> {
  const paths = buildPaths(outputDir);
  const manifest = await readJsonFile<PersistedManifest>(paths.manifestPath);
  const frontier = await readJsonFile<FrontierState>(paths.frontierPath);
  const visited = await readJsonFile<string[]>(paths.visitedPath);
  const errors = await readJsonFile<FriendLinkFetchErrorRecord[]>(paths.errorsPath);
  const handles = await readJsonFile<HandleSummary[]>(paths.handlesPath);
  const responseRecords = await readJsonFile<FriendLinkFetchRecord[]>(paths.fetchIndexPath);

  if (!manifest || !frontier || !visited || !errors || !handles || !responseRecords) {
    throw new Error(`Resume requested but checkpoint files are incomplete under ${outputDir}`);
  }

  return {
    manifest,
    frontier,
    fetchedHandles: new Set(visited),
    accumulators: restoreAccumulators(handles),
    responseRecords,
    errors
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number, workerIndex: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, (_, workerIndex) =>
    (async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= values.length) {
          return;
        }

        results[currentIndex] = await mapper(values[currentIndex]!, currentIndex, workerIndex);
      }
    })()
  );

  await Promise.all(workers);
  return results;
}

export function parseDumpBonjourAuthHandlesArgs(argv: string[]): DumpBonjourAuthHandlesCommandOptions {
  const options: DumpBonjourAuthHandlesCommandOptions = {
    seedHandles: [],
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--seed") {
      options.seedHandles.push(requireFlagValue(arg, argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--seed-file") {
      options.seedFilePath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--depth") {
      options.depth = parseNonNegativeIntegerFlag(arg, argv[index + 1], 8);
      index += 1;
      continue;
    }

    if (arg === "--max-nodes") {
      options.maxNodes = parsePositiveIntegerFlag(arg, argv[index + 1], 200_000);
      index += 1;
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = parsePositiveIntegerFlag(arg, argv[index + 1], 32);
      index += 1;
      continue;
    }

    if (arg === "--checkpoint-every") {
      options.checkpointEvery = parsePositiveIntegerFlag(arg, argv[index + 1], 1_000);
      index += 1;
      continue;
    }

    if (arg === "--max-node-retries") {
      options.maxNodeRetries = parseNonNegativeIntegerFlag(arg, argv[index + 1], 20);
      index += 1;
      continue;
    }

    if (arg === "--resume") {
      options.resumePath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.outputPath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for dump-bonjour-auth-handles: ${arg}`);
  }

  return options;
}

export async function runDumpBonjourAuthHandlesCommand(argv: string[]) {
  const options = parseDumpBonjourAuthHandlesArgs(argv);

  if (options.help) {
    console.log(DUMP_BONJOUR_AUTH_HANDLES_HELP_TEXT);
    return;
  }

  const token = process.env.BONJOUR_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing BONJOUR_TOKEN in local environment.");
  }

  if (
    options.resumePath &&
    options.outputPath &&
    resolve(options.resumePath) !== resolve(options.outputPath)
  ) {
    throw new Error("--resume and --output must point to the same directory when both are used.");
  }

  const outputDir = options.resumePath
    ? resolve(options.resumePath)
    : options.outputPath
      ? resolve(options.outputPath)
      : buildDefaultOutputPath();
  await mkdir(outputDir, { recursive: true });

  const clientPool = Array.from(
    { length: Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY) },
    () =>
      new BonjourClient({
        authToken: token,
        requestDelay: 250,
        maxRetries: 2,
        timeout: 30_000
      })
  );
  const primaryClient = clientPool[0]!;

  let runtime: RuntimeState;
  const prefetchedResponses = new Map<string, BonjourFriendLinkResponse>();

  if (options.resumePath) {
    const resumed = await loadResumeState(outputDir);
    runtime = {
      outputDir,
      seedHandles: resumed.manifest.seedHandles,
      selfHandle: resumed.manifest.selfHandle ?? undefined,
      depth: options.depth ?? resumed.manifest.depth,
      maxNodes: options.maxNodes ?? resumed.manifest.maxNodes,
      concurrency: options.concurrency ?? resumed.manifest.concurrency,
      checkpointEvery:
        options.checkpointEvery ?? resumed.manifest.checkpointEvery ?? DEFAULT_CHECKPOINT_EVERY,
      maxNodeRetries:
        options.maxNodeRetries ?? resumed.manifest.maxNodeRetries ?? DEFAULT_MAX_NODE_RETRIES,
      accumulators: resumed.accumulators,
      responseRecords: resumed.responseRecords,
      fetchedHandles: resumed.fetchedHandles,
      errors: resumed.errors,
      currentDepth: resumed.frontier.currentDepth,
      pendingCurrentDepth: resumed.frontier.pendingCurrentDepth,
      pendingRetry: resumed.frontier.pendingRetry,
      queuedNextDepth: resumed.frontier.queuedNextDepth,
      retryCounts: new Map(Object.entries(resumed.frontier.retryCounts ?? {}))
    };
  } else {
    const requestedSeeds = dedupeHandles([
      ...options.seedHandles,
      ...((options.seedFilePath && (await loadSeedHandlesFromFile(resolve(options.seedFilePath)))) ??
        [])
    ]);
    let selfHandle: string | undefined;

    if (requestedSeeds.length === 0) {
      const ownProfile = await primaryClient.fetchOwnProfile();
      selfHandle = ownProfile.profile_link?.trim();
      if (!selfHandle) {
        throw new Error("Authenticated /user/profile did not return a usable profile_link.");
      }

      prefetchedResponses.set(selfHandle, await primaryClient.fetchFriendLinks());
      requestedSeeds.push(selfHandle);
    }

    const accumulators = new Map<string, HandleAccumulator>();
    for (const handle of requestedSeeds) {
      getOrCreateAccumulator(accumulators, handle, 0);
    }

    runtime = {
      outputDir,
      seedHandles: requestedSeeds,
      selfHandle,
      depth: options.depth ?? DEFAULT_DEPTH,
      maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      checkpointEvery: options.checkpointEvery ?? DEFAULT_CHECKPOINT_EVERY,
      maxNodeRetries: options.maxNodeRetries ?? DEFAULT_MAX_NODE_RETRIES,
      accumulators,
      responseRecords: [],
      fetchedHandles: new Set<string>(),
      errors: [],
      currentDepth: 0,
      pendingCurrentDepth: [...requestedSeeds],
      pendingRetry: [],
      queuedNextDepth: [],
      retryCounts: new Map<string, number>()
    };

    await persistCheckpoint(runtime, "running");
  }

  const queuedHandles = new Set(runtime.accumulators.keys());

  while (runtime.currentDepth <= runtime.depth) {
    if (runtime.fetchedHandles.size >= runtime.maxNodes) {
      break;
    }

    if (runtime.pendingCurrentDepth.length === 0 && runtime.pendingRetry.length > 0) {
      runtime.pendingCurrentDepth = [...runtime.pendingRetry];
      runtime.pendingRetry = [];
      await persistCheckpoint(runtime, "running");
    }

    if (runtime.pendingCurrentDepth.length === 0) {
      if (runtime.currentDepth >= runtime.depth || runtime.queuedNextDepth.length === 0) {
        break;
      }

      runtime.currentDepth += 1;
      runtime.pendingCurrentDepth = runtime.queuedNextDepth.filter(
        (handle) => !runtime.fetchedHandles.has(handle)
      );
      runtime.pendingRetry = [];
      runtime.queuedNextDepth = [];
      await persistCheckpoint(runtime, "running");
      continue;
    }

    const remainingBudget = runtime.maxNodes - runtime.fetchedHandles.size;
    if (remainingBudget <= 0) {
      break;
    }

    const batch = runtime.pendingCurrentDepth.splice(
      0,
      Math.min(runtime.checkpointEvery, remainingBudget, runtime.pendingCurrentDepth.length)
    );

    const levelResults = await mapWithConcurrency(
      batch,
      runtime.concurrency,
      async (handle, _index, workerIndex) => {
        try {
          const response =
            prefetchedResponses.get(handle) ??
            (await clientPool[workerIndex]!.fetchFriendLinks(handle));
          prefetchedResponses.delete(handle);
          const filePath = resolve(runtime.outputDir, "friend-links", `${encodeURIComponent(handle)}.json`);
          await writeJsonFile(filePath, response);
          return {
            ok: true as const,
            handle,
            response,
            filePath
          };
        } catch (error) {
          return {
            ok: false as const,
            handle,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    );

    for (const result of levelResults) {
      if (!result.ok) {
        const nextAttempt = (runtime.retryCounts.get(result.handle) ?? 0) + 1;
        runtime.retryCounts.set(result.handle, nextAttempt);
        const willRetry = nextAttempt <= runtime.maxNodeRetries;

        runtime.errors.push({
          handle: result.handle,
          depth: runtime.currentDepth,
          attempt: nextAttempt,
          error: result.error,
          willRetry,
          recordedAt: new Date().toISOString()
        });

        if (willRetry) {
          runtime.pendingRetry.push(result.handle);
        }

        continue;
      }

      runtime.retryCounts.delete(result.handle);
      runtime.fetchedHandles.add(result.handle);
      const neighbors = collectNeighborEntries(result.response);
      runtime.responseRecords.push({
        handle: result.handle,
        depth: runtime.currentDepth,
        direct: result.response.friend?.length ?? 0,
        reverse: result.response.friended?.length ?? 0,
        totalNeighbors: neighbors.length,
        filePath: resolve(result.filePath).replace(`${runtime.outputDir}/`, "")
      });

      for (const neighbor of neighbors) {
        const handle = neighbor.profile_link?.trim();
        if (!handle) {
          continue;
        }

        const accumulator = getOrCreateAccumulator(
          runtime.accumulators,
          handle,
          runtime.currentDepth + 1
        );
        accumulator.incomingEdges += 1;
        accumulator.discoveredFrom.add(result.handle);

        if (neighbor.name?.trim()) {
          accumulator.profileNames.add(neighbor.name.trim());
        }

        if (neighbor.description?.trim()) {
          accumulator.profileDescriptions.add(neighbor.description.trim());
        }

        if (runtime.currentDepth < runtime.depth && !queuedHandles.has(handle)) {
          runtime.queuedNextDepth.push(handle);
          queuedHandles.add(handle);
        }
      }
    }

    await persistCheckpoint(runtime, "running");
  }

  const status: PersistedManifest["status"] =
    runtime.fetchedHandles.size >= runtime.maxNodes ? "max_nodes_reached" : "completed";

  await persistCheckpoint(runtime, status);

  const paths = buildPaths(outputDir);
  console.log(
    JSON.stringify(
      {
        outputDir,
        status,
        seedHandles: runtime.seedHandles.length,
        depth: runtime.depth,
        fetchedNodes: runtime.fetchedHandles.size,
        discoveredHandles: runtime.accumulators.size,
        handlesPath: paths.handlesPath,
        importHandlesPath: paths.importHandlesPath,
        fetchIndexPath: paths.fetchIndexPath,
        manifestPath: paths.manifestPath
      },
      null,
      2
    )
  );
}
