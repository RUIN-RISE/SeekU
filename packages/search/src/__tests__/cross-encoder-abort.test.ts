import { describe, expect, it, vi } from "vitest";

import type { EvidenceItem } from "@seeku/db";

import { CrossEncoder, extractCandidateSummary } from "../cross-encoder.js";

function makeCandidateSummary() {
  return {
    personId: "person-1",
    name: "Ada",
    headline: "Python Engineer",
    location: null,
    skills: ["python"],
    roles: ["engineer"],
    projects: [],
    repositories: [],
    experiences: [],
    latestEvidenceAt: null
  };
}

function makeEvidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: "evidence-1",
    personId: "person-1",
    sourceProfileId: null,
    source: "github",
    evidenceType: "repository",
    title: "repo",
    description: null,
    url: null,
    occurredAt: null,
    metadata: {},
    evidenceHash: "hash-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("CrossEncoder abort", () => {
  it("rethrows when parent signal aborts scoring", async () => {
    const controller = new AbortController();
    const provider = {
      chat: vi.fn(async (_messages: unknown, options?: { signal?: AbortSignal }) =>
        await new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        })
      )
    };

    const encoder = new CrossEncoder({
      provider: provider as any,
      timeoutMs: 5000
    });

    const scoring = encoder.scoreBatch(
      {
        rawQuery: "python engineer",
        roles: ["engineer"],
        skills: ["python"],
        locations: [],
        mustHaves: [],
        niceToHaves: []
      },
      [makeCandidateSummary()],
      { signal: controller.signal }
    );

    controller.abort(new Error("cross encoder interrupted"));

    await expect(scoring).rejects.toThrow("cross encoder interrupted");
  });
});

describe("CrossEncoder scoring failures", () => {
  it("drops unparsable candidate scores instead of returning zero-score negatives", async () => {
    const provider = {
      chat: vi.fn(async () => ({ content: "not json", model: "mock" }))
    };
    const encoder = new CrossEncoder({
      provider: provider as any,
      timeoutMs: 5000
    });

    const scores = await encoder.scoreBatch(
      {
        rawQuery: "python engineer",
        roles: ["engineer"],
        skills: ["python"],
        locations: [],
        mustHaves: [],
        niceToHaves: []
      },
      [makeCandidateSummary()]
    );

    expect(scores).toEqual([]);
  });
});

describe("extractCandidateSummary", () => {
  it("uses GitHub repository metadata for latestEvidenceAt without social freshness pollution", () => {
    const summary = extractCandidateSummary(
      undefined,
      [
        makeEvidence({
          id: "repo-1",
          evidenceType: "repository",
          occurredAt: null,
          metadata: {
            pushedAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-10T00:00:00.000Z",
            createdAt: "2025-12-01T00:00:00.000Z"
          }
        }),
        makeEvidence({
          id: "social-1",
          evidenceType: "social",
          source: "bonjour",
          occurredAt: new Date("2026-04-25T00:00:00.000Z")
        }),
        makeEvidence({
          id: "project-1",
          evidenceType: "project",
          source: "bonjour",
          occurredAt: new Date("2026-03-01T00:00:00.000Z")
        })
      ],
      "person-1",
      {
        primaryName: "Ada",
        primaryHeadline: "Python Engineer"
      }
    );

    expect(summary.latestEvidenceAt?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
  });
});
