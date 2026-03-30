import { describe, expect, it, vi } from "vitest";
import { HybridScoringEngine } from "../scorer.js";
import { TerminalUI } from "../tui.js";

const DAY_MS = 1000 * 60 * 60 * 24;

describe("TerminalUI sort parser", () => {
  it("accepts fresh/source/evidence sort modes", () => {
    const ui = new TerminalUI();
    const parseShortlistCommand = (ui as any).parseShortlistCommand.bind(ui) as (input: string) => {
      type: string;
      sortMode?: string;
    };

    expect(parseShortlistCommand("sort fresh")).toMatchObject({ type: "sort", sortMode: "fresh" });
    expect(parseShortlistCommand("sort source")).toMatchObject({ type: "sort", sortMode: "source" });
    expect(parseShortlistCommand("sort evidence")).toMatchObject({ type: "sort", sortMode: "evidence" });
  });
});

describe("HybridScoringEngine rerank helpers", () => {
  const scorer = new HybridScoringEngine({
    name: "mock",
    chat: vi.fn(),
    embed: vi.fn(),
    embedBatch: vi.fn()
  } as any);

  it("gives fresher candidates a higher freshness score", () => {
    const recent = scorer.scoreFreshness({
      latestEvidenceAt: new Date(Date.now() - DAY_MS * 3),
      lastSyncedAt: new Date(Date.now() - DAY_MS * 5)
    });

    const stale = scorer.scoreFreshness({
      latestEvidenceAt: new Date(Date.now() - DAY_MS * 180),
      lastSyncedAt: new Date(Date.now() - DAY_MS * 220)
    });

    expect(recent).toBeGreaterThan(stale);
  });

  it("prefers Bonjour-backed candidates in source sort", () => {
    const bonjourFirst = scorer.scoreRerankCandidate(
      "source",
      {
        matchScore: 0.72,
        sources: ["Bonjour"],
        bonjourUrl: "https://bonjour.example/ada",
        latestEvidenceAt: new Date(Date.now() - DAY_MS * 7),
        lastSyncedAt: new Date(Date.now() - DAY_MS * 7)
      },
      []
    );

    const githubOnly = scorer.scoreRerankCandidate(
      "source",
      {
        matchScore: 0.72,
        sources: ["GitHub"],
        latestEvidenceAt: new Date(Date.now() - DAY_MS * 7),
        lastSyncedAt: new Date(Date.now() - DAY_MS * 7)
      },
      []
    );

    expect(bonjourFirst).toBeGreaterThan(githubOnly);
  });

  it("treats project and repository evidence as stronger than profile-only evidence", () => {
    const strongEvidence = scorer.scoreEvidenceStrength([
      {
        evidenceType: "project",
        title: "Built multi-agent RAG workflow",
        source: "bonjour",
        occurredAt: new Date(Date.now() - DAY_MS * 10)
      },
      {
        evidenceType: "repository",
        title: "open-source inference tooling",
        source: "github",
        occurredAt: new Date(Date.now() - DAY_MS * 20)
      }
    ] as any);

    const weakEvidence = scorer.scoreEvidenceStrength([
      {
        evidenceType: "profile_field",
        title: "Headline",
        description: "Backend engineer",
        source: "bonjour"
      }
    ] as any);

    expect(strongEvidence).toBeGreaterThan(weakEvidence);
  });
});
