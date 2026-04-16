import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  evaluateRegressionFixture,
  runAcceptanceEval,
  runAgentEval
} from "../agent-eval.js";
import { AGENT_REGRESSION_FIXTURES } from "../agent-eval-fixtures.js";

const SNAPSHOT_DIR = resolve(
  process.cwd(),
  ".planning/github-expansion/snapshots/ws4-rerun-2026-04-15-controlled-open-followup"
);

describe("agent-eval", () => {
  it("passes the built-in acceptance fixture set", () => {
    const summary = runAcceptanceEval();

    expect(summary.total).toBeGreaterThanOrEqual(10);
    expect(summary.passed).toBe(summary.total);
  });

  it("accepts the saved Q4/Q6/Q8 regression snapshot baseline", async () => {
    const results = await Promise.all(
      AGENT_REGRESSION_FIXTURES.map((fixture) =>
        evaluateRegressionFixture(fixture, SNAPSHOT_DIR)
      )
    );

    expect(results.every((result) => result.pass)).toBe(true);
    expect(results.find((result) => result.id === "Q4")?.githubInTop3).toBeGreaterThanOrEqual(1);
    expect(results.find((result) => result.id === "Q6")?.githubInTop5).toBeGreaterThanOrEqual(5);
    expect(results.find((result) => result.id === "Q8")?.githubInTop5).toBeGreaterThanOrEqual(5);
  });

  it("builds a combined summary with acceptance and regression sections", async () => {
    const summary = await runAgentEval({
      snapshotDir: SNAPSHOT_DIR
    });

    expect(summary.overallPass).toBe(true);
    expect(summary.acceptance.passed).toBe(summary.acceptance.total);
    expect(summary.regression.passed).toBe(summary.regression.total);
    expect(summary.manualChecklistPath).toContain("CLI_AGENT_EVAL_HARNESS_2026-04-16.md");
  });
});
