import { describe, expect, it } from "vitest";

import type { EvidenceItem, Person } from "@seeku/db";

import {
  buildCandidateDirectionProfile,
  buildUserGoalModel,
  toDirectionFacetTags
} from "../daily-deal-flow.js";

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    primaryName: "Test Person",
    primaryHeadline: null,
    summary: null,
    primaryLocation: null,
    avatarUrl: null,
    searchStatus: "active",
    confidenceScore: "0.8",
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: "evidence-1",
    personId: "person-1",
    sourceProfileId: null,
    source: "bonjour",
    evidenceType: "profile_field",
    title: "Focus",
    description: null,
    url: null,
    occurredAt: null,
    metadata: {},
    evidenceHash: "hash-1",
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

describe("daily-deal-flow candidate direction profile", () => {
  it("extracts direction tags from public-expression evidence", () => {
    const person = makePerson({
      primaryHeadline: "Building agent tooling for developer workflows",
      summary: "Open source founder working on AI infra and developer tools"
    });

    const profile = buildCandidateDirectionProfile(person, [
      makeEvidence({
        description: "Current doing: AI agent workflows for enterprise automation",
        metadata: { field: "current_doing" }
      }),
      makeEvidence({
        id: "evidence-2",
        evidenceType: "project",
        title: "Open source agent platform for developer tools",
        description: "Helps teams ship agent workflows faster"
      })
    ]);

    expect(profile.directionTags).toEqual(
      expect.arrayContaining(["ai_agents", "developer_tools", "ai_infra", "open_source", "enterprise_ai"])
    );
    expect(profile.confidence).toBe("high");
    expect(profile.summary).toContain("AI agents");
    expect(profile.publicEvidenceCount).toBeGreaterThanOrEqual(3);
    expect(profile.signals.some((signal) => signal.source === "headline")).toBe(true);
  });

  it("creates namespaced direction facet tags for downstream indexing", () => {
    expect(toDirectionFacetTags(["ai_agents", "developer_tools"])).toEqual([
      "direction:ai_agents",
      "direction:developer_tools"
    ]);
  });
});

describe("daily-deal-flow user goal model", () => {
  it("combines explicit goal, recent searches, and negative filters into a goal model", () => {
    const model = buildUserGoalModel({
      explicitGoal: "Find a cofounder to build AI agents and developer tools",
      currentSignalTexts: ["AI infra", "developer tools", "agent workflows"],
      excludedSignalTexts: ["fintech"],
      recentSearches: [
        {
          query: "agent founder",
          signalTexts: ["open source developer tools"]
        },
        {
          signalTexts: ["enterprise AI workflows"]
        }
      ]
    });

    expect(model.explicitDirectionTags).toEqual(
      expect.arrayContaining(["ai_agents", "developer_tools"])
    );
    expect(model.dominantDirectionTags.slice(0, 3)).toEqual(
      expect.arrayContaining(["ai_agents", "developer_tools"])
    );
    expect(model.negativeDirectionTags).toContain("fintech");
    expect(model.signalSources).toEqual(
      expect.arrayContaining(["explicit_goal", "current_conditions", "search_history"])
    );
    expect(model.summary).toContain("Current goal centers on");
  });

  it("marks drift when recent behavior diverges from the explicit goal", () => {
    const model = buildUserGoalModel({
      explicitGoal: "Find a cofounder for education products",
      recentSearches: [
        { signalTexts: ["healthcare robotics founder"] }
      ]
    });

    expect(model.explicitDirectionTags).toEqual(["education"]);
    expect(model.recentDirectionTags).toEqual(
      expect.arrayContaining(["healthcare", "robotics"])
    );
    expect(model.driftStatus).toBe("shifting");
    expect(model.summary).toContain("Explicit goal leans");
  });

  it("treats interaction and feedback signals as recent behavior for drift detection", () => {
    const model = buildUserGoalModel({
      explicitGoal: "Find a cofounder for education products",
      feedbackEvents: [
        {
          kind: "interested",
          directionTags: ["fintech"]
        }
      ],
      interactionEvents: [
        {
          kind: "detail_view",
          directionTags: ["healthcare"]
        }
      ]
    });

    expect(model.recentDirectionTags).toEqual(
      expect.arrayContaining(["fintech", "healthcare"])
    );
    expect(model.signalSources).toEqual(
      expect.arrayContaining(["feedback", "interaction"])
    );
    expect(model.driftStatus).toBe("shifting");
  });
});
