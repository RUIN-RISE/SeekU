import { createDatabaseConnection } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchWorkflow } from "./workflow.js";
import chalk from "chalk";

/**
 * Orchestrates the interactive search workflow
 */
export async function runInteractiveSearch(initialPrompt?: string) {
  let close: (() => Promise<void>) | undefined;

  try {
    const llmProvider: LLMProvider = createProvider();
    const connection = createDatabaseConnection();
    close = connection.close;

    console.log(chalk.bold.blue("\n✨ Welcome to Seeku Search Assistant"));
    console.log(chalk.dim("Describe the role naturally. I will help you clarify, shortlist, and refine. Press Ctrl+C to exit.\n"));

    const workflow = new SearchWorkflow(connection.db, llmProvider);
    await workflow.execute(initialPrompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(chalk.red("\n❌ Unable to start interactive search."));

    if (message.includes("SILICONFLOW_API_KEY") || message.includes("OPENAI_API_KEY")) {
      console.error(chalk.yellow("Missing LLM credentials. Set `SILICONFLOW_API_KEY` or `OPENAI_API_KEY` and retry."));
    } else if (message.includes("DATABASE_URL")) {
      console.error(chalk.yellow("Missing database connection. Set `DATABASE_URL` before starting the CLI."));
    } else {
      console.error(chalk.red("Search failed:"), message);
    }

    process.exitCode = 1;
  } finally {
    await close?.();
  }
}
