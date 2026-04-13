import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  completeSourceSyncRun,
  createDatabaseConnection,
  getIdentityBySourceProfileId,
  isHandleOptedOut,
  listSourceProfilesByHandles,
  profileToUpsertPayload,
  startSourceSyncRun,
  upsertSourceProfile,
  type SeekuDatabase
} from "@seeku/db";
import {
  computeProfileHash,
  normalizeBonjourProfile,
  type BonjourProfile
} from "@seeku/adapters";
import {
  runBackfillPersonFieldsWorker,
  runEvidenceStorageWorker,
  runIdentityResolutionWorker,
  runSearchIndexWorker
} from "@seeku/workers";

export const IMPORT_BONJOUR_DUMP_HELP_TEXT = `Seeku import-bonjour-dump

Usage:
  seeku import-bonjour-dump [options]

Behavior:
  - Import raw Bonjour profile JSON dumped by seek-zju or other compatible crawlers.
  - Normalize every profile with Seeku's current Bonjour adapter logic.
  - Upsert into source_profiles without re-fetching Bonjour online.
  - Optionally run the local non-LLM pipeline: resolve identities, store evidence,
    backfill person fields, and rebuild search documents.

Options:
  --dump-dir <path>             Dump directory containing manifest.json / profiles/
  --manifest <path>             Explicit manifest.json path
  --limit <number>              Optional cap on imported profiles
  --concurrency <number>        Parallel profile import workers. Default: 8
  --job-name <name>             Override sync run job name
  --run-local-pipeline          After import, run resolve/evidence/backfill/search-index
  --pipeline-batch-size <num>   Batch size for local pipeline steps. Default: 250
  -h, --help                    Show command help`;

interface ImportBonjourDumpOptions {
  dumpDir?: string;
  manifestPath?: string;
  limit?: number;
  concurrency: number;
  jobName?: string;
  runLocalPipeline: boolean;
  pipelineBatchSize: number;
  help: boolean;
}

interface DumpManifestLike {
  outputDir?: string;
  profilesIndexPath?: string | null;
}

interface DumpProfileRecord {
  handle: string;
  filePath?: string;
  error?: string;
}

interface ImportBonjourDumpSummary {
  runId: string;
  status: "succeeded" | "failed" | "partial";
  discoveredCount: number;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  dumpDir: string;
  pipeline?: {
    handlesResolved: number;
    personCount: number;
    evidenceItemsCreated: number;
    personsUpdated: number;
    searchDocumentsUpdated: number;
  };
}

function isEnoentError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
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

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function loadProfileRecords(dumpDir: string, manifestPath?: string) {
  const resolvedManifestPath = manifestPath
    ? resolve(manifestPath)
    : resolve(dumpDir, "manifest.json");
  const manifest = await readJsonFile<DumpManifestLike>(resolvedManifestPath);

  if (manifest.profilesIndexPath) {
    const profilesIndexPath = resolve(dumpDir, manifest.profilesIndexPath);
    const profileRecords = await readJsonFile<DumpProfileRecord[]>(profilesIndexPath);
    return profileRecords.filter((record): record is Required<Pick<DumpProfileRecord, "handle" | "filePath">> & DumpProfileRecord =>
      Boolean(record.handle?.trim() && record.filePath?.trim())
    );
  }

  const profileDir = resolve(dumpDir, "profiles");
  const profileFiles = await readdir(profileDir, { withFileTypes: true });
  return profileFiles
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => ({
      handle: decodeURIComponent(entry.name.replace(/\.json$/i, "")),
      filePath: `profiles/${entry.name}`
    }));
}

async function importProfileRecord(
  db: SeekuDatabase,
  dumpDir: string,
  record: { handle: string; filePath: string },
  runId: string
) {
  const profilePath = resolve(dumpDir, record.filePath);
  const rawProfile = await readJsonFile<BonjourProfile>(profilePath);
  const normalizedProfile = normalizeBonjourProfile(rawProfile);
  const optedOut = await isHandleOptedOut(db, "bonjour", normalizedProfile.sourceHandle);

  await upsertSourceProfile(
    db,
    profileToUpsertPayload(
      normalizedProfile,
      rawProfile,
      computeProfileHash(rawProfile),
      runId,
      optedOut
    )
  );

  return normalizedProfile.sourceHandle;
}

async function collectResolvedPersonIds(
  db: SeekuDatabase,
  handles: string[]
): Promise<string[]> {
  const profiles = await listSourceProfilesByHandles(db, "bonjour", handles);
  const identities = await Promise.all(
    profiles.map((profile) => getIdentityBySourceProfileId(db, profile.id))
  );

  return unique(
    identities
      .map((identity) => identity?.personId)
      .filter((personId): personId is string => Boolean(personId))
  );
}

async function runInBatches<T>(
  values: string[],
  batchSize: number,
  task: (batch: string[]) => Promise<T>
) {
  const results: T[] = [];

  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    results.push(await task(batch));
  }

  return results;
}

async function runLocalPipelineForImportedHandles(
  db: SeekuDatabase,
  handles: string[],
  batchSize: number
) {
  const uniqueHandles = unique(handles);

  await runInBatches(uniqueHandles, batchSize, async (batch) => {
    await runIdentityResolutionWorker(batch, [], db);
    return null;
  });

  const personIds = await collectResolvedPersonIds(db, uniqueHandles);

  const evidenceSummaries = await runInBatches(personIds, batchSize, async (batch) => {
    return runEvidenceStorageWorker(batch, db);
  });

  const backfillSummaries = await runInBatches(personIds, batchSize, async (batch) => {
    return runBackfillPersonFieldsWorker(batch, db);
  });

  const searchSummaries = await runInBatches(personIds, batchSize, async (batch) => {
    return runSearchIndexWorker(batch, db);
  });

  return {
    handlesResolved: uniqueHandles.length,
    personCount: personIds.length,
    evidenceItemsCreated: evidenceSummaries.reduce((sum, item) => sum + item.itemsCreated, 0),
    personsUpdated: backfillSummaries.reduce((sum, item) => sum + item.personsUpdated, 0),
    searchDocumentsUpdated: searchSummaries.reduce(
      (sum, item) => sum + item.documentsUpserted,
      0
    )
  };
}

export function parseImportBonjourDumpArgs(argv: string[]): ImportBonjourDumpOptions {
  const options: ImportBonjourDumpOptions = {
    concurrency: 8,
    runLocalPipeline: false,
    pipelineBatchSize: 250,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--run-local-pipeline") {
      options.runLocalPipeline = true;
      continue;
    }

    if (arg === "--dump-dir") {
      options.dumpDir = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--manifest") {
      options.manifestPath = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveIntegerFlag(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = parsePositiveIntegerFlag(arg, argv[index + 1], 64);
      index += 1;
      continue;
    }

    if (arg === "--job-name") {
      options.jobName = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--pipeline-batch-size") {
      options.pipelineBatchSize = parsePositiveIntegerFlag(arg, argv[index + 1], 2_000);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runImportBonjourDumpCommand(argv: string[]) {
  const options = parseImportBonjourDumpArgs(argv);

  if (options.help) {
    console.log(IMPORT_BONJOUR_DUMP_HELP_TEXT);
    return;
  }

  const dumpDir = resolve(
    options.dumpDir ?? (options.manifestPath ? dirname(resolve(options.manifestPath)) : ".")
  );
  const profileRecords = await loadProfileRecords(dumpDir, options.manifestPath);
  const targetRecords = (options.limit ? profileRecords.slice(0, options.limit) : profileRecords).map(
    (record) => ({
      handle: record.handle.trim(),
      filePath: record.filePath!.trim()
    })
  );

  const ownedConnection = createDatabaseConnection();
  const db = ownedConnection.db;
  const run = await startSourceSyncRun(db, {
    source: "bonjour",
    jobName: options.jobName ?? "bonjour.import.dump",
    cursor: {
      dumpDir
    }
  });

  const importedHandles: string[] = [];
  const errors: Array<{ handle?: string; message: string }> = [];
  let processedCount = 0;
  let skippedCount = 0;

  try {
    for (let index = 0; index < targetRecords.length; index += options.concurrency) {
      const batch = targetRecords.slice(index, index + options.concurrency);
      const results = await Promise.all(
        batch.map(async (record) => {
          try {
            const sourceHandle = await importProfileRecord(db, dumpDir, record, run.id);
            return {
              ok: true as const,
              sourceHandle
            };
          } catch (error) {
            if (isEnoentError(error)) {
              return {
                ok: false as const,
                skipped: true as const,
                handle: record.handle,
                message: `Missing profile file: ${record.filePath}`
              };
            }

            return {
              ok: false as const,
              skipped: false as const,
              handle: record.handle,
              message: error instanceof Error ? error.message : String(error)
            };
          }
        })
      );

      for (const result of results) {
        if (result.ok) {
          processedCount += 1;
          importedHandles.push(result.sourceHandle);
        } else if (result.skipped) {
          skippedCount += 1;
        } else {
          errors.push({
            handle: result.handle,
            message: result.message
          });
        }
      }
    }

    const pipeline = options.runLocalPipeline
      ? await runLocalPipelineForImportedHandles(db, importedHandles, options.pipelineBatchSize)
      : undefined;

    const status =
      errors.length === 0 ? "succeeded" : processedCount > 0 ? "partial" : "failed";

    await completeSourceSyncRun(db, {
      runId: run.id,
      status,
      cursor: {
        dumpDir
      },
      stats: {
        discoveredCount: targetRecords.length,
        processedCount,
        skippedCount,
        errorCount: errors.length,
        importedHandleCount: unique(importedHandles).length,
        pipeline
      },
      errorMessage: errors[0]?.message
    });

    const summary: ImportBonjourDumpSummary = {
      runId: run.id,
      status,
      discoveredCount: targetRecords.length,
      processedCount,
      skippedCount,
      errorCount: errors.length,
      dumpDir,
      pipeline
    };

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await completeSourceSyncRun(db, {
      runId: run.id,
      status: "failed",
      cursor: {
        dumpDir
      },
      stats: {
        discoveredCount: targetRecords.length,
        processedCount,
        errorCount: errors.length + 1
      },
      errorMessage: message
    });

    throw error;
  } finally {
    await ownedConnection.close();
  }
}
