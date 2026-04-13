import { createDatabaseConnection } from "@seeku/db";
import { GithubScanner } from "@seeku/workers";

export interface ScanGithubZjuOptions {
  limit?: number;
  perPage?: number;
  autoSync?: boolean;
  startPage?: number;
  pageLimit?: number;
  query?: string;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export async function runScanGithubZjuCli(options: ScanGithubZjuOptions = {}) {
  const { db, close } = createDatabaseConnection();

  try {
    const scanner = new GithubScanner(db);
    const result = await scanner.scanZjuNetwork({
      limit: options.limit ?? 100,
      perPage: options.perPage ?? 30,
      autoSync: options.autoSync ?? true,
      startPage: options.startPage ?? 1,
      pageLimit: options.pageLimit,
      query: options.query
    });

    return {
      limit: options.limit ?? 100,
      perPage: options.perPage ?? 30,
      autoSync: options.autoSync ?? true,
      startPage: options.startPage ?? 1,
      pageLimit: options.pageLimit,
      query: options.query,
      ...result
    };
  } finally {
    await close();
  }
}

export async function runScanGithubZjuCommand(parsed: {
  args: Map<string, string>;
  flags: Set<string>;
}) {
  return runScanGithubZjuCli({
    limit: Number(parsed.args.get("limit") ?? "100"),
    perPage: Number(parsed.args.get("per-page") ?? "30"),
    startPage: Number(parsed.args.get("start-page") ?? "1"),
    pageLimit: parsed.args.has("page-limit")
      ? Number(parsed.args.get("page-limit"))
      : undefined,
    query: parsed.args.get("query")?.trim() || undefined,
    autoSync: parsed.flags.has("no-sync")
      ? false
      : parseBooleanFlag(parsed.args.get("auto-sync"), true)
  });
}
