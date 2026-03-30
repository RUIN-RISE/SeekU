import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileGenerator } from "../profile-generator.js";

describe("ProfileGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes an AbortSignal to the LLM provider", async () => {
    const chat = vi.fn(async (messages: Array<{ content: string }>, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(messages[1]?.content).toContain("Current Search Lens");
      expect(messages[1]?.content).toContain("python");
      expect(messages[1]?.content).toContain("杭州");
      return {
        content: JSON.stringify({
          summary: "Strong distributed systems engineer.",
          highlights: ["Built production search systems"]
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
    expect(result.summary).toContain("Strong distributed systems engineer");
  });
});
