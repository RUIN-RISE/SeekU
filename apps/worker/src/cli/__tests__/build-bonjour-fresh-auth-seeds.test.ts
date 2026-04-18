import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runBuildBonjourFreshAuthSeedsCommand, scoreFreshSeedCandidate } from "../build-bonjour-fresh-auth-seeds.js";

describe("build-bonjour-fresh-auth-seeds", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "seeku-fresh-auth-seeds-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("scores fresh conversational candidates above weaker history-only candidates", () => {
    const stronger = scoreFreshSeedCandidate({
      handle: "fresh-comment",
      name: "浙大 AI 创业者",
      occurrences: 3,
      sourceKinds: ["post_comment", "global_timeline"],
      freshSourceCount: 2,
      historySourceCount: 0
    }, ["浙大", "ai"]);

    const weaker = scoreFreshSeedCandidate({
      handle: "history-like",
      name: null,
      occurrences: 3,
      sourceKinds: ["post_like"],
      freshSourceCount: 0,
      historySourceCount: 2
    }, ["浙大", "ai"]);

    expect(stronger.score).toBeGreaterThan(weaker.score);
  });

  it("builds a ranked seed file from fresh inputs and exclusions", async () => {
    const freshInput = path.join(tmpDir, "fresh.json");
    const historyInput = path.join(tmpDir, "history.json");
    const excludeInput = path.join(tmpDir, "exclude.json");
    const outputPath = path.join(tmpDir, "out.json");

    await writeFile(freshInput, JSON.stringify([
      {
        handle: "fresh-top",
        name: "浙大 AI 创业者",
        occurrences: 3,
        sourceKinds: ["post_comment", "external_import"]
      },
      {
        handle: "timeline-only",
        name: "杭州产品人",
        occurrences: 1,
        sourceKinds: ["global_timeline"]
      }
    ], null, 2));
    await writeFile(historyInput, JSON.stringify([
      {
        handle: "fresh-top",
        name: "浙大 AI 创业者",
        occurrences: 2,
        sourceKinds: ["post_comment"]
      },
      {
        handle: "old-liked",
        name: null,
        occurrences: 4,
        sourceKinds: ["post_like"]
      }
    ], null, 2));
    await writeFile(excludeInput, JSON.stringify(["timeline-only"], null, 2));

    await runBuildBonjourFreshAuthSeedsCommand([
      "--fresh-input", freshInput,
      "--history-input", historyInput,
      "--exclude", excludeInput,
      "--keyword", "浙大",
      "--keyword", "ai",
      "--output", outputPath,
      "--limit", "10"
    ]);

    const output = JSON.parse(await readFile(outputPath, "utf8")) as Array<Record<string, unknown>>;
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({
      handle: "fresh-top",
      freshSourceCount: 1,
      historySourceCount: 1
    });
    expect(Number(output[0]?.score)).toBeGreaterThan(0);
  });
});
