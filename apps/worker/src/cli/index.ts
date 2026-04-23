import { createDatabaseConnection } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchWorkflow } from "./workflow.js";
import chalk from "chalk";
import { TerminalUI } from "./tui.js";
import { CliSessionLedger, type PersistedCliSessionRecord } from "./session-ledger.js";
import { resolveTaskResumeItems, toResumePanelItem } from "./resume-resolver.js";
import type { TaskResumeItem } from "./resume-panel-types.js";
import { isUserExitError } from "./prompt-abort.js";
import type { AgentSessionTerminationReason } from "./session-runtime-types.js";
import {
  createWorkflowInterruptionMonitor,
  isWorkflowInterruptedError,
  type InterruptionSignalSource
} from "./workflow-interruption.js";
import { UserIdentityProvider } from "./user-identity-provider.js";
import { UserMemoryStore } from "./user-memory-store.js";
import { WorkItemStore } from "./work-item-store.js";
import { runMemoryManagementSession } from "./memory-command.js";
import { hydrateMemoryContextSafely } from "./memory-context.js";

interface RunInteractiveSearchOptions {
  attachSessionId?: string;
}

type LauncherAction =
  | { type: "new" }
  | { type: "attach"; sessionId: string }
  | { type: "memory" }
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

  if (normalized === "memory" || normalized === "m" || normalized === "mem") {
    return { type: "memory" };
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
  ledger: CliSessionLedger,
  workItemStore: WorkItemStore
): Promise<LauncherAction> {
  const resolution = await resolveTaskResumeItems(ledger, workItemStore, 8);
  if (resolution.items.length === 0) {
    // Minimal launcher when no resume items — still allow memory management
    ui.displayBanner();
    console.log(chalk.green("[1] 新开任务"));
    console.log(chalk.dim("输入 memory 管理记忆偏好。"));
    console.log("");

    const raw = await ui.promptSessionLauncherChoice("1");
    const action = parseLauncherAction(raw, 0);
    if (action) return action;
    return { type: "new" };
  }

  while (true) {
    ui.displayTaskResumePanel(resolution.items);
    const raw = await ui.promptResumePanelChoice("1");
    const action = parseLauncherAction(raw, resolution.items.length);
    if (!action) {
      ui.displayLauncherInputError();
      continue;
    }

    if (action.type === "new" || action.type === "quit" || action.type === "memory") {
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
  memoryStore: UserMemoryStore;
  workItemStore: WorkItemStore;
}): SearchWorkflow {
  const { db, llmProvider, record, memoryStore, workItemStore } = args;
  return new SearchWorkflow(db, llmProvider, {
    sessionId: record.sessionId,
    initialTranscript: record.transcript,
    memoryStore,
    workItemStore,
    workItemId: record.workItemId ?? undefined
  });
}

async function presentRecordPreview(options: {
  ui: TerminalUI;
  record: PersistedCliSessionRecord;
  workItemStore: WorkItemStore;
  memoryStore: UserMemoryStore;
}): Promise<"new" | "quit" | "resume"> {
  const { ui, record, workItemStore, memoryStore } = options;
  const resumability = toResumePanelItem(record).resumability;

  async function displayWorkboard() {
    const memoryContext = await hydrateMemoryContextSafely(memoryStore);
    if (record.workItemId) {
      const workItem = await workItemStore.get(record.workItemId);
      const viewModel = workItemStore.getWorkboardModel(
        workItem,
        record.latestSnapshot,
        record.resumeMeta,
        memoryContext,
        workItem ? undefined : record.workItemId
      );
      ui.displayTaskWorkboard(viewModel);
    } else {
      const viewModel = workItemStore.getWorkboardModel(
        null,
        record.latestSnapshot,
        record.resumeMeta,
        memoryContext
      );
      ui.displayTaskWorkboard(viewModel);
    }
  }

  if (resumability === "resumable") {
    while (true) {
      ui.displayResumePreview(record);
      const raw = (await ui.promptResumableAction()).trim().toLowerCase();

      if (!raw || raw === "resume") {
        return "resume";
      }

      if (raw === "workboard") {
        ui.displayResumePreview(record);
        await displayWorkboard();
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
      await displayWorkboard();
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
  workItemStore: WorkItemStore;
  memoryStore: UserMemoryStore;
}): Promise<void> {
  const { ui, record, ledger, db, llmProvider, workItemStore, memoryStore } = options;
  const action = await presentRecordPreview({ ui, record, workItemStore, memoryStore });
  if (action === "quit") {
    return;
  }
  if (action === "new") {
    const workflow = new SearchWorkflow(db, llmProvider, { memoryStore, workItemStore });
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
    record,
    memoryStore,
    workItemStore
  });
  await runWorkflowSession({
    workflow,
    ledger,
    initialPrompt: continuation
  });
}

function createMemoryStore(db: ReturnType<typeof createDatabaseConnection>["db"]): UserMemoryStore {
  const identityProvider = new UserIdentityProvider();
  identityProvider.resolve();
  return new UserMemoryStore(db, identityProvider);
}

function createWorkItemStore(db: ReturnType<typeof createDatabaseConnection>["db"]): WorkItemStore {
  const identityProvider = new UserIdentityProvider();
  identityProvider.resolve();
  return new WorkItemStore(db, identityProvider);
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
    const memoryStore = createMemoryStore(connection.db);
    const workItemStore = createWorkItemStore(connection.db);

    let launcherAction: LauncherAction;
    if (options.attachSessionId?.trim()) {
      launcherAction = {
        type: "attach",
        sessionId: options.attachSessionId.trim()
      };
    } else if (initialPrompt?.trim()) {
      launcherAction = { type: "new" };
    } else {
      launcherAction = await promptLauncher(ui, ledger, workItemStore);
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
        llmProvider,
        workItemStore,
        memoryStore
      });
      return;
    }

    if (launcherAction.type === "memory") {
      const enquirer = await import("enquirer");
      const { Input } = enquirer.default as unknown as { Input: any };
      await runMemoryManagementSession(memoryStore, async (prompt) => {
        const input = new Input({ message: prompt });
        const result = await input.run();
        return result?.trim() || null;
      });
      return;
    }

    if (launcherAction.type === "quit") {
      return;
    }

    console.log(chalk.bold.blue("\n✨ Welcome to Seeku Search Assistant"));
    console.log(chalk.dim("Describe the role naturally. I will help you clarify, shortlist, and refine. Press Ctrl+C to exit.\n"));

    const workflow = new SearchWorkflow(connection.db, llmProvider, {
      memoryStore,
      workItemStore
    });
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
