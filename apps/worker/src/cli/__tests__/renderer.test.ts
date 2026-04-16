import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalRenderer } from "../renderer.js";

describe("TerminalRenderer", () => {
  const renderer = new TerminalRenderer();
  const assessment = (
    summary: string,
    verdict: "strong" | "mixed" | "weak" = "mixed",
    score = 75,
    evidenceTrace: string[] = []
  ) => ({
    score,
    verdict,
    summary,
    evidenceTrace
  });
  const uncertainty = (
    summary: string,
    level: "low" | "medium" | "high" = "medium"
  ) => ({
    level,
    summary
  });

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
        goalFit: assessment("技术命中明确，地点完全匹配", "strong", 92, ["技术命中：python", "地点命中：杭州"]),
        evidenceStrength: assessment("有 1 条清晰项目证据", "mixed", 74, ["项目：主导搜索平台重构"]),
        technicalRelevance: assessment("技术与项目维度都较强", "strong", 88, ["技术 90%", "项目 80%"]),
        sourceQualityRecency: assessment("Bonjour 单源，最近 3 天有更新", "mixed", 72, ["Bonjour", "3天前"]),
        uncertainty: uncertainty("主要依赖单一来源，仍需交叉验证", "medium"),
        whySelected: "技术命中明确，地点完全匹配，值得优先深看。",
        whyNotSelected: "当前没有其他候选人可对照。",
        evidenceTrace: ["技术命中：python", "项目：主导搜索平台重构"],
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

    expect(output).toContain("推荐结果");
    expect(output).toContain("信心等级");
    expect(output).toContain("结构化判断");
    expect(output).toContain("最大不确定性");
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
        goalFit: assessment("技术命中明确，地点完全匹配", "strong", 92, ["技术命中：python", "地点命中：杭州"]),
        evidenceStrength: assessment("两条高价值证据，来源交叉较完整", "strong", 90, ["项目证据", "GitHub 仓库"]),
        technicalRelevance: assessment("技术和项目深度都显著领先", "strong", 91, ["技术 90%", "项目 80%"]),
        sourceQualityRecency: assessment("Bonjour + GitHub，最近 2 天有新证据", "strong", 92, ["Bonjour", "GitHub", "2天前"]),
        uncertainty: uncertainty("仅剩很小的上下文确认风险", "low"),
        whySelected: "技术命中明确，地点完全匹配，且来源和时效都更强。",
        whyNotSelected: "当前优先于其他候选人。",
        evidenceTrace: ["技术命中：python", "项目：主导搜索平台重构", "GitHub：维护 Python 自动化工具链"],
        recommendation: "建议优先打开：技术命中明确，地点完全匹配",
        nextStep: "先看详情，再打开 Bonjour 深看"
      },
      {
        shortlistIndex: 2,
        candidate: {
          personId: "person-2",
          name: "Bo",
          headline: "Backend Engineer",
          location: "上海",
          company: null,
          experienceYears: null,
          matchScore: 70,
          matchReason: "技术命中：python",
          queryReasons: ["技术命中：python"],
          sources: ["Bonjour"],
          bonjourUrl: "https://bonjour.example/bo",
          latestEvidenceAt: new Date("2026-01-05T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-01-10T00:00:00.000Z")
        },
        profile: {
          dimensions: {
            techMatch: 76,
            locationMatch: 60,
            careerStability: 66,
            projectDepth: 62,
            academicImpact: 40,
            communityReputation: 35
          },
          overallScore: 70,
          summary: "做过一些后端项目。",
          highlights: ["有一定工程经验"]
        },
        topEvidence: [
          {
            evidenceType: "project",
            title: "维护内部自动化脚本",
            sourceLabel: "Bonjour",
            freshnessLabel: "2个月前"
          }
        ],
        decisionTag: "继续比较",
        decisionScore: 80,
        goalFit: assessment("技术命中，但地点贴合一般", "mixed", 74, ["技术命中：python"]),
        evidenceStrength: assessment("证据较少且偏旧", "mixed", 62, ["项目：维护内部自动化脚本"]),
        technicalRelevance: assessment("技术相关性尚可，但项目支撑偏弱", "mixed", 68, ["技术 76%", "项目 62%"]),
        sourceQualityRecency: assessment("仅 Bonjour 单源，证据较旧", "weak", 58, ["Bonjour", "2个月前"]),
        uncertainty: uncertainty("地点和证据支撑都不够稳定", "medium"),
        whySelected: "技术命中，但地点和证据都更弱，所以更适合继续比较。",
        whyNotSelected: "地点贴合、证据时效和来源交叉都弱于 Ada。",
        evidenceTrace: ["技术命中：python", "项目：维护内部自动化脚本"],
        recommendation: "建议继续对照：技术命中，但地点和证据都更弱",
        nextStep: "回看第二位详情"
      }
    ]);

    expect(output).toContain("明确推荐");
    expect(output).toContain("高信心");
    expect(output).toContain("Bonjour");
    expect(output).toContain("GitHub");
    expect(output).toContain("新鲜 2天");
    expect(output).toContain("🔗 Bonjour：https://bonjour.example/ada");
    expect(output).toContain("主导搜索平台重构");
    expect(output).toContain("维护 Python 自动化工具链");
    expect(output).toContain("为什么更强");
    expect(output).toContain("为什么没选其他人");
  });

  it("shows conditional recommendation with explicit uncertainty when lead is narrow", () => {
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
          matchScore: 79,
          matchReason: "技术命中：python，地点命中：杭州",
          queryReasons: ["技术命中：python", "地点命中：杭州"],
          sources: ["Bonjour"],
          bonjourUrl: "https://bonjour.example/ada",
          latestEvidenceAt: new Date("2026-03-28T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-29T00:00:00.000Z")
        },
        profile: {
          dimensions: {
            techMatch: 84,
            locationMatch: 95,
            careerStability: 72,
            projectDepth: 70,
            academicImpact: 35,
            communityReputation: 45
          },
          overallScore: 80,
          summary: "做过较稳定的后端项目。",
          highlights: ["有 Python 平台经验"]
        },
        topEvidence: [
          {
            evidenceType: "project",
            title: "做过数据系统项目",
            sourceLabel: "Bonjour",
            freshnessLabel: "3天前"
          }
        ],
        decisionTag: "优先深看",
        decisionScore: 86,
        goalFit: assessment("目标命中明显，但还不是压倒性领先", "strong", 85, ["技术命中：python", "地点命中：杭州"]),
        evidenceStrength: assessment("有 1 条证据，但仍缺交叉验证", "mixed", 68, ["项目：做过数据系统项目"]),
        technicalRelevance: assessment("技术相关性不错，项目深度中等", "mixed", 76, ["技术 84%", "项目 70%"]),
        sourceQualityRecency: assessment("仅 Bonjour 单源，但时效较新", "mixed", 70, ["Bonjour", "3天前"]),
        uncertainty: uncertainty("主要依赖单一来源，仍需补一层交叉验证", "medium"),
        whySelected: "有明显命中，但仍需要补交叉验证。",
        whyNotSelected: "还没有形成足够稳定的压倒性优势。",
        evidenceTrace: ["技术命中：python", "项目：做过数据系统项目"],
        recommendation: "建议优先打开：有明显命中，但仍需要补交叉验证",
        nextStep: "先看详情"
      },
      {
        shortlistIndex: 2,
        candidate: {
          personId: "person-2",
          name: "Bo",
          headline: "Python Engineer",
          location: "杭州",
          company: null,
          experienceYears: null,
          matchScore: 75,
          matchReason: "技术命中：python",
          queryReasons: ["技术命中：python"],
          sources: ["GitHub"],
          latestEvidenceAt: new Date("2026-03-27T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-27T00:00:00.000Z")
        },
        profile: {
          dimensions: {
            techMatch: 80,
            locationMatch: 88,
            careerStability: 68,
            projectDepth: 67,
            academicImpact: 30,
            communityReputation: 40
          },
          overallScore: 76,
          summary: "技术相关性不错。",
          highlights: ["有 GitHub 作品"]
        },
        topEvidence: [
          {
            evidenceType: "repository",
            title: "维护 Python 工具链",
            sourceLabel: "GitHub",
            freshnessLabel: "4天前"
          }
        ],
        decisionTag: "继续比较",
        decisionScore: 82,
        goalFit: assessment("技术命中明确，但地点和综合贴合略弱", "mixed", 78, ["技术命中：python"]),
        evidenceStrength: assessment("有 1 条 GitHub 证据，但仍偏单源", "mixed", 70, ["GitHub：维护 Python 工具链"]),
        technicalRelevance: assessment("技术相关性接近，但项目深度稍弱", "mixed", 74, ["技术 80%", "项目 67%"]),
        sourceQualityRecency: assessment("仅 GitHub 单源，但最近 4 天有更新", "mixed", 71, ["GitHub", "4天前"]),
        uncertainty: uncertainty("与第一名差距有限，仍取决于岗位偏好", "medium"),
        whySelected: "差距有限，仍值得继续对照。",
        whyNotSelected: "综合贴合和地点优势都略弱于 Ada。",
        evidenceTrace: ["技术命中：python", "GitHub：维护 Python 工具链"],
        recommendation: "建议继续对照：差距有限",
        nextStep: "继续对比"
      }
    ]);

    expect(output).toContain("条件式推荐");
    expect(output).toContain("中信心");
    expect(output).toContain("仍需补一层交叉验证");
  });

  it("shows explicit non-recommendation when compare evidence is too weak", () => {
    const output = renderer.renderComparison([
      {
        shortlistIndex: 1,
        candidate: {
          personId: "person-1",
          name: "Ada",
          headline: "Generalist Builder",
          location: "杭州",
          company: null,
          experienceYears: null,
          matchScore: 61,
          matchReason: "地点命中：杭州",
          queryReasons: ["地点命中：杭州"],
          sources: ["Bonjour"]
        },
        profile: {
          dimensions: {
            techMatch: 58,
            locationMatch: 80,
            careerStability: 55,
            projectDepth: 44,
            academicImpact: 20,
            communityReputation: 25
          },
          overallScore: 54,
          summary: "资料较少。",
          highlights: []
        },
        topEvidence: [],
        decisionTag: "继续比较",
        decisionScore: 61,
        goalFit: assessment("只有地点命中，目标贴合较弱", "weak", 58, ["地点命中：杭州"]),
        evidenceStrength: assessment("没有可追溯的核心证据", "weak", 30, []),
        technicalRelevance: assessment("技术相关性较弱", "weak", 40, ["技术 58%", "项目 44%"]),
        sourceQualityRecency: assessment("仅 Bonjour 单源，且没有近期强信号", "weak", 35, ["Bonjour"]),
        uncertainty: uncertainty("缺少可追溯的核心证据", "high"),
        whySelected: "当前证据不足，只能继续比较。",
        whyNotSelected: "没有形成可支持推荐的证据基础。",
        evidenceTrace: [],
        recommendation: "建议继续比较：当前证据不足",
        nextStep: "补更多线索"
      },
      {
        shortlistIndex: 2,
        candidate: {
          personId: "person-2",
          name: "Bo",
          headline: "Builder",
          location: "上海",
          company: null,
          experienceYears: null,
          matchScore: 60,
          matchReason: "地点命中：上海",
          queryReasons: ["地点命中：上海"],
          sources: ["Bonjour"]
        },
        profile: {
          dimensions: {
            techMatch: 55,
            locationMatch: 70,
            careerStability: 52,
            projectDepth: 43,
            academicImpact: 18,
            communityReputation: 22
          },
          overallScore: 50,
          summary: "资料较少。",
          highlights: []
        },
        topEvidence: [],
        decisionTag: "补充候选",
        decisionScore: 60,
        goalFit: assessment("只有地点相关线索，目标贴合偏弱", "weak", 56, ["地点命中：上海"]),
        evidenceStrength: assessment("没有可追溯的核心证据", "weak", 28, []),
        technicalRelevance: assessment("技术和项目维度都较弱", "weak", 38, ["技术 55%", "项目 43%"]),
        sourceQualityRecency: assessment("仅 Bonjour 单源，且缺少新鲜证据", "weak", 34, ["Bonjour"]),
        uncertainty: uncertainty("信息还不够，无法支撑推荐", "high"),
        whySelected: "信息还不够，只适合作为备选。",
        whyNotSelected: "缺少核心证据，无法形成稳定比较优势。",
        evidenceTrace: [],
        recommendation: "建议作为备选：信息还不够",
        nextStep: "继续找人"
      }
    ]);

    expect(output).toContain("暂不推荐");
    expect(output).toContain("低信心");
    expect(output).toContain("还没有足够证据推荐其中一位");
  });
});
