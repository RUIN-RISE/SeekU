import "dotenv/config";

import {
  runEvidenceStorageWorker,
  runGithubSync,
  runIdentityResolutionWorker
} from "@seeku/workers";

import { runBonjourSyncJob } from "./index.js";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      positionals.push(value);
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

  return { args, flags, positionals };
}

function parseCursor(raw: string | undefined) {
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const parsed = parseArgs(rest);

  const limit = Number(parsed.args.get("limit") ?? "20");
  const handles = parsed.args.get("handles")?.split(",").map((value) => value.trim());
  const cursor = parseCursor(parsed.args.get("cursor"));
  const jobName = parsed.args.get("job-name");

  let result: unknown;

  if (command === "sync-bonjour") {
    result = await runBonjourSyncJob({
      limit,
      cursor,
      handles,
      jobName
    });
  } else if (command === "sync-github") {
    result = await runGithubSync(handles ?? [], { limit });
  } else if (command === "resolve-identities") {
    const bonjourHandles = parsed.args
      .get("bonjour-handles")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const githubHandles = parsed.args
      .get("github-handles")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    result = await runIdentityResolutionWorker(bonjourHandles, githubHandles);
  } else if (command === "store-evidence") {
    const personIds = parsed.args
      .get("person-ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    result = await runEvidenceStorageWorker(personIds);
  } else {
    throw new Error(
      "Unknown command. Use one of: sync-bonjour, sync-github, resolve-identities, store-evidence"
    );
  }

  console.log(JSON.stringify(result, null, 2));
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
  process.exitCode = 1;
});
