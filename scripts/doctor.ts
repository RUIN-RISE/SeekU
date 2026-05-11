import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import { DeepSeekProvider, SiliconFlowProvider } from "@seeku/llm";
import { createPostgresClient } from "@seeku/db";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

async function checkDeepSeekChat(): Promise<CheckResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return { name: "deepseek-chat", status: "skip", error: "DEEPSEEK_API_KEY not set" };
  }

  const start = Date.now();
  try {
    const provider = DeepSeekProvider.fromEnv();
    const response = await provider.chat(
      [{ role: "user", content: "Reply with exactly: pong" }],
      { temperature: 0 }
    );
    return {
      name: "deepseek-chat",
      status: "pass",
      latencyMs: Date.now() - start,
      details: { provider: provider.name, responseLength: response.content.length }
    };
  } catch (e) {
    return {
      name: "deepseek-chat",
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function checkSiliconFlowEmbed(): Promise<CheckResult> {
  if (!process.env.SILICONFLOW_API_KEY) {
    return { name: "siliconflow-embed", status: "skip", error: "SILICONFLOW_API_KEY not set" };
  }

  const start = Date.now();
  try {
    const provider = SiliconFlowProvider.fromEnv();
    const response = await provider.embed("health check");
    return {
      name: "siliconflow-embed",
      status: "pass",
      latencyMs: Date.now() - start,
      details: { provider: provider.name, dimension: response.embedding.length }
    };
  } catch (e) {
    return {
      name: "siliconflow-embed",
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  if (!process.env.DATABASE_URL) {
    return { name: "postgresql", status: "skip", error: "DATABASE_URL not set" };
  }

  const start = Date.now();
  try {
    const client = createPostgresClient();
    const result = await client`SELECT 1 as ok`;
    await client.end();
    return {
      name: "postgresql",
      status: result[0]?.ok === 1 ? "pass" : "fail",
      latencyMs: Date.now() - start,
      details: { url: process.env.DATABASE_URL?.replace(/\/\/[^@]+@/, "//***@") }
    };
  } catch (e) {
    return {
      name: "postgresql",
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function main() {
  console.log("=== Seeku Doctor ===\n");

  const results = await Promise.all([
    checkDatabase(),
    checkDeepSeekChat(),
    checkSiliconFlowEmbed()
  ]);

  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "-";
    const latency = r.latencyMs ? ` (${r.latencyMs}ms)` : "";
    console.log(`  [${icon}] ${r.name}${latency}`);
    if (r.error) console.log(`      ${r.error}`);
    if (r.details) {
      for (const [key, value] of Object.entries(r.details)) {
        console.log(`      ${key}: ${value}`);
      }
    }
  }

  const failed = results.filter(r => r.status === "fail");
  const skipped = results.filter(r => r.status === "skip");
  const passed = results.filter(r => r.status === "pass");

  console.log(`\n  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
