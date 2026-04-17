export const STORAGE_VIEWER_KEY = "seeku_deal_flow_viewer";
export const STORAGE_GOAL_KEY = "seeku_deal_flow_goal";
export const DEFAULT_DEAL_FLOW_GOAL =
  "I want to meet builders working on AI agents and developer tools for an ambitious company.";

export function getOrCreateDealFlowViewerId(): string {
  if (typeof localStorage === "undefined") {
    return "deal-flow-viewer";
  }

  const existing = localStorage.getItem(STORAGE_VIEWER_KEY);
  if (existing) {
    return existing;
  }

  const created =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `viewer-${Date.now()}`;
  localStorage.setItem(STORAGE_VIEWER_KEY, created);
  return created;
}

export function readSavedDealFlowGoal(): string {
  if (typeof localStorage === "undefined") {
    return DEFAULT_DEAL_FLOW_GOAL;
  }

  return localStorage.getItem(STORAGE_GOAL_KEY)?.trim() || DEFAULT_DEAL_FLOW_GOAL;
}

export function saveDealFlowGoal(goal: string) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_GOAL_KEY, goal);
}
