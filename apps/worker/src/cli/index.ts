import { createDatabaseConnection } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchWorkflow } from "./workflow.js";
import chalk from "chalk";
import { TerminalUI } from "./tui.js";
import { CliSessionLedger, type PersistedCliSessionRecord } from "./session-ledger.js";
import { resolveResumeItems, toResumePanelItem } from "./resume-resolver.js";
import { isUserExitError } from "./prompt-abort.js";
import type { AgentSessionTerminationReason } from "./session-runtime-types.js";
import {
  createWorkflowInterruptionMonitor,
  isWorkflowInterruptedError,
  type InterruptionSignalSource
} from "./workflow-interruption.js";

interface RunInteractiveSearchOptions {
  attachSessionId?: string;
}

type LauncherAction =
  | { type: "new" }
  | { type: "attach"; sessionId: string }
  | { type: "quit" };

export async function runWorkflowSession(options: {
  workflow: SearchWorkflow;
  ledger: CliSessionLedger;
  initialPrompt?: string;
  signalSource?: InterruptionSignalSource;
  interruptionSignals?: NodeJS.Signals[];
}) {
  const { workflow, ledger, initialPrompt, signalSource, interruptionSignals } = options;
  await ledger.saveWorkflow(workflow, "active");
  let finalized = false;
  const unsubscribe = workflow.subscribeToSessionEvents(() => {
    if (!finalized) {
      void ledger.saveWorkflow(workflow, "active");
    }
  });
  const interruptionMonitor = createWorkflowInterruptionMonitor({
    source: signalSource,
    signals: interruptionSignals,
    onInterrupt: () => workflow.interrupt("interrupted")
  });
  let terminationReason: AgentSessionTerminationReason | undefined;

  try {
    await Promise.race([
      workflow.execute(initialPrompt),
      interruptionMonitor.interruption
    ]);
    terminationReason = workflow.getTerminationReason() ?? "completed";
  } catch (error) {
    if (isWorkflowInterruptedError(error)) {
      terminationReason = "interrupted";
      return;
    }
    if (isUserExitError(error)) {
      terminationReason = "user_exit";
      return;
    }
    terminationReason = "crashed";
    throw error;
  } finally {
    finalized = true;
    interruptionMonitor.dispose();
    unsubscribe();
    await ledger.saveWorkflow(workflow, "stopped", {
      terminationReason: terminationReason ?? workflow.getTerminationReason() ?? "completed"
    });
  }
}

function parseLauncherAction(input: string, sessionCount: number): LauncherAction | null {
  const normalized = input.trim();
  if (!normalized || normalized === "1") {
    return { type: "new" };
  }

  if (normalized === "q" || normalized === "quit" || normalized === "exit") {
    return { type: "quit" };
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
  const resolution = await resolveResumeItems(ledger, 8);
  if (resolution.items.length === 0) {
    return { type: "new" };
  }

  while (true) {
    ui.displayResumePanel(resolution.items);
    const raw = await ui.promptResumePanelChoice("1");
    const action = parseLauncherAction(raw, resolution.items.length);
    if (!action) {
      ui.displayLauncherInputError();
      continue;
    }

    if (action.type === "new" || action.type === "quit") {
      return action;
    }

    if (action.sessionId.startsWith("__index__:")) {
      const index = Number.parseInt(action.sessionId.slice("__index__:".length), 10);
      const item = resolution.items[index];
      if (item) {
        return { type: "attach", sessionId: item.sessionId };
      }
    }

    return action;
  }
}

function buildWorkflowFromRecord(args: {
  db: ReturnType<typeof createDatabaseConnection>["db"];
  llmProvider: LLMProvider;
  record: PersistedCliSessionRecord;
}): SearchWorkflow {
  const { db, llmProvider, record } = args;
  return new SearchWorkflow(db, llmProvider, {
    sessionId: record.sessionId,
    initialTranscript: record.transcript
  });
}

async function presentRecordPreview(options: {
  ui: TerminalUI;
  record: PersistedCliSessionRecord;
}): Promise<"new" | "quit" | "resume"> {
  const { ui, record } = options;
  const resumability = toResumePanelItem(record).resumability;

  if (resumability === "resumable") {
    while (true) {
      ui.displayResumePreview(record);
      const raw = (await ui.promptResumableAction()).trim().toLowerCase();

      if (!raw || raw === "resume") {
        return "resume";
      }

      if (raw === "workboard") {
        ui.displayResumePreview(record);
        ui.displayWorkboardSnapshot(record.latestSnapshot);
        console.log(chalk.dim("按 Enter 返回。"));
        await ui.promptContinue();
        continue;
      }

      if (raw === "transcript") {
        ui.displayRestoredSession(record.transcript);
        console.log(chalk.dim("按 Enter 返回。"));
        await ui.promptContinue();
        continue;
      }

      if (raw === "q" || raw === "quit" || raw === "exit") {
        return "quit";
      }

      if (raw === "new") {
        return "new";
      }
    }
  }

  while (true) {
    ui.displayReadOnlyPreview(record);
    const raw = (await ui.promptReadOnlyAction()).trim().toLowerCase();

    if (!raw || raw === "workboard") {
      ui.displayReadOnlyPreview(record);
      ui.displayWorkboardSnapshot(record.latestSnapshot);
      console.log(chalk.dim("按 Enter 返回。"));
      await ui.promptContinue();
      continue;
    }

    if (raw === "transcript") {
      ui.displayRestoredSession(record.transcript);
      console.log(chalk.dim("按 Enter 返回。"));
      await ui.promptContinue();
      continue;
    }

    if (raw === "new") {
      return "new";
    }

    if (raw === "q" || raw === "quit" || raw === "exit") {
      return "quit";
    }
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
  const action = await presentRecordPreview({ ui, record });
  if (action === "quit") {
    return;
  }
  if (action === "new") {
    const workflow = new SearchWorkflow(db, llmProvider);
    await runWorkflowSession({
      workflow,
      ledger
    });
    return;
  }

  const continuation = await ui.promptResumeContinuation();
  if (!continuation.trim()) {
    console.log(chalk.yellow("继续执行前需要一个新的继续指令。"));
    return;
  }

  const workflow = buildWorkflowFromRecord({
    db,
    llmProvider,
    record
  });
  await runWorkflowSession({
    workflow,
    ledger,
    initialPrompt: continuation
  });
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
        ui.displaySessionNotFound(launcherAction.sessionId);
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

    if (launcherAction.type === "quit") {
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
