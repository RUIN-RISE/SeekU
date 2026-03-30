import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Load .env from project root (monorepo aware, ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../../.env") });
import chalk from "chalk";

import {
  runEvidenceStorageWorker,
  runGithubSync,
  runIdentityResolutionWorker,
  runSearchEmbeddingWorker,
  runSearchIndexWorker,
  runSearchRebuildWorker
} from "@seeku/workers";

import { runBonjourSyncJob } from "./index.js";
import { runSearchCli, runShowCli } from "./search-cli.js";
import { runInteractiveSearch } from "./cli/index.js";

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
  const knownCommands = new Set([
    "help",
    "version",
    "sync-bonjour",
    "sync-github",
    "resolve-identities",
    "store-evidence",
    "search-index",
    "search-embeddings",
    "rebuild-search",
    "search",
    "show"
  ]);

  const limit = Number(parsed.args.get("limit") ?? "20");
  const handles = parsed.args.get("handles")?.split(",").map((value) => value.trim());
  const cursor = parseCursor(parsed.args.get("cursor"));
  const jobName = parsed.args.get("job-name");

  let result: unknown;

  if (!command) {
    await runInteractiveSearch();
    return;
  }

  if (!knownCommands.has(command)) {
    await runInteractiveSearch([command, ...rest].join(" ").trim());
    return;
  }

  if (command === "version") {
    console.log(chalk.bold("Seeku CLI v1.1.0"));
    console.log(chalk.dim("Search Assistant Edition"));
    return;
  }

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
  } else if (command === "search-index") {
    const personIds = parsed.args
      .get("person-ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    result = await runSearchIndexWorker(personIds);
  } else if (command === "search-embeddings") {
    const personIds = parsed.args
      .get("person-ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    result = await runSearchEmbeddingWorker(personIds);
  } else if (command === "rebuild-search") {
    const personIds = parsed.args
      .get("person-ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    result = await runSearchRebuildWorker(personIds);
  } else if (command === "search") {
    const query = parsed.args.get("query") ?? parsed.positionals[0] ?? "";
    const limit = Number(parsed.args.get("limit") ?? "10");
    const json = parsed.flags.has("json");
    const interactive = parsed.flags.has("interactive");

    if (interactive || (!json && !query)) {
      await runInteractiveSearch();
      return;
    }

    result = await runSearchCli({ query, limit, json });
  } else if (command === "show") {
    const personId = parsed.args.get("personId") ?? parsed.positionals[0] ?? "";
    const json = parsed.flags.has("json");
    result = await runShowCli({ personId, json });
  } else if (!command || command === "help") {
    console.log(chalk.bold("\n📖 Seeku CLI Usage Guide\n"));
    console.log(chalk.yellow("Commands:"));
    console.log(`  ${chalk.cyan("seeku")}                 🚀 启动会话式人才搜索助手`);
    console.log(`  ${chalk.cyan('seeku "query"')}         带初始需求进入会话式搜索`);
    console.log(`  ${chalk.cyan("search [query]")}        直接进行脚本式人才搜索 (支持 --json)`);
    console.log(`  ${chalk.cyan("show [id]")}            查看指定人才的深度画像`);
    console.log(`  ${chalk.cyan("version")}              显示当前版本信息`);
    console.log(`  ${chalk.cyan("help")}                 显示此帮助信息`);
    
    console.log(chalk.yellow("\nSync Commands (Pipeline):"));
    console.log(`  ${chalk.dim("sync-bonjour, sync-github, resolve-identities, ...")}`);

    console.log(chalk.yellow("\nOptions:"));
    console.log(`  ${chalk.dim("--limit <num>")}         设置返回结果数量 (默认: 10)`);
    console.log(`  ${chalk.dim("--json")}                以 JSON 格式输出结果`);
    console.log("");
    return;
  } else {
    console.log(chalk.red(`\n❌ Unknown command: "${command}"`));
    console.log(chalk.dim("Type 'seeku help' to see available commands.\n"));
    process.exit(1);
  }

  if (result !== undefined) {
    console.log(JSON.stringify(result, null, 2));
  }
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
