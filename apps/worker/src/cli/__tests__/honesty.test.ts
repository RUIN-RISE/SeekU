import { describe, expect, it } from "vitest";
import { TerminalRenderer } from "../renderer.js";
import {
  buildConditionAudit,
  buildQueryMatchExplanation,
  buildResultWarning,
  classifyMatchStrength
} from "../workflow.js";

const renderer = new TerminalRenderer();

describe("honesty regression", () => {
  it("keeps shortlist summary short while preserving full reasons for detail surfaces", () => {
    const explanation = buildQueryMatchExplanation(
      {
        primaryName: "Ada",
        primaryHeadline: "Backend Engineer",
        primaryLocation: "杭州",
        summary: "长期做平台工程"
      },
      {
        docText: "backend engineer using python and cuda for inference",
        facetRole: ["backend"],
        facetTags: ["python", "cuda"],
        facetLocation: ["杭州"]
      },
      [
        {
          evidenceType: "project",
          title: "Inference stack",
          description: "Python and CUDA serving platform"
        }
      ],
      {
        skills: ["python", "cuda"],
        locations: ["杭州"],
        experience: "senior",
        role: "backend",
        sourceBias: "github",
        mustHave: ["inference"],
        niceToHave: [],
        exclude: [],
        preferFresh: true,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        score: 0.83,
        retrievalReasons: [
          "skill evidence: python",
          "must-have matched: inference",
          "project: Inference stack",
          "strong semantic similarity",
          "strong keyword overlap"
        ],
        sources: ["GitHub"],
        referenceDate: new Date("2026-03-30T00:00:00.000Z"),
        experienceMatched: true
      }
    );

    const audit = buildConditionAudit(
      {
        primaryName: "Ada",
        primaryHeadline: "Backend Engineer",
        primaryLocation: "杭州",
        summary: "长期做平台工程"
      },
      {
        docText: "backend engineer using python and cuda for inference",
        facetRole: ["backend"],
        facetTags: ["python", "cuda"],
        facetLocation: ["杭州"]
      },
      [
        {
          evidenceType: "project",
          title: "Inference stack",
          description: "Python and CUDA serving platform"
        }
      ],
      {
        skills: ["python", "cuda"],
        locations: ["杭州"],
        experience: "senior",
        role: "backend",
        sourceBias: "github",
        mustHave: ["inference"],
        niceToHave: [],
        exclude: [],
        preferFresh: true,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        sources: ["GitHub"],
        referenceDate: new Date("2026-03-30T00:00:00.000Z"),
        experienceMatched: true
      }
    );

    const matchStrength = classifyMatchStrength(0.83, explanation.reasons);
    const whyOutput = renderer.renderWhyMatched(
      {
        personId: "person-1",
        name: "Ada",
        headline: "Backend Engineer",
        location: "杭州",
        company: null,
        experienceYears: null,
        matchScore: 0.83,
        matchStrength,
        matchReason: explanation.summary,
        queryReasons: explanation.reasons,
        conditionAudit: audit,
        sources: ["GitHub"]
      },
      {
        dimensions: {
          techMatch: 88,
          locationMatch: 95,
          careerStability: 70,
          projectDepth: 84,
          academicImpact: 30,
          communityReputation: 42
        },
        overallScore: 81,
        summary: "长期做后端与推理系统。",
        highlights: []
      },
      {
        skills: ["python", "cuda"],
        locations: ["杭州"],
        experience: "senior",
        role: "backend",
        sourceBias: "github",
        mustHave: ["inference"],
        niceToHave: [],
        exclude: [],
        preferFresh: true,
        candidateAnchor: undefined,
        limit: 10
      }
    );

    expect(explanation.summary).toBe("地点命中：杭州，角色贴合：backend");
    expect(explanation.reasons.length).toBeGreaterThan(5);
    expect(matchStrength).toBe("strong");
    expect(whyOutput).toContain("细项：检索技能命中：python");
    expect(whyOutput).toContain("条件审计：已满足");
  });

  it("warns honestly when only weak candidates remain", () => {
    const warning = buildResultWarning([
      { matchStrength: "weak" },
      { matchStrength: "weak" }
    ]);

    expect(warning).toContain("没有找到强匹配");
    expect(warning).toContain("只找到了弱相关候选人");
  });
});
