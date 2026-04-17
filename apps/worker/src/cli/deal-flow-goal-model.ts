import {
  buildUserGoalModel,
  type UserGoalFeedbackEvent,
  type UserGoalInteractionEvent,
  type UserGoalModelSearchInput
} from "@seeku/search";

import type { AgentSessionState } from "./agent-state.js";
import type { SearchConditions, SearchHistoryEntry } from "./types.js";

function collectConditionSignalTexts(conditions: SearchConditions): string[] {
  return [
    conditions.role,
    conditions.experience,
    ...conditions.skills,
    ...conditions.mustHave,
    ...conditions.niceToHave
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function toGoalModelSearchInput(entry: SearchHistoryEntry): UserGoalModelSearchInput {
  return {
    signalTexts: collectConditionSignalTexts(entry.conditions),
    timestamp: entry.timestamp
  };
}

export interface BuildUserGoalModelFromSessionOptions {
  feedbackEvents?: UserGoalFeedbackEvent[];
  interactionEvents?: UserGoalInteractionEvent[];
  updatedAt?: Date;
}

export function buildUserGoalModelFromSession(
  state: Pick<AgentSessionState, "userGoal" | "currentConditions" | "searchHistory">,
  options: BuildUserGoalModelFromSessionOptions = {}
) {
  return buildUserGoalModel({
    explicitGoal: state.userGoal,
    currentSignalTexts: collectConditionSignalTexts(state.currentConditions),
    excludedSignalTexts: state.currentConditions.exclude,
    recentSearches: state.searchHistory.map(toGoalModelSearchInput),
    feedbackEvents: options.feedbackEvents,
    interactionEvents: options.interactionEvents,
    updatedAt: options.updatedAt
  });
}
