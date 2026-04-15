import { spawn } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type QuerySpec = {
  id: string;
  query: string;
  purpose: string;
};

type QueryRunStatus = "pending" | "pass" | "failed" | "skipped";

type QueryRunRecord = {
  id: string;
  query: string;
  purpose: string;
  command: string;
  outputFile: string;
  stderrFile?: string;
  status: QueryRunStatus;
  exitCode?: number;
  skippedReason?: string;
};

type RunManifest = {
  schemaVersion: 1;
  generatedAtUtc: string;
  completedAtUtc?: string;
  workspace: string;
  snapshotDir: string;
  queryPack: "ws4";
  limit: number;
  dryRun: boolean;
  resume: boolean;
  overwrite: boolean;
  selectedQueryIds: string[];
  commands: QueryRunRecord[];
};

const WS4_QUERY_PACK: QuerySpec[] = [
  {
    id: "Q1",
    query: "杭州 LLM 工程师",
    purpose: "broad retrieval for the current core market surface"
  },
  {
    id: "Q2",
    query: "AI infra backend engineer",
    purpose: "engineering-depth retrieval rather than generic AI profile text"
  },
  {
    id: "Q3",
    query: "杭州 AI Agent 开发者",
    purpose: "builder-style retrieval for the current product framing"
  },
  {
    id: "Q4",
    query: "RAG 检索工程师",
    purpose: "query-specific retrieval for RAG / retrieval engineering"
  },
  {
    id: "Q5",
    query: "多模态 计算机视觉 工程师",
    purpose: "specialization coverage outside pure LLM labeling"
  },
  {
    id: "Q6",
    query: "GitHub 上活跃的 ML engineer",
    purpose: "explicit GitHub-biased retrieval and source visibility"
  },
  {
    id: "Q7",
    query: "浙大 AI builder",
    purpose: "ZJU-adjacent retrieval against the GitHub-heavy thesis"
  },
  {
    id: "Q8",
    query: "开源 AI founder 或 tech lead",
    purpose: "seniority plus builder-style retrieval"
  }
];

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  return { args, flags };
}

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected a positive integer, received: ${raw}`);
  }

  return value;
}

function formatDateForPath(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function shellEscape(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toDisplayPath(workspace: string, targetPath: string) {
  const relativePath = relative(workspace, targetPath);
  if (relativePath === "") {
    return ".";
  }

  return relativePath.startsWith("..") ? targetPath : relativePath;
}

async function pathExists(path: string) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectoryEmpty(path: string) {
  const entries = await readdir(path);
  return entries.length === 0;
}

async function runCommand(command: string[], cwd: string) {
  return await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout,
        stderr
      });
    });
  });
}

async function writeManifest(path: string, manifest: RunManifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const workspace = resolve(scriptDir, "..");
  const snapshotsRoot = resolve(workspace, ".planning/github-expansion/snapshots");
  const label = args.get("label");
  const limit = parsePositiveInteger(args.get("limit"), 10);
  const dryRun = flags.has("dry-run");
  const resume = flags.has("resume");
  const overwrite = flags.has("overwrite");

  const selectedQueryIds = (args.get("query-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const unknownQueryIds = selectedQueryIds.filter((id) => !WS4_QUERY_PACK.some((query) => query.id === id));
  if (unknownQueryIds.length > 0) {
    throw new Error(`Unknown query ids: ${unknownQueryIds.join(", ")}`);
  }

  const selectedQueries =
    selectedQueryIds.length > 0
      ? WS4_QUERY_PACK.filter((query) => selectedQueryIds.includes(query.id))
      : WS4_QUERY_PACK;

  if (selectedQueries.length === 0) {
    throw new Error("No queries selected for execution.");
  }

  const snapshotDir = args.get("snapshot-dir")
    ? resolve(workspace, args.get("snapshot-dir")!)
    : resolve(
        snapshotsRoot,
        `ws4-rerun-${formatDateForPath(new Date())}${label ? `-${slugify(label)}` : ""}`
      );

  await mkdir(snapshotDir, { recursive: true });

  if (!resume && !overwrite && !(await isDirectoryEmpty(snapshotDir))) {
    throw new Error(
      `Snapshot directory is not empty: ${snapshotDir}. Re-run with --resume, --overwrite, or a new --snapshot-dir.`
    );
  }

  const manifestPath = resolve(snapshotDir, "RUN-MANIFEST.json");
  const manifest: RunManifest = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    workspace,
    snapshotDir: toDisplayPath(workspace, snapshotDir),
    queryPack: "ws4",
    limit,
    dryRun,
    resume,
    overwrite,
    selectedQueryIds: selectedQueries.map((query) => query.id),
    commands: selectedQueries.map((query) => ({
      id: query.id,
      query: query.query,
      purpose: query.purpose,
      command: [
        process.execPath,
        "--import",
        "tsx/esm",
        "apps/worker/src/cli.ts",
        "search",
        query.query,
        "--json",
        "--limit",
        String(limit)
      ]
        .map(shellEscape)
        .join(" "),
      outputFile: toDisplayPath(workspace, resolve(snapshotDir, `${query.id}.json`)),
      status: "pending"
    }))
  };

  await writeManifest(manifestPath, manifest);

  if (dryRun) {
    manifest.completedAtUtc = new Date().toISOString();
    await writeManifest(manifestPath, manifest);
    console.log(
      JSON.stringify(
        {
          status: "dry-run",
          snapshotDir: manifest.snapshotDir,
          commandCount: manifest.commands.length,
          selectedQueryIds: manifest.selectedQueryIds,
          manifest: toDisplayPath(workspace, manifestPath)
        },
        null,
        2
      )
    );
    return;
  }

  for (const record of manifest.commands) {
    const outputPath = resolve(workspace, record.outputFile);
    const stderrPath = resolve(snapshotDir, `${record.id}.stderr.log`);

    if (!overwrite && (await pathExists(outputPath))) {
      if (resume) {
        record.status = "skipped";
        record.skippedReason = "existing-output";
        if (await pathExists(stderrPath)) {
          record.stderrFile = toDisplayPath(workspace, stderrPath);
        }
        await writeManifest(manifestPath, manifest);
        continue;
      }

      throw new Error(`Refusing to overwrite existing snapshot file without --overwrite: ${outputPath}`);
    }

    const command = [
      process.execPath,
      "--import",
      "tsx/esm",
      "apps/worker/src/cli.ts",
      "search",
      record.query,
      "--json",
      "--limit",
      String(limit)
    ];
    const result = await runCommand(command, workspace);

    record.exitCode = result.exitCode;

    if (result.stderr.trim().length > 0) {
      record.stderrFile = toDisplayPath(workspace, stderrPath);
      await writeFile(stderrPath, result.stderr, "utf8");
    }

    if (result.exitCode !== 0) {
      record.status = "failed";
      await writeManifest(manifestPath, manifest);
      throw new Error(`Query ${record.id} failed with exit code ${result.exitCode}`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.stdout);
    } catch (error) {
      record.status = "failed";
      await writeFile(resolve(snapshotDir, `${record.id}.raw.txt`), result.stdout, "utf8");
      await writeManifest(manifestPath, manifest);
      throw new Error(
        `Query ${record.id} returned non-JSON stdout: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    await writeFile(outputPath, `${JSON.stringify(parsedJson, null, 2)}\n`, "utf8");
    record.status = "pass";
    await writeManifest(manifestPath, manifest);
  }

  manifest.completedAtUtc = new Date().toISOString();
  await writeManifest(manifestPath, manifest);

  console.log(
    JSON.stringify(
      {
        status: "completed",
        snapshotDir: manifest.snapshotDir,
        manifest: toDisplayPath(workspace, manifestPath),
        selectedQueryIds: manifest.selectedQueryIds,
        completed: manifest.commands.filter((record) => record.status === "pass").length,
        skipped: manifest.commands.filter((record) => record.status === "skipped").length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
