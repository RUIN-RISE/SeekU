import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import {
  AGENT_ACCEPTANCE_FIXTURES,
  AGENT_REGRESSION_FIXTURES,
  type AgentAcceptanceFixture,
  type AgentEvalCandidate,
  type AgentRegressionFixture
} from "./agent-eval-fixtures.js";
import { decideClarifyAction, decidePostSearchAction } from "./agent-policy.js";
import { prepareComparisonResult } from "./agent-tools.js";
import type { ComparisonOutcome, ScriptSearchResponseOutput } from "./types.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, "../../../..");
const DEFAULT_SNAPSHOT_DIR = resolve(
  REPO_ROOT,
  ".planning/github-expansion/snapshots/ws4-rerun-2026-04-15-controlled-open-followup"
);
const MANUAL_CHECKLIST_PATH = resolve(
  REPO_ROOT,
  "docs/product/CLI_AGENT_EVAL_HARNESS_2026-04-16.md"
);

export interface AcceptanceEvaluationResult {
  id: string;
  goal: string;
  pass: boolean;
  clarifyAction: "clarify" | "search";
  postSearchAction?: "narrow" | "compare";
  recommendationMode?: ComparisonOutcome["recommendationMode"];
  recommendedCandidateId?: string;
  failures: string[];
}

export interface RegressionEvaluationResult {
  id: string;
  query: string;
  expectedLabel: string;
  pass: boolean;
  totalResults: number;
  githubInTop3: number;
  githubInTop5: number;
  failures: string[];
}

export interface AgentEvalSummary {
  overallPass: boolean;
  acceptance: {
    total: number;
    passed: number;
    results: AcceptanceEvaluationResult[];
  };
  regression: {
    snapshotDir: string;
    total: number;
    passed: number;
    results: RegressionEvaluationResult[];
  };
  manualChecklistPath: string;
}

export interface AgentEvalCliOptions {
  json?: boolean;
  snapshotDir?: string;
}

function countGithub(results: ScriptSearchResponseOutput["results"], topN: number): number {
  return results
    .slice(0, topN)
    .filter((result) => result.sources.includes("GitHub"))
    .length;
}

export function evaluateAcceptanceFixture(
  fixture: AgentAcceptanceFixture
): AcceptanceEvaluationResult {
  const failures: string[] = [];
  const clarifyDecision = decideClarifyAction({
    conditions: fixture.conditions,
    clarificationCount: fixture.clarificationCount
  });

  if (clarifyDecision.action !== fixture.expected.clarifyAction) {
    failures.push(
      `clarify expected ${fixture.expected.clarifyAction}, got ${clarifyDecision.action}`
    );
  }

  let postSearchAction: AcceptanceEvaluationResult["postSearchAction"];
  let recommendationMode: AcceptanceEvaluationResult["recommendationMode"];
  let recommendedCandidateId: string | undefined;

  if (fixture.candidates && fixture.candidates.length > 0) {
    const postSearchDecision = decidePostSearchAction({
      candidates: fixture.candidates
    });
    postSearchAction = postSearchDecision.action;

    if (fixture.expected.postSearchAction && postSearchAction !== fixture.expected.postSearchAction) {
      failures.push(
        `post-search expected ${fixture.expected.postSearchAction}, got ${postSearchAction}`
      );
    }

    if (fixture.expected.recommendationMode) {
      if (postSearchDecision.action !== "compare") {
        failures.push("expected compare outcome, but policy did not converge to compare");
      } else {
        const comparison = prepareComparisonResult(
          postSearchDecision.targets as AgentEvalCandidate[],
          fixture.candidates as AgentEvalCandidate[],
          fixture.conditions
        );
        recommendationMode = comparison.outcome.recommendationMode;
        recommendedCandidateId = comparison.outcome.recommendedCandidateId;

        if (recommendationMode !== fixture.expected.recommendationMode) {
          failures.push(
            `recommendation expected ${fixture.expected.recommendationMode}, got ${recommendationMode}`
          );
        }
      }
    }
  }

  return {
    id: fixture.id,
    goal: fixture.goal,
    pass: failures.length === 0,
    clarifyAction: clarifyDecision.action,
    postSearchAction,
    recommendationMode,
    recommendedCandidateId,
    failures
  };
}

export function runAcceptanceEval(
  fixtures: AgentAcceptanceFixture[] = AGENT_ACCEPTANCE_FIXTURES
) {
  const results = fixtures.map((fixture) => evaluateAcceptanceFixture(fixture));
  return {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    results
  };
}

async function loadSnapshot(path: string): Promise<ScriptSearchResponseOutput> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as ScriptSearchResponseOutput;
}

export async function evaluateRegressionFixture(
  fixture: AgentRegressionFixture,
  snapshotDir: string
): Promise<RegressionEvaluationResult> {
  const snapshotPath = resolve(snapshotDir, fixture.snapshotFile);
  const snapshot = await loadSnapshot(snapshotPath);
  const failures: string[] = [];
  const githubInTop3 = countGithub(snapshot.results, 3);
  const githubInTop5 = countGithub(snapshot.results, 5);

  for (const check of fixture.checks) {
    if (check.type === "min-results" && snapshot.results.length < check.value) {
      failures.push(`expected at least ${check.value} results, got ${snapshot.results.length}`);
    }

    if (check.type === "min-github-in-top") {
      const value = countGithub(snapshot.results, check.topN);
      if (value < check.value) {
        failures.push(`expected at least ${check.value} GitHub-backed results in top ${check.topN}, got ${value}`);
      }
    }

    if (check.type === "all-top-include-github") {
      const value = countGithub(snapshot.results, check.topN);
      if (value < Math.min(check.topN, snapshot.results.length)) {
        failures.push(`expected all top ${check.topN} results to include GitHub, got ${value}`);
      }
    }
  }

  return {
    id: fixture.id,
    query: fixture.query,
    expectedLabel: fixture.expectedLabel,
    pass: failures.length === 0,
    totalResults: snapshot.results.length,
    githubInTop3,
    githubInTop5,
    failures
  };
}

export async function runRegressionEval(
  snapshotDir = DEFAULT_SNAPSHOT_DIR
) {
  const results = await Promise.all(
    AGENT_REGRESSION_FIXTURES.map((fixture) => evaluateRegressionFixture(fixture, snapshotDir))
  );

  return {
    snapshotDir,
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    results
  };
}

export async function runAgentEval(
  options: AgentEvalCliOptions = {}
): Promise<AgentEvalSummary> {
  const acceptance = runAcceptanceEval();
  const regression = await runRegressionEval(options.snapshotDir || DEFAULT_SNAPSHOT_DIR);

  return {
    overallPass: acceptance.passed === acceptance.total && regression.passed === regression.total,
    acceptance,
    regression,
    manualChecklistPath: MANUAL_CHECKLIST_PATH
  };
}

export async function runAgentEvalCli(
  options: AgentEvalCliOptions = {}
): Promise<AgentEvalSummary | undefined> {
  const summary = await runAgentEval(options);

  if (options.json) {
    return summary;
  }

  console.log(chalk.bold.blue("\n🧪 CLI Agent Eval Harness\n"));
  console.log(
    `${chalk.bold("Acceptance:")} ${chalk.cyan(summary.acceptance.passed)} / ${summary.acceptance.total}`
  );
  summary.acceptance.results.forEach((result) => {
    const status = result.pass ? chalk.green("PASS") : chalk.red("FAIL");
    const recommendation = result.recommendationMode ? ` · ${result.recommendationMode}` : "";
    console.log(`  - ${status} ${result.id} ${result.goal} · ${result.clarifyAction}${result.postSearchAction ? ` -> ${result.postSearchAction}` : ""}${recommendation}`);
    if (!result.pass) {
      result.failures.forEach((failure) => console.log(chalk.red(`    ${failure}`)));
    }
  });

  console.log(
    `\n${chalk.bold("Regression:")} ${chalk.cyan(summary.regression.passed)} / ${summary.regression.total}`
  );
  summary.regression.results.forEach((result) => {
    const status = result.pass ? chalk.green("PASS") : chalk.red("FAIL");
    console.log(
      `  - ${status} ${result.id} (${result.expectedLabel}) · top3 GitHub ${result.githubInTop3} · top5 GitHub ${result.githubInTop5}`
    );
    if (!result.pass) {
      result.failures.forEach((failure) => console.log(chalk.red(`    ${failure}`)));
    }
  });

  console.log(chalk.dim(`\nManual checklist: ${summary.manualChecklistPath}`));
  console.log(chalk.dim(`Snapshot baseline: ${summary.regression.snapshotDir}`));
  return undefined;
}
