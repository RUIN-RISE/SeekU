import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileGenerator } from "../profile-generator.js";

describe("ProfileGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes an AbortSignal to the LLM provider", async () => {
    const chat = vi.fn(async (_messages, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
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
      }
    );

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain("Strong distributed systems engineer");
  });
});
