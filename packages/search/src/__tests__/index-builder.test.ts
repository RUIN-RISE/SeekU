import { describe, expect, it } from "vitest";

import type { EvidenceItem, Person } from "@seeku/db";

import { buildSearchDocument } from "../index-builder.js";

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
    title: "Role",
    description: null,
    url: null,
    occurredAt: null,
    metadata: {},
    evidenceHash: "hash-1",
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

describe("index-builder facetRole extraction", () => {
  it("extracts concise Chinese role tags from summary and profile fields", () => {
    const person = makePerson({
      summary: "[bonjour] 后端工程师；创业合伙人；AI 基础设施研究"
    });

    const document = buildSearchDocument({
      person,
      evidence: [
        makeEvidence({
          description: "后端工程师；创业合伙人；AI 基础设施研究",
          metadata: {
            field: "role",
            roleSignals: ["后端工程师", "创业合伙人", "AI 基础设施研究"]
          }
        })
      ]
    });

    const facetRole = document.facetRole ?? [];

    expect(facetRole).toEqual(
      expect.arrayContaining(["后端工程师", "合伙人", "AI研究员"])
    );
    facetRole.forEach((role) => expect(Array.from(role).length).toBeLessThanOrEqual(24));
  });

  it("canonicalizes English role phrases into concise tags", () => {
    const person = makePerson({
      primaryHeadline: "Backend Engineer @ Startup",
      summary: "Founder and product manager building agent workflows"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["后端工程师", "创始人", "产品经理"])
    );
  });

  it("uses metadata.roleSignals to recover role tags from sparse profile fields", () => {
    const person = makePerson();

    const document = buildSearchDocument({
      person,
      evidence: [
        makeEvidence({
          title: "Skill",
          description: "LangChain, Python, vector database",
          metadata: {
            field: "skill",
            roleSignals: ["Agent 架构研究", "Backend Engineer"]
          }
        })
      ]
    });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["AI研究员", "后端工程师"])
    );
  });

  it("extracts tech tags from primaryName signals in sparse bonjour profiles", () => {
    const person = makePerson({
      primaryName: "赛博小猫RAG",
      primaryHeadline: "学生"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetTags ?? []).toEqual(
      expect.arrayContaining(["rag"])
    );
  });

  it("maps ragflow mentions to rag tag", () => {
    const person = makePerson({
      primaryHeadline: "DOING | RAGFlow"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetTags ?? []).toEqual(
      expect.arrayContaining(["rag"])
    );
  });

  it("does not leak long narrative text into facetRole", () => {
    const longNarrative =
      "寻找AI领域合伙人/项目制合作。专注为企业提供AI智能体行业解决方案，涵盖从需求分析、智能体定制开发到落地部署的全过程。";
    const person = makePerson({ summary: longNarrative });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual([]);
    expect(document.facetRole ?? []).not.toContain(longNarrative);
  });

  it("expands zju aliases into docText for future indexing", () => {
    const person = makePerson({
      primaryHeadline: "浙大智能教育研究中心成员"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.docText).toContain("浙大智能教育研究中心成员");
    expect(document.docText).toContain("zhejiang university");
    expect(document.docText).toContain("zju");
    expect(document.docText).toContain("浙江大学");
  });

  it("adds zju manual seed tag for curated bonjour alumni handles", () => {
    const person = makePerson({
      primaryName: "Aura"
    });

    const document = buildSearchDocument({
      person,
      evidence: [],
      sourceHints: [
        { source: "bonjour", handle: "zxhq0c" }
      ]
    });

    expect(document.facetTags ?? []).toContain("zju_manual_seed");
  });

  it("extracts ML Engineer and AI Engineer roles from English text", () => {
    const person = makePerson({
      primaryHeadline: "ML Engineer at DeepMind"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["AI工程师"])
    );
  });

  it("extracts 算法工程师 and 机器学习工程师 roles from Chinese text", () => {
    const person = makePerson({
      primaryHeadline: "算法工程师"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["算法工程师"])
    );
  });

  it("extracts 架构师 and 技术负责人 roles", () => {
    const person = makePerson({
      primaryHeadline: "技术总监 / 系统架构师"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    const roles = document.facetRole ?? [];
    expect(roles).toEqual(expect.arrayContaining(["技术负责人"]));
  });

  it("extracts research scientist role", () => {
    const person = makePerson({
      primaryHeadline: "Research Scientist at NVIDIA"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["研究科学家"])
    );
  });

  it("extracts open-source developer roles from GitHub-style headlines", () => {
    const person = makePerson({
      primaryHeadline: "Full-Time Open-Sourcerer. Focused on Swift & JavaScript."
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["开源开发者"])
    );
  });

  it("extracts academic roles from postdoc and professor headlines", () => {
    const postdoc = buildSearchDocument({
      person: makePerson({
        primaryHeadline: "Postdoc at ZJU"
      }),
      evidence: []
    });
    const professor = buildSearchDocument({
      person: makePerson({
        primaryHeadline: "Currently assistant professor at ZJU working on deep learning"
      }),
      evidence: []
    });

    expect(postdoc.facetRole ?? []).toEqual(expect.arrayContaining(["研究员"]));
    expect(professor.facetRole ?? []).toEqual(expect.arrayContaining(["研究员"]));
  });

  it("extracts planner and developer roles from concise Chinese activity text", () => {
    const person = makePerson({
      primaryHeadline: "游戏策划与开发"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["策划", "开发者"])
    );
  });

  it("extracts technical lead from abbreviated TL titles", () => {
    const person = makePerson({
      primaryHeadline: "CS Master candidate; intern@DeepSeek, ex-software TL@ZJU XLab"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["技术负责人"])
    );
  });

  it("extracts student roles from degree abbreviations", () => {
    const person = makePerson({
      primaryHeadline: "B.S. in MS&E, ZJU // M.S. in EE, Columbia"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["学生"])
    );
  });

  it("extracts planner role from game-design text", () => {
    const person = makePerson({
      primaryHeadline: "game-design"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["策划"])
    );
  });

  it("extracts engineer role from WAF and API gateway text", () => {
    const person = makePerson({
      primaryHeadline: "waf / API Gateway(应用防火墙/API网关)"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["工程师"])
    );
  });

  it("extracts broader explicit professional roles from sparse Bonjour text", () => {
    const designer = buildSearchDocument({
      person: makePerson({ primaryHeadline: "Bonjour｜90 后UIUX" }),
      evidence: []
    });
    const marketer = buildSearchDocument({
      person: makePerson({ primaryHeadline: "Head of Marketing" }),
      evidence: []
    });
    const investor = buildSearchDocument({
      person: makePerson({ primaryHeadline: "钛动科技CVC 战略投资负责" }),
      evidence: []
    });
    const pilot = buildSearchDocument({
      person: makePerson({ primaryHeadline: "厦门航空机长 | 现执飞A320" }),
      evidence: []
    });

    expect(designer.facetRole ?? []).toEqual(expect.arrayContaining(["设计师"]));
    expect(marketer.facetRole ?? []).toEqual(expect.arrayContaining(["市场"]));
    expect(investor.facetRole ?? []).toEqual(expect.arrayContaining(["投资人"]));
    expect(pilot.facetRole ?? []).toEqual(expect.arrayContaining(["飞行员"]));
  });

  it("extracts explicit maker and owner roles without long narrative leakage", () => {
    const engineer = buildSearchDocument({
      person: makePerson({ primaryHeadline: "学习鸿蒙编程中。在尝试做个小软件…" }),
      evidence: []
    });
    const owner = buildSearchDocument({
      person: makePerson({ primaryHeadline: "WAOTEA主理人" }),
      evidence: []
    });
    const photographer = buildSearchDocument({
      person: makePerson({ primaryHeadline: "摄影师" }),
      evidence: []
    });

    expect(engineer.facetRole ?? []).toEqual(expect.arrayContaining(["工程师"]));
    expect(owner.facetRole ?? []).toEqual(expect.arrayContaining(["运营"]));
    expect(photographer.facetRole ?? []).toEqual(expect.arrayContaining(["摄影师"]));
  });

  it("extracts structured Bonjour Role field values commonly missed by sparse profiles", () => {
    const ceo = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "CEO", metadata: { field: "role" } })]
    });
    const recruiter = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "HRBP；猎头", metadata: { field: "role" } })]
    });
    const project = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "项目经理", metadata: { field: "role" } })]
    });
    const embedded = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "嵌入式开发", metadata: { field: "role" } })]
    });
    const media = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "科技媒体编辑", metadata: { field: "role" } })]
    });

    expect(ceo.facetRole ?? []).toEqual(expect.arrayContaining(["管理者"]));
    expect(recruiter.facetRole ?? []).toEqual(expect.arrayContaining(["HR"]));
    expect(project.facetRole ?? []).toEqual(expect.arrayContaining(["项目经理"]));
    expect(embedded.facetRole ?? []).toEqual(expect.arrayContaining(["工程师"]));
    expect(media.facetRole ?? []).toEqual(expect.arrayContaining(["媒体"]));
  });

  it("extracts high-confidence sparse Bonjour Role values from the remaining tail", () => {
    const cfo = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "CFO", metadata: { field: "role" } })]
    });
    const product = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "AI产品", metadata: { field: "role" } })]
    });
    const designer = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "平面设计 / 技术美术", metadata: { field: "role" } })]
    });
    const marketing = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "PR", metadata: { field: "role" } })]
    });
    const student = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "实习生", metadata: { field: "role" } })]
    });
    const researcher = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "科研工作者", metadata: { field: "role" } })]
    });
    const developer = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "开发", metadata: { field: "role" } })]
    });
    const investor = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "投资", metadata: { field: "role" } })]
    });
    const editor = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "剪辑师", metadata: { field: "role" } })]
    });

    expect(cfo.facetRole ?? []).toEqual(expect.arrayContaining(["财务"]));
    expect(product.facetRole ?? []).toEqual(expect.arrayContaining(["产品经理"]));
    expect(designer.facetRole ?? []).toEqual(expect.arrayContaining(["设计师"]));
    expect(marketing.facetRole ?? []).toEqual(expect.arrayContaining(["市场"]));
    expect(student.facetRole ?? []).toEqual(expect.arrayContaining(["学生"]));
    expect(researcher.facetRole ?? []).toEqual(expect.arrayContaining(["研究员"]));
    expect(developer.facetRole ?? []).toEqual(expect.arrayContaining(["工程师"]));
    expect(investor.facetRole ?? []).toEqual(expect.arrayContaining(["投资人"]));
    expect(editor.facetRole ?? []).toEqual(expect.arrayContaining(["媒体"]));
  });

  it("recovers conservative missed Bonjour role aliases from sparse tail samples", () => {
    const backend = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "后台开发岗", metadata: { field: "role" } })]
    });
    const engineer = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "技术开发", metadata: { field: "role" } })]
    });
    const architect = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "场景架构", metadata: { field: "role" } })]
    });
    const product = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "产品+技术", metadata: { field: "role" } })]
    });
    const sales = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "解决方案经理", metadata: { field: "role" } })]
    });
    const investor = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "战投经理", metadata: { field: "role" } })]
    });
    const researcher = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "Web3 研究員", metadata: { field: "role" } })]
    });
    const techLead = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: "技术经理", metadata: { field: "role" } })]
    });

    expect(backend.facetRole ?? []).toEqual(expect.arrayContaining(["后端工程师"]));
    expect(engineer.facetRole ?? []).toEqual(expect.arrayContaining(["工程师"]));
    expect(architect.facetRole ?? []).toEqual(expect.arrayContaining(["架构师"]));
    expect(product.facetRole ?? []).toEqual(expect.arrayContaining(["产品经理"]));
    expect(sales.facetRole ?? []).toEqual(expect.arrayContaining(["销售"]));
    expect(investor.facetRole ?? []).toEqual(expect.arrayContaining(["投资人"]));
    expect(researcher.facetRole ?? []).toEqual(expect.arrayContaining(["研究员"]));
    expect(techLead.facetRole ?? []).toEqual(expect.arrayContaining(["技术负责人"]));
  });

  it("reads profile_field metadata when stored as serialized JSON", () => {
    const role = buildSearchDocument({
      person: makePerson(),
      evidence: [
        makeEvidence({
          description: "嵌入式开发",
          metadata: JSON.stringify({ field: "role", roleSignals: ["嵌入式开发"] }) as any
        })
      ]
    });
    const skill = buildSearchDocument({
      person: makePerson(),
      evidence: [
        makeEvidence({
          description: "PyTorch, transformer",
          metadata: JSON.stringify({ field: "skill" }) as any
        })
      ]
    });
    const repo = buildSearchDocument({
      person: makePerson(),
      evidence: [
        makeEvidence({
          evidenceType: "repository",
          metadata: JSON.stringify({ language: "Rust" }) as any
        })
      ]
    });

    expect(role.facetRole ?? []).toEqual(expect.arrayContaining(["工程师"]));
    expect(skill.facetTags ?? []).toEqual(expect.arrayContaining(["pytorch", "transformer"]));
    expect(repo.facetTags ?? []).toEqual(expect.arrayContaining(["rust"]));
  });

  it("extracts RAG and LLM tags from Chinese AI text", () => {
    const person = makePerson({
      primaryHeadline: "大模型工程师",
      summary: "专注RAG检索增强和向量数据库技术"
    });

    const document = buildSearchDocument({ person, evidence: [] });
    const tags = document.facetTags ?? [];

    // Should match both Chinese and English equivalents
    expect(tags).toEqual(expect.arrayContaining(["rag"]));
    expect(tags).toEqual(expect.arrayContaining(["大模型"]));
    expect(tags).toEqual(expect.arrayContaining(["向量数据库"]));
  });

  it("extracts algorithm tags from Chinese algorithm text", () => {
    const person = makePerson({
      primaryHeadline: "计算机视觉算法研究员"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetTags ?? []).toEqual(expect.arrayContaining(["算法", "计算机视觉"]));
  });

  it("extracts agent and agentic tags", () => {
    const person = makePerson({
      summary: "Building agentic AI workflows with LangChain"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetTags ?? []).toEqual(
      expect.arrayContaining(["agent", "langchain"])
    );
  });

  it("extracts tags from Bonjour profile_field skill metadata", () => {
    const person = makePerson();

    const document = buildSearchDocument({
      person,
      evidence: [
        makeEvidence({
          evidenceType: "profile_field",
          title: "Skill",
          description: "PyTorch, transformer, fine-tuning, RLHF",
          metadata: {
            field: "skill"
          }
        })
      ]
    });

    expect(document.facetTags ?? []).toEqual(
      expect.arrayContaining(["pytorch", "transformer"])
    );
  });

  it("does not emit one-letter language noise tags from common prose", () => {
    const person = makePerson({
      primaryHeadline: "Founder building creator tools",
      summary: "Designer and operator exploring community products"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetTags ?? []).not.toContain("r");
  });

  it("caps broad role explosions and keeps higher-signal roles first", () => {
    const noisyRoleText = [
      "创始人",
      "联合创始人",
      "工程师",
      "开发者",
      "前端工程师",
      "后端工程师",
      "全栈工程师",
      "设计师",
      "策划",
      "运营",
      "AI工程师",
      "AI研究员",
      "算法工程师",
      "研究员",
      "产品经理",
      "市场",
      "负责人",
      "战略",
      "销售",
      "媒体",
      "创作者",
      "投资人",
      "HR"
    ].join(" / ");

    const document = buildSearchDocument({
      person: makePerson(),
      evidence: [makeEvidence({ description: noisyRoleText, metadata: { field: "role" } })]
    });

    expect(document.facetRole ?? []).toHaveLength(6);
    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["AI研究员", "研究员", "算法工程师", "AI工程师"])
    );
  });

  it("extracts direction tags from AI agent summary", () => {
    const person = makePerson({
      primaryHeadline: "Building AI agent developer tools",
      summary: "Open source workflow tooling for enterprise AI teams"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetTags ?? []).toEqual(
      expect.arrayContaining([
        "direction:ai_agents",
        "direction:developer_tools",
        "direction:enterprise_ai",
        "direction:open_source"
      ])
    );
  });

  it("extracts location from explicit Base context", () => {
    const person = makePerson({
      summary: "Base 杭州。欢迎一起交流项目。"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetLocation ?? []).toEqual(
      expect.arrayContaining(["杭州", "hangzhou"])
    );
  });

  it("extracts multiple locations from 坐标 context", () => {
    const person = makePerson({
      summary: "坐标北京&上海，欢迎 coffee chat"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetLocation ?? []).toEqual(
      expect.arrayContaining(["北京", "beijing", "上海", "shanghai"])
    );
  });

  it("extracts location from metadata and explicit line without confusing school names", () => {
    const person = makePerson({
      summary: "南京大学学生，人在苏州。"
    });

    const document = buildSearchDocument({
      person,
      evidence: [
        makeEvidence({
          description: "Location | 中国 | 深圳",
          metadata: {
            field: "bio"
          }
        })
      ]
    });

    expect(document.facetLocation ?? []).toEqual(
      expect.arrayContaining(["苏州", "suzhou", "深圳", "shenzhen", "中国", "china"])
    );
  });

  it("extracts location from strong name context without treating bare city names as location", () => {
    const document = buildSearchDocument({
      person: makePerson({
        primaryName: "北京人在北京",
        summary: "探索世界，创建未来"
      }),
      evidence: []
    });
    const bareCityName = buildSearchDocument({
      person: makePerson({
        primaryName: "南京"
      }),
      evidence: []
    });

    expect(document.facetLocation ?? []).toEqual(
      expect.arrayContaining(["北京", "beijing"])
    );
    expect(bareCityName.facetLocation ?? []).toEqual([]);
  });
});
