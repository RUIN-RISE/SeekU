import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDatabaseConnection,
  graphEdges,
  graphNodeFeatures,
  personIdentities,
  sourceProfiles,
  eq,
  sql,
  type SeekuDatabase
} from "@seeku/db";

export const IMPORT_GRAPH_EDGES_HELP_TEXT = `Seeku import-graph-edges

Usage:
  seeku import-graph-edges [options]

Behavior:
  - Import friend/friended edges from Bonjour crawl artifacts into graph_edges table.
  - Map handles to source_profiles, then to persons via person_identities.
  - Only import edges where both ends map to known persons.
  - Record drop reasons for unmappable edges.

Options:
  --dump-dir <path>             Friend-link crawl output directory (e.g., output/bonjour-raw/2026-05-02/bonjour-frontier-2026-05-02)
  --limit <number>              Optional cap on processed files
  --job-name <name>             Job name for logging
  --dry-run                     Show what would be imported without making changes
  -h, --help                    Show command help`;

interface ImportGraphEdgesOptions {
  dumpDir?: string;
  limit?: number;
  jobName?: string;
  dryRun: boolean;
  help: boolean;
}

interface FriendLinkEntry {
  profile_link: string;
  name?: string;
  avatar?: string;
  description?: string;
  create_time?: string;
}

interface FriendLinkResponse {
  friend?: FriendLinkEntry[];
  friended?: FriendLinkEntry[];
}

interface EdgeImportSummary {
  status: "succeeded" | "failed" | "partial";
  dumpDir: string;
  filesScanned: number;
  rawEdgesParsed: number;
  uniqueHandlePairs: number;
  edgesPrepared: number;
  edgesInserted: number;
  edgesSkipped: number;
  dropReasons: {
    missingSourceHandle: number;
    missingTargetHandle: number;
    sourceProfileNoPerson: number;
    targetProfileNoPerson: number;
    duplicateEdge: number;
    malformedRecord: number;
  };
  personsInGraph: number;
  errors: Array<{ file: string; message: string }>;
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

function parseImportGraphEdgesArgs(argv: string[]): ImportGraphEdgesOptions {
  const options: ImportGraphEdgesOptions = {
    dryRun: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--dump-dir") {
      options.dumpDir = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveIntegerFlag(arg, argv[index + 1], 100_000);
      index += 1;
      continue;
    }

    if (arg === "--job-name") {
      options.jobName = requireFlagValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function loadFriendLinkFiles(dumpDir: string, limit?: number): Promise<Map<string, FriendLinkResponse>> {
  const friendLinksDir = resolve(dumpDir, "friend-links");
  const entries = await readdir(friendLinksDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .slice(0, limit ?? Infinity);

  const results = new Map<string, FriendLinkResponse>();

  for (const fileName of files) {
    const filePath = resolve(friendLinksDir, fileName);
    const handle = fileName.replace(".json", "");
    const payload = await readJsonFile<FriendLinkResponse>(filePath);
    results.set(handle, payload);
  }

  return results;
}

interface HandleToPersonMap {
  handle: string;
  profileId: string;
  personId: string;
}

async function buildHandleToPersonMap(db: SeekuDatabase): Promise<Map<string, HandleToPersonMap>> {
  const result = await db
    .select({
      handle: sourceProfiles.sourceHandle,
      profileId: sourceProfiles.id,
      personId: personIdentities.personId
    })
    .from(sourceProfiles)
    .innerJoin(personIdentities, eq(sourceProfiles.id, personIdentities.sourceProfileId))
    .where(eq(sourceProfiles.source, "bonjour"));

  const map = new Map<string, HandleToPersonMap>();
  for (const row of result) {
    // If a handle maps to multiple persons, keep the first one
    if (!map.has(row.handle)) {
      map.set(row.handle, {
        handle: row.handle,
        profileId: row.profileId,
        personId: row.personId
      });
    }
  }

  return map;
}

interface ParsedEdge {
  sourceHandle: string;
  targetHandle: string;
  edgeType: "friend" | "friended";
}

function parseEdgesFromFiles(files: Map<string, FriendLinkResponse>): ParsedEdge[] {
  const edges: ParsedEdge[] = [];

  for (const [fileHandle, payload] of files) {
    // fileHandle is the person whose friend-links we're reading
    //
    // Bonjour semantics:
    // - "friend" array: people that fileHandle follows (fileHandle is the follower)
    //   → edge: fileHandle (source/follower) → targetHandle (target/followed), type='friend'
    // - "friended" array: people that follow fileHandle (fileHandle is the followed)
    //   → edge: targetHandle (source/follower) → fileHandle (target/followed), type='friended'
    //
    // In graph_edges table:
    // - source_person_id: the one who initiates the follow (follower)
    // - target_person_id: the one being followed (followed)
    // - edge_type: 'friend' means source follows target
    //              'friended' means source follows target (but we discovered this from target's perspective)

    // friend: fileHandle follows these handles
    for (const entry of payload.friend ?? []) {
      const targetHandle = entry.profile_link?.trim();
      if (targetHandle) {
        edges.push({
          sourceHandle: fileHandle,    // follower
          targetHandle,                // followed
          edgeType: "friend"
        });
      }
    }

    // friended: these handles follow fileHandle
    for (const entry of payload.friended ?? []) {
      const sourceHandle = entry.profile_link?.trim();  // the follower
      if (sourceHandle) {
        edges.push({
          sourceHandle,                // follower
          targetHandle: fileHandle,    // followed (fileHandle)
          edgeType: "friended"
        });
      }
    }
  }

  return edges;
}

export async function runImportGraphEdgesCommand(argv: string[]): Promise<EdgeImportSummary> {
  const options = parseImportGraphEdgesArgs(argv);

  if (options.help) {
    console.log(IMPORT_GRAPH_EDGES_HELP_TEXT);
    return {
      status: "succeeded",
      dumpDir: "",
      filesScanned: 0,
      rawEdgesParsed: 0,
      uniqueHandlePairs: 0,
      edgesPrepared: 0,
      edgesInserted: 0,
      edgesSkipped: 0,
      dropReasons: {
        missingSourceHandle: 0,
        missingTargetHandle: 0,
        sourceProfileNoPerson: 0,
        targetProfileNoPerson: 0,
        duplicateEdge: 0,
        malformedRecord: 0
      },
      personsInGraph: 0,
      errors: []
    };
  }

  if (!options.dumpDir) {
    throw new Error("Missing --dump-dir <path>.");
  }

  const dumpDir = resolve(options.dumpDir);
  console.log(`Loading friend-link files from ${dumpDir}...`);

  const files = await loadFriendLinkFiles(dumpDir, options.limit);
  console.log(`Loaded ${files.size} friend-link files.`);

  const rawEdges = parseEdgesFromFiles(files);
  console.log(`Parsed ${rawEdges.length} raw edges.`);

  // Deduplicate edges
  const edgeKey = (e: ParsedEdge) => `${e.sourceHandle}:${e.targetHandle}:${e.edgeType}`;
  const uniqueEdges = new Map<string, ParsedEdge>();
  for (const edge of rawEdges) {
    const key = edgeKey(edge);
    if (!uniqueEdges.has(key)) {
      uniqueEdges.set(key, edge);
    }
  }
  console.log(`Unique edges after dedup: ${uniqueEdges.size}.`);

  const ownedConnection = createDatabaseConnection();
  const db = ownedConnection.db;

  const summary: EdgeImportSummary = {
    status: "succeeded",
    dumpDir,
    filesScanned: files.size,
    rawEdgesParsed: rawEdges.length,
    uniqueHandlePairs: uniqueEdges.size,
    edgesPrepared: 0,
    edgesInserted: 0,
    edgesSkipped: 0,
    dropReasons: {
      missingSourceHandle: 0,
      missingTargetHandle: 0,
      sourceProfileNoPerson: 0,
      targetProfileNoPerson: 0,
      duplicateEdge: 0,
      malformedRecord: 0
    },
    personsInGraph: 0,
    errors: []
  };

  try {
    console.log("Building handle-to-person map...");
    const handleToPerson = await buildHandleToPersonMap(db);
    console.log(`Handle-to-person map size: ${handleToPerson.size}`);

    // Track which persons have edges
    const personsWithEdges = new Set<string>();

    // Prepare edges for insertion
    const edgesToInsert: Array<{
      sourcePersonId: string;
      targetPersonId: string;
      edgeType: "friend" | "friended";
      sourceProfileId: string | null;
    }> = [];

    for (const edge of uniqueEdges.values()) {
      const sourceMapping = handleToPerson.get(edge.sourceHandle);
      const targetMapping = handleToPerson.get(edge.targetHandle);

      if (!sourceMapping) {
        summary.dropReasons.missingSourceHandle += 1;
        continue;
      }

      if (!targetMapping) {
        summary.dropReasons.missingTargetHandle += 1;
        continue;
      }

      edgesToInsert.push({
        sourcePersonId: sourceMapping.personId,
        targetPersonId: targetMapping.personId,
        edgeType: edge.edgeType,
        sourceProfileId: sourceMapping.profileId
      });

      personsWithEdges.add(sourceMapping.personId);
      personsWithEdges.add(targetMapping.personId);
    }

    console.log(`Edges ready for insertion: ${edgesToInsert.length}`);
    console.log(`Drop reasons:`, summary.dropReasons);

    summary.edgesPrepared = edgesToInsert.length;

    if (options.dryRun) {
      console.log("Dry run - not inserting edges.");
      summary.personsInGraph = personsWithEdges.size;
      return summary;
    }

    // Clear existing edges
    console.log("Clearing existing graph edges...");
    await db.delete(graphEdges);

    // Insert edges in batches
    const BATCH_SIZE = 1000;
    let insertedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < edgesToInsert.length; i += BATCH_SIZE) {
      const batch = edgesToInsert.slice(i, i + BATCH_SIZE);

      // Insert batch and count actual insertions
      for (const edge of batch) {
        const result = await db.insert(graphEdges).values({
          sourcePersonId: edge.sourcePersonId,
          targetPersonId: edge.targetPersonId,
          edgeType: edge.edgeType,
          sourceProfileId: edge.sourceProfileId
        }).onConflictDoNothing().returning({ id: graphEdges.id });

        if (result.length > 0) {
          insertedCount += 1;
        } else {
          skippedCount += 1;
        }
      }

      console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(edgesToInsert.length / BATCH_SIZE)}`);
    }

    // Verify actual count in database
    const actualCount = await db.select({ count: sql<number>`COUNT(*)` }).from(graphEdges);
    const dbCount = Number(actualCount[0]?.count ?? 0);

    summary.edgesInserted = dbCount;
    summary.edgesSkipped = skippedCount;
    summary.personsInGraph = personsWithEdges.size;

    console.log(`Prepared: ${summary.edgesPrepared}, Inserted: ${summary.edgesInserted}, Skipped: ${summary.edgesSkipped}`);
    console.log(`Persons in graph: ${summary.personsInGraph}`);

    return summary;
  } finally {
    await ownedConnection.close();
  }
}
