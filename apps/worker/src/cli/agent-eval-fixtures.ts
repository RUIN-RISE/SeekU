import type { MultiDimensionProfile, ScoredCandidate, SearchConditions } from "./types.js";

export interface AgentEvalCandidate extends ScoredCandidate {
  profile: MultiDimensionProfile;
  _hydrated: {
    evidence: Array<{
      evidenceType: string;
      title?: string | null;
      description?: string | null;
      source: string;
      occurredAt?: Date | null;
    }>;
  };
}

export interface AgentAcceptanceFixture {
  id: string;
  goal: string;
  conditions: SearchConditions;
  clarificationCount: number;
  candidates?: AgentEvalCandidate[];
  expected: {
    clarifyAction: "clarify" | "search";
    postSearchAction?: "narrow" | "compare";
    recommendationMode?:
      | "clear-recommendation"
      | "conditional-recommendation"
      | "no-recommendation";
  };
}

export interface AgentRegressionFixture {
  id: "Q4" | "Q6" | "Q8";
  query: string;
  expectedLabel: "watch-but-stable" | "pass";
  snapshotFile: string;
  checks: Array<
    | { type: "min-results"; value: number }
    | { type: "min-github-in-top"; topN: number; value: number }
    | { type: "all-top-include-github"; topN: number }
  >;
}

const BASE_CONDITIONS: SearchConditions = {
  skills: [],
  locations: [],
  experience: undefined,
  role: undefined,
  sourceBias: undefined,
  mustHave: [],
  niceToHave: [],
  exclude: [],
  preferFresh: false,
  candidateAnchor: undefined,
  limit: 10
};

function createProfile(overrides: Partial<MultiDimensionProfile> = {}): MultiDimensionProfile {
  return {
    dimensions: {
      techMatch: 88,
      locationMatch: 92,
      careerStability: 74,
      projectDepth: 83,
      academicImpact: 38,
      communityReputation: 52
    },
    overallScore: 86,
    highlights: ["做过真实搜索与自动化项目"],
    summary: "长期做工程落地和搜索系统建设。",
    ...overrides
  };
}

function createCandidate(overrides: Record<string, unknown> = {}): AgentEvalCandidate {
  return {
    personId: "person-1",
    name: "Ada",
    headline: "Python Backend Engineer",
    location: "杭州",
    company: null,
    experienceYears: null,
    matchScore: 0.82,
    matchStrength: "strong",
    profile: createProfile(),
    matchReason: "地点命中：杭州，技术命中：python",
    queryReasons: ["地点命中：杭州", "技术命中：python"],
    sources: ["Bonjour", "GitHub"],
    bonjourUrl: "https://bonjour.bio/ada",
    lastSyncedAt: new Date("2026-03-30T00:00:00.000Z"),
    latestEvidenceAt: new Date("2026-03-29T00:00:00.000Z"),
    _hydrated: {
      evidence: [
        {
          evidenceType: "project",
          title: "Built Hangzhou ranking stack",
          description: "Used python heavily",
          source: "bonjour",
          occurredAt: new Date("2026-03-29T00:00:00.000Z")
        },
        {
          evidenceType: "repository",
          title: "rag-retrieval-toolkit",
          description: "GitHub repo for retrieval workflows",
          source: "github",
          occurredAt: new Date("2026-03-28T00:00:00.000Z")
        }
      ]
    },
    ...overrides
  } as AgentEvalCandidate;
}

export const AGENT_ACCEPTANCE_FIXTURES: AgentAcceptanceFixture[] = [
  {
    id: "A1",
    goal: "我先想在杭州看看人选。",
    conditions: {
      ...BASE_CONDITIONS,
      locations: ["杭州"]
    },
    clarificationCount: 0,
    expected: {
      clarifyAction: "clarify"
    }
  },
  {
    id: "A2",
    goal: "帮我找杭州做 Python 后端的人。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["python"],
      locations: ["杭州"],
      role: "backend"
    },
    clarificationCount: 0,
    expected: {
      clarifyAction: "search"
    }
  },
  {
    id: "A3",
    goal: "我先随便看看。",
    conditions: BASE_CONDITIONS,
    clarificationCount: 1,
    expected: {
      clarifyAction: "search"
    }
  },
  {
    id: "A4",
    goal: "我想看 GitHub 上活跃的 ML engineer。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["ml", "machine learning"],
      sourceBias: "github",
      preferFresh: true,
      role: "engineer"
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "q6-1",
        name: "Yedongxi",
        sources: ["GitHub"],
        bonjourUrl: undefined,
        matchReason: "技术命中：ml / machine learning，来源过滤命中：GitHub",
        queryReasons: ["技术命中：ml / machine learning", "来源过滤命中：GitHub"],
        profile: createProfile({
          dimensions: {
            techMatch: 87,
            locationMatch: 55,
            careerStability: 70,
            projectDepth: 79,
            academicImpact: 30,
            communityReputation: 45
          }
        })
      }),
      createCandidate({
        personId: "q6-2",
        name: "NJX",
        location: "北京",
        sources: ["GitHub"],
        bonjourUrl: undefined,
        matchReason: "技术命中：machine learning，来源过滤命中：GitHub",
        queryReasons: ["技术命中：machine learning", "来源过滤命中：GitHub"],
        profile: createProfile({
          dimensions: {
            techMatch: 85,
            locationMatch: 52,
            careerStability: 71,
            projectDepth: 77,
            academicImpact: 34,
            communityReputation: 50
          }
        })
      }),
      createCandidate({
        personId: "q6-3",
        name: "RoomWithOutRoof",
        location: "Singapore",
        sources: ["GitHub"],
        bonjourUrl: undefined,
        matchStrength: "medium",
        profile: createProfile({
          dimensions: {
            techMatch: 80,
            locationMatch: 48,
            careerStability: 68,
            projectDepth: 73,
            academicImpact: 28,
            communityReputation: 42
          }
        })
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "compare"
    }
  },
  {
    id: "A5",
    goal: "开源 AI founder 或 tech lead，最好自己做过项目。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["ai", "open source"],
      role: "founder",
      sourceBias: "github"
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "q8-1",
        name: "NJX",
        location: "北京",
        sources: ["GitHub"],
        bonjourUrl: undefined,
        latestEvidenceAt: new Date("2026-04-15T00:00:00.000Z"),
        lastSyncedAt: new Date("2026-04-15T00:00:00.000Z"),
        matchReason: "角色贴合：founder，技术命中：ai / open source",
        queryReasons: ["角色贴合：founder", "技术命中：ai / open source"],
        profile: createProfile({
          dimensions: {
            techMatch: 95,
            locationMatch: 60,
            careerStability: 83,
            projectDepth: 92,
            academicImpact: 48,
            communityReputation: 66
          },
          overallScore: 94
        })
      }),
      createCandidate({
        personId: "q8-2",
        name: "Sense_wang",
        location: null,
        sources: ["GitHub"],
        bonjourUrl: undefined,
        latestEvidenceAt: new Date("2026-03-20T00:00:00.000Z"),
        lastSyncedAt: new Date("2026-03-20T00:00:00.000Z"),
        profile: createProfile({
          dimensions: {
            techMatch: 78,
            locationMatch: 42,
            careerStability: 62,
            projectDepth: 66,
            academicImpact: 30,
            communityReputation: 42
          },
          overallScore: 70
        })
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "compare",
      recommendationMode: "clear-recommendation"
    }
  },
  {
    id: "A6",
    goal: "我想找 RAG / 检索工程师，但别太武断。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["rag", "retrieval"],
      role: "engineer"
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "q4-1",
        name: "达峰的夏天",
        location: "Hangzhou",
        matchReason: "技术命中：rag，检索技能命中：rag",
        queryReasons: ["技术命中：rag", "检索技能命中：rag"],
        profile: createProfile({
          dimensions: {
            techMatch: 89,
            locationMatch: 70,
            careerStability: 79,
            projectDepth: 86,
            academicImpact: 36,
            communityReputation: 58
          },
          overallScore: 88
        })
      }),
      createCandidate({
        personId: "q4-2",
        name: "王白水",
        location: "北京",
        matchReason: "技术命中：rag / retrieval，检索技能命中：rag",
        queryReasons: ["技术命中：rag / retrieval", "检索技能命中：rag"],
        profile: createProfile({
          dimensions: {
            techMatch: 79,
            locationMatch: 55,
            careerStability: 68,
            projectDepth: 70,
            academicImpact: 28,
            communityReputation: 41
          },
          overallScore: 74
        })
      }),
      createCandidate({
        personId: "q4-3",
        name: "Tom",
        location: "上海",
        sources: ["Bonjour"],
        profile: createProfile({
          dimensions: {
            techMatch: 82,
            locationMatch: 50,
            careerStability: 72,
            projectDepth: 71,
            academicImpact: 24,
            communityReputation: 39
          },
          overallScore: 78
        }),
        _hydrated: {
          evidence: [
            {
              evidenceType: "project",
              title: "Agent / RAG 工程师",
              description: "Role line only",
              source: "bonjour",
              occurredAt: new Date("2026-03-25T00:00:00.000Z")
            }
          ]
        }
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "compare",
      recommendationMode: "conditional-recommendation"
    }
  },
  {
    id: "A7",
    goal: "多模态视觉工程师，但如果结果太散先别推荐。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["multimodal", "computer vision"],
      role: "engineer"
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "weak-1",
        name: "Bo",
        location: "上海",
        matchStrength: "weak",
        sources: ["Bonjour"],
        bonjourUrl: "https://bonjour.bio/bo",
        profile: createProfile({
          dimensions: {
            techMatch: 58,
            locationMatch: 65,
            careerStability: 60,
            projectDepth: 45,
            academicImpact: 20,
            communityReputation: 22
          },
          overallScore: 56,
          highlights: [],
          summary: "资料较少。"
        }),
        _hydrated: { evidence: [] }
      }),
      createCandidate({
        personId: "weak-2",
        name: "Cyan",
        location: "杭州",
        matchStrength: "weak",
        sources: ["Bonjour"],
        bonjourUrl: "https://bonjour.bio/cyan",
        profile: createProfile({
          dimensions: {
            techMatch: 54,
            locationMatch: 60,
            careerStability: 55,
            projectDepth: 42,
            academicImpact: 18,
            communityReputation: 20
          },
          overallScore: 52,
          highlights: [],
          summary: "资料较少。"
        }),
        _hydrated: { evidence: [] }
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "narrow"
    }
  },
  {
    id: "A8",
    goal: "先给我一个 AI infra / backend builder 的 shortlist。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["infra", "backend"],
      role: "builder"
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "single-1",
        name: "Solo",
        profile: createProfile({
          dimensions: {
            techMatch: 90,
            locationMatch: 80,
            careerStability: 78,
            projectDepth: 88,
            academicImpact: 26,
            communityReputation: 44
          },
          overallScore: 89
        })
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "narrow"
    }
  },
  {
    id: "A9",
    goal: "证据不够就别乱推荐，我只接受诚实 compare。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["python"]
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "nr-1",
        name: "Ada",
        sources: ["Bonjour"],
        profile: createProfile({
          dimensions: {
            techMatch: 58,
            locationMatch: 80,
            careerStability: 55,
            projectDepth: 44,
            academicImpact: 20,
            communityReputation: 25
          },
          overallScore: 54,
          highlights: [],
          summary: "资料较少。"
        }),
        _hydrated: { evidence: [] }
      }),
      createCandidate({
        personId: "nr-2",
        name: "Bo",
        location: "上海",
        sources: ["Bonjour"],
        profile: createProfile({
          dimensions: {
            techMatch: 55,
            locationMatch: 70,
            careerStability: 52,
            projectDepth: 43,
            academicImpact: 18,
            communityReputation: 22
          },
          overallScore: 50,
          highlights: [],
          summary: "资料较少。"
        }),
        _hydrated: { evidence: [] }
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "compare",
      recommendationMode: "no-recommendation"
    }
  },
  {
    id: "A10",
    goal: "先比较 2-3 个 Python 后端 builder，最好有清晰主推。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["python"],
      role: "backend"
    },
    clarificationCount: 0,
    candidates: [
      createCandidate(),
      createCandidate({
        personId: "clear-2",
        name: "Grace",
        location: "杭州",
        sources: ["GitHub"],
        bonjourUrl: undefined,
        matchReason: "技术命中：python",
        queryReasons: ["技术命中：python"],
        profile: createProfile({
          dimensions: {
            techMatch: 76,
            locationMatch: 74,
            careerStability: 66,
            projectDepth: 64,
            academicImpact: 22,
            communityReputation: 38
          },
          overallScore: 72
        }),
        _hydrated: {
          evidence: [
            {
              evidenceType: "repository",
              title: "graph-rag",
              description: "Maintained a backend repo",
              source: "github",
              occurredAt: new Date("2026-03-20T00:00:00.000Z")
            }
          ]
        }
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "compare",
      recommendationMode: "clear-recommendation"
    }
  },
  {
    id: "A11",
    goal: "帮我比较两个 Python 候选人，但如果只差一点就给条件式建议。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["python"]
    },
    clarificationCount: 0,
    candidates: [
      createCandidate({
        personId: "cond-1",
        name: "Ada",
        sources: ["Bonjour"],
        profile: createProfile({
          dimensions: {
            techMatch: 84,
            locationMatch: 95,
            careerStability: 72,
            projectDepth: 70,
            academicImpact: 35,
            communityReputation: 45
          },
          overallScore: 80
        }),
        _hydrated: {
          evidence: [
            {
              evidenceType: "project",
              title: "做过数据系统项目",
              description: "单条项目证据",
              source: "bonjour",
              occurredAt: new Date("2026-03-28T00:00:00.000Z")
            }
          ]
        }
      }),
      createCandidate({
        personId: "cond-2",
        name: "Bo",
        sources: ["GitHub"],
        bonjourUrl: undefined,
        latestEvidenceAt: new Date("2026-03-18T00:00:00.000Z"),
        lastSyncedAt: new Date("2026-03-18T00:00:00.000Z"),
        profile: createProfile({
          dimensions: {
            techMatch: 76,
            locationMatch: 82,
            careerStability: 66,
            projectDepth: 61,
            academicImpact: 30,
            communityReputation: 36
          },
          overallScore: 69
        }),
        _hydrated: {
          evidence: [
            {
              evidenceType: "repository",
              title: "维护 Python 工具链",
              description: "单条 GitHub 证据",
              source: "github",
              occurredAt: new Date("2026-03-27T00:00:00.000Z")
            }
          ]
        }
      })
    ],
    expected: {
      clarifyAction: "search",
      postSearchAction: "compare",
      recommendationMode: "conditional-recommendation"
    }
  },
  {
    id: "A12",
    goal: "像 shortlist 2 号但更偏后端和 serving。",
    conditions: {
      ...BASE_CONDITIONS,
      skills: ["serving"],
      role: "backend",
      candidateAnchor: {
        shortlistIndex: 2,
        personId: "person-2",
        name: "Grace"
      }
    },
    clarificationCount: 0,
    expected: {
      clarifyAction: "search"
    }
  }
];

export const AGENT_REGRESSION_FIXTURES: AgentRegressionFixture[] = [
  {
    id: "Q4",
    query: "RAG 检索工程师",
    expectedLabel: "watch-but-stable",
    snapshotFile: "Q4.json",
    checks: [
      { type: "min-results", value: 5 },
      { type: "min-github-in-top", topN: 3, value: 1 },
      { type: "min-github-in-top", topN: 5, value: 2 }
    ]
  },
  {
    id: "Q6",
    query: "GitHub 上活跃的 ML engineer",
    expectedLabel: "pass",
    snapshotFile: "Q6.json",
    checks: [
      { type: "min-results", value: 5 },
      { type: "all-top-include-github", topN: 5 }
    ]
  },
  {
    id: "Q8",
    query: "开源 AI founder 或 tech lead",
    expectedLabel: "pass",
    snapshotFile: "Q8.json",
    checks: [
      { type: "min-results", value: 5 },
      { type: "all-top-include-github", topN: 5 }
    ]
  }
];
