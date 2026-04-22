import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileGenerator } from "../profile-generator.js";

describe("ProfileGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes an AbortSignal to the LLM provider", async () => {
    const chat = vi.fn(async (messages: Array<{ content: string }>, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(messages[0]?.content).toContain("简体中文");
      expect(messages[1]?.content).toContain("当前搜索视角");
      expect(messages[1]?.content).toContain("技能：python");
      expect(messages[1]?.content).toContain("杭州");
      expect(messages[1]?.content).toContain("summary 和 highlights 必须全部使用简体中文");
      return {
        content: JSON.stringify({
          summary: "长期从事分布式系统与搜索基础设施建设。",
          highlights: ["搭建过生产级搜索系统"]
        })
      };
    });

    const generator = new ProfileGenerator({
      name: "mock",
      chat,
      embed: vi.fn(),
      embedBatch: vi.fn()
    } as any);

    const result = await generator.generate(
      {
        id: "person-1",
        primaryName: "Alice",
        primaryHeadline: "Search Engineer"
      } as any,
      [],
      {
        dimensions: {
          techMatch: 90,
          locationMatch: 80,
          careerStability: 75,
          projectDepth: 88,
          academicImpact: 60,
          communityReputation: 70
        },
        overallScore: 84,
        summary: "",
        highlights: []
      },
      {
        skills: ["python"],
        locations: ["杭州"],
        experience: undefined,
        role: "后端工程师",
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      }
    );

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain("分布式系统");
  });

  it("rethrows when parent signal aborts profile generation", async () => {
    const controller = new AbortController();
    const chat = vi.fn(async (_messages: Array<{ content: string }>, options?: { signal?: AbortSignal }) => {
      return await new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
      });
    });

    const generator = new ProfileGenerator({
      name: "mock",
      chat,
      embed: vi.fn(),
      embedBatch: vi.fn()
    } as any);

    const generation = generator.generate(
      {
        id: "person-1",
        primaryName: "Alice",
        primaryHeadline: "Search Engineer"
      } as any,
      [],
      {
        dimensions: {
          techMatch: 90,
          locationMatch: 80,
          careerStability: 75,
          projectDepth: 88,
          academicImpact: 60,
          communityReputation: 70
        },
        overallScore: 84,
        summary: "",
        highlights: []
      },
      undefined,
      { signal: controller.signal, maxRetries: 0 }
    );

    controller.abort(new Error("session interrupted"));

    await expect(generation).rejects.toThrow("session interrupted");
  });
});
