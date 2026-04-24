/**
 * Guide hints for the mascot/navigator.
 *
 * Phase 8 of CLI upgrade: provide contextual, actionable hints
 * that appear at specific trigger points during the user journey.
 *
 * Implemented triggers:
 * - home_empty: shown when launcher has no resume items
 * - first_shortlist: shown once when shortlist first renders
 * - decision_complete: shown when clear recommendation is made
 *
 * Reserved triggers (defined but not yet wired):
 * - blocked: for recovery stop / no-results scenarios (future integration)
 */

export type GuideTrigger =
  | "home_empty"
  | "blocked"
  | "first_shortlist"
  | "decision_complete";

export interface GuideHint {
  text: string;
  trigger: GuideTrigger;
}

export interface GuideContext {
  blockerLabel?: string;
  candidateName?: string;
}

const GUIDE_HINTS: Record<GuideTrigger, string> = {
  home_empty: "还没有进行中的任务。输入需求开始搜索。",
  blocked: "当前阻塞：{blocker}。/refine 调整条件或 /back 返回。",
  first_shortlist: "↑↓ 移动，Enter 详情，space 加对比池。",
  decision_complete: "已推荐 {name}。/export 导出，/new 新任务。"
};

/**
 * Get a guide hint for the given trigger.
 * Returns null if no hint should be shown.
 */
export function getGuideHint(
  trigger: GuideTrigger,
  context?: GuideContext
): GuideHint | null {
  const template = GUIDE_HINTS[trigger];
  if (!template) {
    return null;
  }

  let text = template;

  if (trigger === "blocked" && context?.blockerLabel) {
    text = template.replace("{blocker}", context.blockerLabel);
  } else if (trigger === "blocked") {
    return null;
  }

  if (trigger === "decision_complete" && context?.candidateName) {
    text = template.replace("{name}", context.candidateName);
  } else if (trigger === "decision_complete") {
    return null;
  }

  return { text, trigger };
}
