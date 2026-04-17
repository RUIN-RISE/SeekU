import { describe, expect, it } from "vitest";

import type { EvidenceItem, Person, SearchDocument } from "@seeku/db";

import {
  DailyDealFlowCurator,
  OpportunityScorer,
  buildCandidateDirectionProfile,
  buildUserGoalModel,
  type OpportunityCandidateInput
} from "../daily-deal-flow.js";

function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    primaryName: `Person ${id}`,
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

function makeEvidence(personId: string, overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: `${personId}-evidence-1`,
    personId,
    sourceProfileId: null,
    source: "bonjour",
    evidenceType: "project",
    title: null,
    description: null,
    url: null,
    occurredAt: null,
    metadata: {},
    evidenceHash: `${personId}-hash-1`,
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

function makeDocument(personId: string, overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    personId,
    docText: "",
    facetRole: [],
    facetLocation: [],
    facetSource: [],
    facetTags: [],
    rankFeatures: {
      evidenceCount: 0,
      projectCount: 0,
      repoCount: 0,
      followerCount: 0,
      freshness: 30
    },
    updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

function makeCandidateInput(overrides: Partial<OpportunityCandidateInput> & { person: Person }): OpportunityCandidateInput {
  return {
    person: overrides.person,
    document: overrides.document,
    evidence: overrides.evidence ?? [],
    directionProfile: overrides.directionProfile,
    state: overrides.state
  };
}

describe("OpportunityScorer", () => {
  it("keeps direction match ahead of secondary signals", () => {
    const goalModel = buildUserGoalModel({
      explicitGoal: "Find a cofounder for AI agent developer tools"
    });
    const scorer = new OpportunityScorer();

    const strongMatchPerson = makePerson("strong", {
      primaryHeadline: "Building AI agent developer tools",
      summary: "Open source builder focused on agent workflows"
    });
    const weakMatchPerson = makePerson("weak", {
      primaryHeadline: "Fintech growth operator",
      summary: "B2B payments and trading community builder"
    });

    const strongMatch = scorer.scoreCandidate(
      goalModel,
      makeCandidateInput({
        person: strongMatchPerson,
        document: makeDocument("strong", {
          facetSource: ["github"],
          rankFeatures: {
            evidenceCount: 4,
            projectCount: 1,
            repoCount: 1,
            followerCount: 0,
            freshness: 120
          }
        }),
        evidence: [
          makeEvidence("strong", {
            evidenceType: "repository",
            title: "Open source agent tooling"
          })
        ]
      })
    );

    const weakMatch = scorer.scoreCandidate(
      goalModel,
      makeCandidateInput({
        person: weakMatchPerson,
        document: makeDocument("weak", {
          facetSource: ["bonjour"],
          rankFeatures: {
            evidenceCount: 8,
            projectCount: 4,
            repoCount: 0,
            followerCount: 0,
            freshness: 1
          }
        }),
        evidence: [
          makeEvidence("weak", {
            title: "High-signal recent profile"
          })
        ],
        state: {
          detailViewCount: 3,
          repeatViewCount: 3
        }
      })
    );

    expect(strongMatch.breakdown.directionMatch).toBeGreaterThan(weakMatch.breakdown.directionMatch);
    expect(strongMatch.totalScore).toBeGreaterThan(weakMatch.totalScore);
    expect(weakMatch.breakdown.total).toBeLessThan(0.35);
  });

  it("generates complete action payloads and revisit bucketing", () => {
    const goalModel = buildUserGoalModel({
      explicitGoal: "Find a cofounder for education AI products"
    });
    const scorer = new OpportunityScorer();
    const person = makePerson("revisit", {
      primaryHeadline: "Building AI education tools",
      summary: "Edtech founder working on learning products"
    });

    const result = scorer.scoreCandidate(
      goalModel,
      makeCandidateInput({
        person,
        document: makeDocument("revisit", {
          facetSource: ["bonjour"],
          rankFeatures: {
            evidenceCount: 3,
            projectCount: 1,
            repoCount: 0,
            followerCount: 0,
            freshness: 14
          }
        }),
        evidence: [
          makeEvidence("revisit", {
            title: "AI education platform"
          })
        ],
        state: {
          lastFeedbackKind: "revisit",
          daysSinceLastSurfaced: 9
        }
      })
    );

    expect(result.bucket).toBe("revisit");
    expect(result.whyMatched.length).toBeGreaterThan(0);
    expect(result.whyNow.length).toBeGreaterThan(0);
    expect(result.approachPath.length).toBeGreaterThan(0);
    expect(["high", "medium", "low"]).toContain(result.confidence);
  });
});

describe("DailyDealFlowCurator", () => {
  it("builds a dated artifact with top-today split and suppresses contacted candidates", () => {
    const goalModel = buildUserGoalModel({
      explicitGoal: "Find a cofounder for AI agent products"
    });
    const scorer = new OpportunityScorer();
    const curator = new DailyDealFlowCurator({ size: 5, topCount: 3 });

    const candidates = [
      makeCandidateInput({
        person: makePerson("p1", {
          primaryHeadline: "AI agent builder",
          summary: "Developer tools and open source"
        }),
        document: makeDocument("p1", { facetSource: ["github"] })
      }),
      makeCandidateInput({
        person: makePerson("p2", {
          primaryHeadline: "Enterprise AI founder",
          summary: "Agent workflows for teams"
        }),
        document: makeDocument("p2", { facetSource: ["bonjour"] })
      }),
      makeCandidateInput({
        person: makePerson("p3", {
          primaryHeadline: "AI infra engineer",
          summary: "Inference and agent infrastructure"
        }),
        document: makeDocument("p3", { facetSource: ["github"] })
      }),
      makeCandidateInput({
        person: makePerson("p4", {
          primaryHeadline: "Education AI product builder",
          summary: "Learning tooling"
        }),
        document: makeDocument("p4", { facetSource: ["bonjour"] })
      }),
      makeCandidateInput({
        person: makePerson("p5", {
          primaryHeadline: "Open source agent platform",
          summary: "Developer tools"
        }),
        document: makeDocument("p5", { facetSource: ["github"] }),
        state: {
          contactedAt: new Date("2026-04-16T00:00:00.000Z")
        }
      })
    ];

    const scored = candidates.map((candidate) =>
      scorer.scoreCandidate(goalModel, {
        ...candidate,
        directionProfile: buildCandidateDirectionProfile(candidate.person, candidate.evidence)
      })
    );
    const artifact = curator.curate(scored, new Date("2026-04-17T09:00:00.000Z"));

    expect(artifact.generatedForDate).toBe("2026-04-17");
    expect(artifact.topToday).toHaveLength(3);
    expect(artifact.moreOpportunities.length).toBeLessThanOrEqual(2);
    expect(artifact.totalCandidates).toBe(4);
    expect(
      artifact.topToday.concat(artifact.moreOpportunities).some((candidate) => candidate.personId === "p5")
    ).toBe(false);
  });
});
