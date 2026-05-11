import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

// graph-rerank-eval.ts has its own main() — import and run it directly
const evalModule = resolve(__dirname, "../../packages/eval/src/graph-rerank-eval.ts");
const mod = await import(evalModule);

if (typeof mod.main === "function") {
  await mod.main();
} else {
  // Fallback: the module runs main() on import via top-level await or side effect
  console.log("graph-rerank-eval executed via import (no exported main)");
}
