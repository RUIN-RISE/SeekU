import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { runRecruitingPrecisionEval } from "@seeku/eval";

const RESULTS_DIR = resolve(__dirname, "../../eval-results");

async function main() {
  const queryIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : undefined;

  console.log("Running recruiting precision eval...");
  if (queryIds) console.log(`  Filtering to queries: ${queryIds.join(", ")}`);

  const summary = await runRecruitingPrecisionEval({ queryIds });

  await mkdir(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = resolve(RESULTS_DIR, `recruiting-precision-${timestamp}.json`);
  await writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`\nResults: ${reportPath}`);
  console.log(`Queries: ${summary.totalQueries}`);
  console.log(`Passed:  ${summary.passedQueries}/${summary.totalQueries}`);
  console.log(`Avg P@5: ${summary.avgTop5Precision.toFixed(3)}`);
  console.log(`Avg P@10: ${summary.avgTop10Precision.toFixed(3)}`);

  const failures = summary.results.filter(r => !r.passedGate);
  if (failures.length > 0) {
    console.log(`\nFAILED queries (${failures.length}):`);
    for (const f of failures) {
      console.log(`  ${f.queryId}: P@5=${f.top5Precision.toFixed(3)} (min=${f.text.slice(0, 40)}...)`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nAll queries passed their precision gates.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
