/**
 * Chinese (Simplified) UI strings.
 *
 * Centralized so copy edits don't require touching component logic, and so
 * the diagnostic finding "frontend depends on hard-coded templates" has one
 * place to look. See docs/product/DIAGNOSTIC_REPORT_2026-04-26.md (PR-D).
 */

export const zh = {
  chat: {
    appName: "Seeku 智能搜索",
    runtimeReady: "Mission-ready chat copilot",
    attachedRuntime: "Attached runtime session",
    missionStatus: (phase: string, round: number) => `Mission ${phase} · round ${round}`,
    attachedMission: (phase: string) => `Attached runtime session · mission ${phase}`,
    runtimeConnection: {
      live: "runtime 已连接",
      connecting: "runtime 连接中",
      reconnecting: "runtime 重连中",
      disconnected: "runtime 已断开",
      missing: "runtime session 不存在",
      error: "runtime 连接失败"
    },
    runtimeWarning: {
      missing: "这个 runtime session 已失效，当前聊天不会伪造继续执行。",
      unstable: "当前 runtime 连接不稳定，纠偏会明确失败而不会偷偷走本地 fallback。",
      retry: "重新连接"
    },
    empty: {
      heading: "开始前台长任务搜索",
      hint: "直接描述更大范围的搜索目标，比如：",
      example: "\"帮我持续找上海的 agent infra 候选人，自动收敛后再停\""
    },
    input: {
      runtimePlaceholder: "可提交有限纠偏，例如：别太学术 / 更看近期执行 / 更偏工程经理",
      missionPlaceholder: "运行中可随时插话纠偏...",
      defaultPlaceholder: "描述一个大范围候选搜索任务...",
      send: "发送消息",
      reset: "重新开始",
      resetTooltip: "重新开始对话"
    },
    footer: {
      attached: "当前是 runtime-backed chat：只会把有限纠偏交给真实 runtime，不会回退到本地伪执行。",
      mission: "Mission 运行中可插话，例如：先只看上海 / 别看 academic-heavy / 先给我结果",
      idle: "发起后，agent 会前台持续搜索、收敛并自动停在明确结果点"
    }
  }
} as const;
