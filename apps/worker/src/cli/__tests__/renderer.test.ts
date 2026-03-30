import { describe, expect, it } from "vitest";
import { TerminalRenderer } from "../renderer.js";

describe("TerminalRenderer", () => {
  const renderer = new TerminalRenderer();

  it("separates query-aware reasons from generic profile summary in why view", () => {
    const output = renderer.renderWhyMatched(
      {
        personId: "person-1",
        name: "Ada",
        headline: "Python Backend Engineer",
        location: "杭州",
        company: null,
        experienceYears: null,
        matchScore: 82,
        matchReason: "技术命中：python，地点命中：杭州",
        queryReasons: ["技术命中：python", "地点命中：杭州"],
        sources: ["Bonjour"]
      },
      {
        dimensions: {
          techMatch: 90,
          locationMatch: 100,
          careerStability: 75,
          projectDepth: 80,
          academicImpact: 55,
          communityReputation: 60
        },
        overallScore: 84,
        summary: "长期做后端与数据系统建设。",
        highlights: ["主导过核心平台项目"]
      },
      {
        skills: ["python"],
        locations: ["杭州"],
        experience: undefined,
        role: undefined,
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      }
    );

    expect(output).toContain("当前查询");
    expect(output).toContain("技术命中：python");
    expect(output).toContain("通用画像总结");
    expect(output).toContain("长期做后端与数据系统建设");
  });

  it("shows query reasons and generic summary separately in detail view", () => {
    const output = renderer.renderProfile(
      {
        id: "person-1",
        primaryName: "Ada",
        primaryHeadline: "Python Backend Engineer"
      } as any,
      [],
      {
        dimensions: {
          techMatch: 90,
          locationMatch: 100,
          careerStability: 75,
          projectDepth: 80,
          academicImpact: 55,
          communityReputation: 60
        },
        overallScore: 84,
        summary: "长期做后端与数据系统建设。",
        highlights: ["主导过核心平台项目"]
      },
      "技术命中：python，地点命中：杭州",
      {
        queryReasons: ["技术命中：python", "地点命中：杭州"],
        sources: ["Bonjour"],
        bonjourUrl: "https://bonjour.example/ada"
      }
    );

    expect(output).toContain("本次搜索为什么匹配");
    expect(output).toContain("技术命中：python");
    expect(output).toContain("通用画像总结");
    expect(output).toContain("长期做后端与数据系统建设");
  });
});
