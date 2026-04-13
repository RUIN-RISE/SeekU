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
  OpenRouterProvider,
  SiliconFlowProvider,
  createProvider,
} from "@seeku/llm";
import {
  runBonjourStrongAliasDedupeWorker,
  runBackfillPersonFieldsWorker,
  runEvidenceStorageWorker,
  runGithubSync,
  runIdentityResolutionWorker,
  runProfileEnrichmentWorker,
  runSearchEmbeddingWorker,
  runSearchIndexWorker,
  runSearchRebuildWorker,
  runSocialGraphWorker,
  runSourceProfileRepairWorker,
  SearchIndexWorker
} from "@seeku/workers";

import { runBonjourDiscoveryScan, runBonjourSyncJob } from "./index.js";
import { runCoverageCli } from "./cli/coverage.js";
import { runBuildBonjourAuthProbeSeedsCommand } from "./cli/build-bonjour-auth-probe-seeds.js";
import { runDumpBonjourAuthHandlesCommand } from "./cli/dump-bonjour-auth-handles.js";
import { runDumpBonjourRawCommand } from "./cli/dump-bonjour-raw.js";
import { runFilterBonjourImportHandlesCommand } from "./cli/filter-bonjour-import-handles.js";
import { runImportBonjourDumpCommand } from "./cli/import-bonjour-dump.js";
import { runScanGithubZjuCommand } from "./cli/scan-github-zju.js";
import { runZjuExtractionPipeline } from "./cli/extraction.js";
import { runSearchCli, runShowCli } from "./search-cli.js";
import { runInteractiveSearch } from "./cli/index.js";

// --- Argument Parsing ---

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

// --- Command Registry ---

type CommandRunner = (parsed: ReturnType<typeof parseArgs>, rawArgv: string[]) => Promise<unknown>;

function splitCsv(value: string | undefined): string[] | undefined {
  return value?.split(",").map((v) => v.trim()).filter(Boolean);
}

function buildCommandRegistry(): Map<string, CommandRunner> {
  const registry = new Map<string, CommandRunner>();

  // --- Sync commands ---
  registry.set("sync-bonjour", async (parsed) => {
    const limit = Number(parsed.args.get("limit") ?? "20");
    const handles = splitCsv(parsed.args.get("handles"));
    const cursor = parseCursor(parsed.args.get("cursor"));
    const jobName = parsed.args.get("job-name");
    return runBonjourSyncJob({ limit, cursor, handles, jobName });
  });

  registry.set("scan-bonjour", async (parsed) => {
    const limit = Number(parsed.args.get("limit") ?? "20");
    const query = (parsed.args.get("query") ?? "浙大,ZJU").split(",").map(q => q.trim());
    const depth = Number(parsed.args.get("depth") ?? "5");
    return runBonjourDiscoveryScan({ query, limit, depth });
  });

  registry.set("import-bonjour-dump", async (_parsed, rawArgv) => {
    return runImportBonjourDumpCommand(rawArgv);
  });

  registry.set("dump-bonjour-auth-handles", async (_parsed, rawArgv) => {
    return runDumpBonjourAuthHandlesCommand(rawArgv);
  });

  registry.set("build-bonjour-auth-probe-seeds", async (_parsed, rawArgv) => {
    return runBuildBonjourAuthProbeSeedsCommand(rawArgv);
  });

  registry.set("dump-bonjour-raw", async (_parsed, rawArgv) => {
    return runDumpBonjourRawCommand(rawArgv);
  });

  registry.set("filter-bonjour-import-handles", async (_parsed, rawArgv) => {
    return runFilterBonjourImportHandlesCommand(rawArgv);
  });

  registry.set("sync-github", async (parsed) => {
    const limit = Number(parsed.args.get("limit") ?? "20");
    const handles = splitCsv(parsed.args.get("handles"));
    return runGithubSync(handles ?? [], { limit });
  });

  registry.set("scan-github-zju", async (parsed) => {
    return runScanGithubZjuCommand(parsed);
  });

  // --- Pipeline commands ---
  registry.set("resolve-identities", async (parsed) => {
    const bonjourHandles = splitCsv(parsed.args.get("bonjour-handles"));
    const githubHandles = splitCsv(parsed.args.get("github-handles"));
    return runIdentityResolutionWorker(bonjourHandles, githubHandles);
  });

  registry.set("store-evidence", async (parsed) => {
    const personIds = splitCsv(parsed.args.get("person-ids"));
    return runEvidenceStorageWorker(personIds);
  });

  registry.set("backfill-person-fields", async (parsed) => {
    const personIds = splitCsv(parsed.args.get("person-ids"));
    return runBackfillPersonFieldsWorker(personIds);
  });

  registry.set("dedupe-bonjour", async () => {
    return runBonjourStrongAliasDedupeWorker();
  });

  registry.set("repair-source-payloads", async (parsed) => {
    const source = parsed.args.get("source");
    const limit = Number(parsed.args.get("limit") ?? "20");
    const handles = splitCsv(parsed.args.get("handles"));
    return runSourceProfileRepairWorker({
      source: source === "bonjour" || source === "github" ? source : undefined,
      handles,
      limit
    });
  });

  // --- Search index commands ---
  registry.set("search-index", async (parsed) => {
    const personIds = splitCsv(parsed.args.get("person-ids"));
    const indexingProvider = SiliconFlowProvider.fromStrictEnv();
    return runSearchIndexWorker(personIds, undefined, { provider: indexingProvider });
  });

  registry.set("search-embeddings", async (parsed) => {
    const personIds = splitCsv(parsed.args.get("person-ids"));
    const indexingProvider = SiliconFlowProvider.fromStrictEnv();
    return runSearchEmbeddingWorker(personIds, undefined, { provider: indexingProvider });
  });

  registry.set("rebuild-search", async (parsed) => {
    const personIds = splitCsv(parsed.args.get("person-ids"));
    const indexingProvider = SiliconFlowProvider.fromStrictEnv();
    return runSearchRebuildWorker(personIds, undefined, { provider: indexingProvider });
  });

  // --- Enrichment commands ---
  registry.set("enrich-profiles", async (parsed) => {
    const limit = Number(parsed.args.get("limit") ?? "20");
    const personIds = splitCsv(parsed.args.get("person-ids"));
    const enrichmentProvider = process.env.OPENROUTER_API_KEY
      ? OpenRouterProvider.fromEnv()
      : createProvider();
    return runProfileEnrichmentWorker({ limit, personIds, provider: enrichmentProvider });
  });

  registry.set("mine-network", async (parsed) => {
    const limit = Number(parsed.args.get("limit") ?? "20");
    const enrichmentProvider = process.env.OPENROUTER_API_KEY
      ? OpenRouterProvider.fromEnv()
      : createProvider();
    return runSocialGraphWorker({ limit, provider: enrichmentProvider });
  });

  registry.set("extract-zju-talent", async (parsed) => {
    const limit = Number(parsed.args.get("limit") ?? "20");
    return runZjuExtractionPipeline({
      limit,
      crawl: !parsed.flags.has("no-crawl")
    });
  });

  // --- Query commands ---
  registry.set("search", async (parsed) => {
    const query = parsed.args.get("query") ?? parsed.positionals[0] ?? "";
    const limit = Number(parsed.args.get("limit") ?? "10");
    const json = parsed.flags.has("json");
    const interactive = parsed.flags.has("interactive");

    if (interactive || (!json && !query)) {
      await runInteractiveSearch();
      return undefined;
    }

    return runSearchCli({ query, limit, json });
  });

  registry.set("show", async (parsed) => {
    const personId = parsed.args.get("personId") ?? parsed.positionals[0] ?? "";
    const json = parsed.flags.has("json");
    return runShowCli({ personId, json });
  });

  // --- Utility commands ---
  registry.set("coverage", async (parsed) => {
    return runCoverageCli({ json: parsed.flags.has("json") });
  });

  registry.set("version", async () => {
    console.log(chalk.bold("Seeku CLI v1.1.0"));
    console.log(chalk.dim("Search Assistant Edition"));
    return undefined;
  });

  registry.set("help", async () => {
    console.log(chalk.bold("\n📖 Seeku CLI Usage Guide\n"));
    console.log(chalk.yellow("Commands:"));
    console.log(`  ${chalk.cyan("seeku")}                 🚀 启动会话式人才搜索助手`);
    console.log(`  ${chalk.cyan('seeku "query"')}         带初始需求进入会话式搜索`);
    console.log(`  ${chalk.cyan("search [query]")}        直接进行脚本式人才搜索 (支持 --json)`);
    console.log(`  ${chalk.cyan("show [id]")}            查看指定人才的深度画像`);
    console.log(`  ${chalk.cyan("version")}              显示当前版本信息`);
    console.log(`  ${chalk.cyan("help")}                 显示此帮助信息`);

    console.log(chalk.yellow("\nSync Commands (Pipeline):"));
    console.log(`  ${chalk.dim("sync-bonjour, scan-bonjour, sync-github, resolve-identities, store-evidence, backfill-person-fields, repair-source-payloads, ...")}`);

    console.log(chalk.yellow("\nMaintenance Commands:"));
    console.log(`  ${chalk.cyan("extract-zju-talent")}  🚀 运行 ZJU 人才全链路发现与深度提炼管道`);
    console.log(`  ${chalk.cyan("coverage")}            输出当前 active/indexed/embedded/multi-source 覆盖率`);
    console.log(`  ${chalk.cyan("rebuild-search")}      全量重建 search documents + embeddings`);

    console.log(chalk.yellow("\nOptions:"));
    console.log(`  ${chalk.dim("--limit <num>")}         设置返回结果数量 (默认: 10)`);
    console.log(`  ${chalk.dim("--json")}                以 JSON 格式输出结果`);
    console.log("");
    return undefined;
  });

  return registry;
}

// --- Main ---

async function main() {
  const [, , command, ...rest] = process.argv;
  const parsed = parseArgs(rest);
  const registry = buildCommandRegistry();

  // No command → interactive search
  if (!command) {
    await runInteractiveSearch();
    return;
  }

  // Known command → dispatch
  const handler = registry.get(command);
  if (handler) {
    const result = await handler(parsed, rest);
    if (result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  // Unknown command → treat as interactive search with initial query
  await runInteractiveSearch([command, ...rest].join(" ").trim());
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
