import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalRenderer } from "../renderer.js";

describe("TerminalRenderer", () => {
  const renderer = new TerminalRenderer();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
        matchStrength: "strong",
        sources: ["Bonjour"],
        bonjourUrl: "https://bonjour.example/ada"
      }
    );

    expect(output).toContain("强匹配");
    expect(output).toContain("本次搜索为什么匹配");
    expect(output).toContain("技术命中：python");
    expect(output).toContain("通用画像总结");
    expect(output).toContain("长期做后端与数据系统建设");
  });

  it("uses Chinese labels in compare view", () => {
    const output = renderer.renderComparison([
      {
        shortlistIndex: 1,
        candidate: {
          personId: "person-1",
          name: "Ada",
          headline: "Python Backend Engineer",
          location: "杭州",
          company: null,
          experienceYears: null,
          matchScore: 82,
          matchReason: "技术命中：python，地点命中：杭州",
          queryReasons: ["技术命中：python", "地点命中：杭州"],
          sources: ["Bonjour"],
          bonjourUrl: "https://bonjour.example/ada"
        },
        profile: {
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
        topEvidence: [
          {
            evidenceType: "project",
            title: "主导搜索平台重构",
            sourceLabel: "Bonjour",
            freshnessLabel: "3天前"
          }
        ],
        decisionTag: "优先深看",
        decisionScore: 92,
        recommendation: "建议优先打开：技术命中明确，地点完全匹配",
        nextStep: "先看详情，再打开 Bonjour 深看"
      }
    ], {
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
    });

    expect(output).toContain("关键证据");
    expect(output).toContain("建议");
    expect(output).toContain("下一步");
    expect(output).toContain("Seeku 决策对比视图");
    expect(output).not.toContain("Top Evidence");
    expect(output).not.toContain("Recommendation");
    expect(output).not.toContain("Next Click");
  });

  it("shows decision-ready compare signals in compare view", () => {
    const output = renderer.renderComparison([
      {
        shortlistIndex: 1,
        candidate: {
          personId: "person-1",
          name: "Ada",
          headline: "Python Backend Engineer",
          location: "杭州",
          company: null,
          experienceYears: null,
          matchScore: 82,
          matchReason: "技术命中：python，地点命中：杭州",
          queryReasons: ["技术命中：python", "地点命中：杭州"],
          sources: ["Bonjour", "GitHub"],
          bonjourUrl: "https://bonjour.example/ada",
          latestEvidenceAt: new Date("2026-03-29T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-30T00:00:00.000Z")
        },
        profile: {
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
        topEvidence: [
          {
            evidenceType: "project",
            title: "主导搜索平台重构",
            sourceLabel: "Bonjour",
            freshnessLabel: "2天前"
          },
          {
            evidenceType: "repository",
            title: "维护 Python 自动化工具链",
            sourceLabel: "GitHub",
            freshnessLabel: "1周前"
          }
        ],
        decisionTag: "优先深看",
        decisionScore: 92,
        recommendation: "建议优先打开：技术命中明确，地点完全匹配",
        nextStep: "先看详情，再打开 Bonjour 深看"
      }
    ]);

    expect(output).toContain("Bonjour");
    expect(output).toContain("GitHub");
    expect(output).toContain("新鲜 2天");
    expect(output).toContain("Bonjour 链接：https://bonjour.example/ada");
    expect(output).toContain("主导搜索平台重构");
    expect(output).toContain("维护 Python 自动化工具链");
    expect(output).toContain("推荐先看");
    expect(output).toContain("建议优先打开：技术命中明确，地点完全匹配");
    expect(output).toContain("先看详情，再打开 Bonjour 深看");
  });
});
