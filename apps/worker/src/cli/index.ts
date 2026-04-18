import { createDatabaseConnection } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchWorkflow } from "./workflow.js";
import chalk from "chalk";
import { TerminalUI } from "./tui.js";
import { CliSessionLedger, type PersistedCliSessionRecord } from "./session-ledger.js";

interface RunInteractiveSearchOptions {
  attachSessionId?: string;
}

type LauncherAction =
  | { type: "new" }
  | { type: "attach"; sessionId: string };

async function runWorkflowSession(options: {
  workflow: SearchWorkflow;
  ledger: CliSessionLedger;
  initialPrompt?: string;
}) {
  const { workflow, ledger, initialPrompt } = options;
  await ledger.saveWorkflow(workflow, "active");
  const unsubscribe = workflow.subscribeToSessionEvents(() => {
    void ledger.saveWorkflow(workflow, "active");
  });

  try {
    await workflow.execute(initialPrompt);
  } finally {
    unsubscribe();
    await ledger.saveWorkflow(workflow, "stopped");
  }
}

function parseLauncherAction(input: string, sessionCount: number): LauncherAction | null {
  const normalized = input.trim();
  if (!normalized || normalized === "1") {
    return { type: "new" };
  }

  const attachMatch = normalized.match(/^attach\s+([0-9a-f-]+)$/i);
  if (attachMatch?.[1]) {
    return {
      type: "attach",
      sessionId: attachMatch[1]
    };
  }

  const index = Number.parseInt(normalized, 10);
  if (!Number.isNaN(index) && index >= 2 && index <= sessionCount + 1) {
    return {
      type: "attach",
      sessionId: `__index__:${index - 2}`
    };
  }

  return null;
}

async function promptLauncher(
  ui: TerminalUI,
  ledger: CliSessionLedger
): Promise<LauncherAction> {
  const recentSessions = await ledger.listRecent(8);
  if (recentSessions.length === 0) {
    return { type: "new" };
  }

  while (true) {
    ui.displaySessionLauncher(recentSessions);
    const raw = await ui.promptSessionLauncherChoice("1");
    const action = parseLauncherAction(raw, recentSessions.length);
    if (!action) {
      console.log(chalk.yellow("无法识别该输入。请输入 1、列表编号，或 attach <sessionId>。"));
      continue;
    }

    if (action.type === "new") {
      return action;
    }

    if (action.sessionId.startsWith("__index__:")) {
      const index = Number.parseInt(action.sessionId.slice("__index__:".length), 10);
      const record = recentSessions[index];
      if (record) {
        return { type: "attach", sessionId: record.sessionId };
      }
    }

    return action;
  }
}

async function presentRestoredSession(options: {
  ui: TerminalUI;
  record: PersistedCliSessionRecord;
  ledger: CliSessionLedger;
  db: ReturnType<typeof createDatabaseConnection>["db"];
  llmProvider: LLMProvider;
}): Promise<void> {
  const { ui, record, ledger, db, llmProvider } = options;

  while (true) {
    ui.displayRestoredSession(record.transcript);
    const raw = (await ui.promptRestoredSessionCommand()).trim().toLowerCase();

    if (!raw || raw === "resume") {
      const continuation = await ui.promptResumeContinuation();
      if (!continuation.trim()) {
        console.log(chalk.yellow("继续执行前需要一个新的继续指令。"));
        continue;
      }

      const workflow = new SearchWorkflow(db, llmProvider, {
        sessionId: record.sessionId,
        initialTranscript: record.transcript
      });
      await runWorkflowSession({
        workflow,
        ledger,
        initialPrompt: continuation
      });
      return;
    }

    if (raw === "workboard") {
      ui.displayRestoredSession(record.transcript);
      ui.displayWorkboardSnapshot(record.latestSnapshot);
      console.log(chalk.dim("按 Enter 返回只读会话。"));
      await ui.promptContinue();
      continue;
    }

    if (raw === "q" || raw === "quit" || raw === "exit") {
      return;
    }

    console.log(chalk.yellow("只读模式下可用命令：resume / workboard / q"));
  }
}

/**
 * Orchestrates the interactive search workflow
 */
export async function runInteractiveSearch(
  initialPrompt?: string,
  options: RunInteractiveSearchOptions = {}
) {
  let close: (() => Promise<void>) | undefined;

  try {
    const llmProvider: LLMProvider = createProvider();
    const connection = createDatabaseConnection();
    close = connection.close;
    const ledger = new CliSessionLedger({ db: connection.db });
    const ui = new TerminalUI();

    let launcherAction: LauncherAction;
    if (options.attachSessionId?.trim()) {
      launcherAction = {
        type: "attach",
        sessionId: options.attachSessionId.trim()
      };
    } else if (initialPrompt?.trim()) {
      launcherAction = { type: "new" };
    } else {
      launcherAction = await promptLauncher(ui, ledger);
    }

    if (launcherAction.type === "attach") {
      const record = await ledger.load(launcherAction.sessionId);
      if (!record) {
        console.error(chalk.red(`\n❌ Session not found: ${launcherAction.sessionId}`));
        process.exitCode = 1;
        return;
      }

      await presentRestoredSession({
        ui,
        record,
        ledger,
        db: connection.db,
        llmProvider
      });
      return;
    }

    console.log(chalk.bold.blue("\n✨ Welcome to Seeku Search Assistant"));
    console.log(chalk.dim("Describe the role naturally. I will help you clarify, shortlist, and refine. Press Ctrl+C to exit.\n"));

    const workflow = new SearchWorkflow(connection.db, llmProvider);
    await runWorkflowSession({
      workflow,
      ledger,
      initialPrompt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(chalk.red("\n❌ Unable to start interactive search."));

    if (message.includes("STEPFUN_API_KEY")) {
      console.error(chalk.yellow("Missing chat credentials. Set `STEPFUN_API_KEY` before starting the CLI."));
    } else if (message.includes("SILICONFLOW_API_KEY") || message.includes("OPENAI_API_KEY")) {
      console.error(chalk.yellow("Missing embedding credentials. Set `SILICONFLOW_API_KEY` or `OPENAI_API_KEY` before running retrieval."));
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
