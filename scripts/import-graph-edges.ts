import "dotenv/config";
import { runImportGraphEdgesCommand } from "../apps/worker/src/cli/import-graph-edges.ts";

async function main() {
  const result = await runImportGraphEdgesCommand(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
