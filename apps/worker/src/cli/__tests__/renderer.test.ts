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

  it("shows bonjour, github, website, and project links as first-class detail links", () => {
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
        sources: ["Bonjour", "GitHub", "Web"],
        bonjourUrl: "https://bonjour.example/ada",
        primaryLinks: [
          { type: "bonjour", label: "Bonjour", url: "https://bonjour.example/ada" },
          { type: "github", label: "GitHub", url: "https://github.com/ada" },
          { type: "website", label: "个人站点", url: "https://ada.dev" },
          { type: "project", label: "作品页：推理平台", url: "https://ada.dev/projects/inference" }
        ]
      }
    );

    expect(output).toContain("主链接");
    expect(output).toContain("Bonjour：https://bonjour.example/ada");
    expect(output).toContain("GitHub：https://github.com/ada");
    expect(output).toContain("个人站点：https://ada.dev");
    expect(output).toContain("作品页：推理平台：https://ada.dev/projects/inference");
  });

  it("shows weak-result warning in detail and why views", () => {
    const detailOutput = renderer.renderProfile(
      {
        id: "person-2",
        primaryName: "Lin",
        primaryHeadline: "Generalist Builder"
      } as any,
      [],
      {
        dimensions: {
          techMatch: 42,
          locationMatch: 60,
          careerStability: 55,
          projectDepth: 38,
          academicImpact: 20,
          communityReputation: 25
        },
        overallScore: 43,
        summary: "画像信息有限。",
        highlights: []
      },
      "地点命中：杭州",
      {
        queryReasons: ["地点命中：杭州"],
        matchStrength: "weak",
        sources: ["Bonjour"]
      }
    );

    const whyOutput = renderer.renderWhyMatched(
      {
        personId: "person-2",
        name: "Lin",
        headline: "Generalist Builder",
        location: "杭州",
        company: null,
        experienceYears: null,
        matchScore: 31,
        matchStrength: "weak",
        matchReason: "地点命中：杭州",
        queryReasons: ["地点命中：杭州"],
        sources: ["Bonjour"]
      },
      {
        dimensions: {
          techMatch: 42,
          locationMatch: 60,
          careerStability: 55,
          projectDepth: 38,
          academicImpact: 20,
          communityReputation: 25
        },
        overallScore: 43,
        summary: "画像信息有限。",
        highlights: []
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

    expect(detailOutput).toContain("没有找到强匹配");
    expect(whyOutput).toContain("没有找到强匹配");
  });

  it("renders complete evidence cards in detail view", () => {
    const output = renderer.renderProfile(
      {
        id: "person-4",
        primaryName: "Mina",
        primaryHeadline: "ML Infrastructure Engineer"
      } as any,
      [
        {
          personId: "person-4",
          evidenceType: "repository",
          title: "python serving toolkit",
          description: "Built python-based inference tooling",
          source: "github",
          url: "https://github.com/mina/serving-toolkit",
          occurredAt: new Date("2026-03-29T00:00:00.000Z")
        }
      ] as any,
      {
        dimensions: {
          techMatch: 88,
          locationMatch: 70,
          careerStability: 72,
          projectDepth: 82,
          academicImpact: 28,
          communityReputation: 44
        },
        overallScore: 80,
        summary: "持续做推理基础设施与工程平台。",
        highlights: ["维护线上 serving 工具链"]
      },
      "技术命中：python",
      {
        queryReasons: ["技术命中：python"],
        matchStrength: "strong",
        sources: ["GitHub"]
      }
    );

    expect(output).toContain("[证据 1]");
    expect(output).toContain("来源：GitHub · repository");
    expect(output).toContain("标题：python serving toolkit");
    expect(output).toContain("时间：2天前");
    expect(output).toContain("URL：https://github.com/mina/serving-toolkit");
    expect(output).toContain("为什么相关：提到技术 python");
  });

  it("renders tri-state condition audit in detail and why views", () => {
    const detailOutput = renderer.renderProfile(
      {
        id: "person-3",
        primaryName: "Kai",
        primaryHeadline: "Python Backend Engineer"
      } as any,
      [],
      {
        dimensions: {
          techMatch: 72,
          locationMatch: 88,
          careerStability: 60,
          projectDepth: 58,
          academicImpact: 20,
          communityReputation: 30
        },
        overallScore: 68,
        summary: "做过后端与自动化项目。",
        highlights: []
      },
      "技术命中：python，地点命中：杭州",
      {
        queryReasons: ["技术命中：python", "地点命中：杭州"],
        matchStrength: "medium",
        conditionAudit: [
          { label: "地点", status: "met", detail: "命中 杭州" },
          { label: "来源过滤", status: "unmet", detail: "当前来源为 Bonjour" },
          { label: "技能 cuda", status: "unknown", detail: "当前资料未明确提到 cuda" }
        ],
        sources: ["Bonjour"]
      }
    );

    const whyOutput = renderer.renderWhyMatched(
      {
        personId: "person-3",
        name: "Kai",
        headline: "Python Backend Engineer",
        location: "杭州",
        company: null,
        experienceYears: null,
        matchScore: 68,
        matchStrength: "medium",
        matchReason: "技术命中：python，地点命中：杭州",
        queryReasons: ["技术命中：python", "地点命中：杭州"],
        conditionAudit: [
          { label: "地点", status: "met", detail: "命中 杭州" },
          { label: "来源过滤", status: "unmet", detail: "当前来源为 Bonjour" },
          { label: "技能 cuda", status: "unknown", detail: "当前资料未明确提到 cuda" }
        ],
        sources: ["Bonjour"]
      },
      {
        dimensions: {
          techMatch: 72,
          locationMatch: 88,
          careerStability: 60,
          projectDepth: 58,
          academicImpact: 20,
          communityReputation: 30
        },
        overallScore: 68,
        summary: "做过后端与自动化项目。",
        highlights: []
      },
      {
        skills: ["python", "cuda"],
        locations: ["杭州"],
        experience: undefined,
        role: undefined,
        sourceBias: "github",
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      }
    );

    expect(detailOutput).toContain("条件审计");
    expect(detailOutput).toContain("已满足");
    expect(detailOutput).toContain("未满足");
    expect(detailOutput).toContain("暂无证据");
    expect(whyOutput).toContain("已满足 1 · 未满足 1 · 暂无证据 1");
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

    expect(output).toContain("核心证据");
    expect(output).toContain("AI 建议");
    expect(output).toContain("建议动作");
    expect(output).toContain("Seeku 决策对比工作台 (Decision View)");
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
    expect(output).toContain("🔗 Bonjour：https://bonjour.example/ada");
    expect(output).toContain("主导搜索平台重构");
    expect(output).toContain("维护 Python 自动化工具链");
    expect(output).toContain("💡 决策优先");
    expect(output).toContain("执行理由");
    expect(output).toContain("即刻动作");
  });
});
