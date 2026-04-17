import { describe, expect, it } from "vitest";

import { createAgentSessionState, recordSearch } from "../agent-state.js";
import { buildUserGoalModelFromSession } from "../deal-flow-goal-model.js";
import type { SearchConditions } from "../types.js";

function createConditions(overrides: Partial<SearchConditions> = {}): SearchConditions {
  return {
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
    limit: 10,
    ...overrides
  };
}

describe("buildUserGoalModelFromSession", () => {
  it("maps agent session goal and search history into a reusable goal model", () => {
    let state = createAgentSessionState({
      userGoal: "Find a cofounder for AI agent developer tools",
      currentConditions: createConditions({
        skills: ["developer tools", "AI infra"],
        mustHave: ["open source"],
        exclude: ["fintech"]
      })
    });

    state = recordSearch(state, {
      results: [],
      conditions: createConditions({
        role: "founder",
        skills: ["enterprise AI", "agents", "AI infra"],
        mustHave: ["open source"],
        exclude: ["fintech"]
      }),
      timestamp: new Date("2026-04-17T13:00:00.000Z")
    });

    const model = buildUserGoalModelFromSession(state);

    expect(model.explicitGoal).toBe("Find a cofounder for AI agent developer tools");
    expect(model.dominantDirectionTags).toEqual(
      expect.arrayContaining(["ai_agents", "developer_tools", "enterprise_ai"])
    );
    expect(model.negativeDirectionTags).toContain("fintech");
    expect(model.signalSources).toEqual(
      expect.arrayContaining(["explicit_goal", "current_conditions", "search_history"])
    );
  });
});
