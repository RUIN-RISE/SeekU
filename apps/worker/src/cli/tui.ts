import enquirer from "enquirer";
import chalk from "chalk";
import { emitKeypressEvents } from "node:readline";
import {
  ClarifyAction,
  DetailAction,
  ExportArtifact,
  ExportFormat,
  ExportTarget,
  MatchStrength,
  ResultListCommand,
  ScoredCandidate,
  SearchConditions,
  SearchDraft,
  SearchHistoryEntry,
  ShortlistPromptState,
  ShortlistStatusMessage,
  SortMode
} from "./types.js";

const { Input } = enquirer as unknown as { Input: any };
type CompareAction = "back" | "clear" | "quit";

interface ShortlistViewOptions {
  sortMode: SortMode;
  showingCount: number;
  totalCount: number;
  poolCount?: number;
  poolPersonIds?: string[];
  selectedIndex?: number;
  statusMessage?: ShortlistStatusMessage;
  reuseViewport?: boolean;
}

export class TerminalUI {
  private shortlistViewportHeight = 0;

  displayBanner() {
    process.stdout.write("\x1Bc");
    console.log(chalk.blueBright(`
   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
   ┃                                                                 ┃
   ┃   ${chalk.bold.white("Seeku CLI v1.1.0")}                                         ┃
   ┃   ${chalk.dim("人才搜索助手 - 从需求澄清到 shortlist 决策")}                       ┃
   ┃                                                                 ┃
   ┃   ${chalk.dim("Data Source: ")}${chalk.cyan("Bonjour Cluster")} ${chalk.dim("|")} ${chalk.cyan("GitHub Engine")}                ┃
   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `));
  }

  displayWelcomeTips() {
    console.log(chalk.dim("输入一句自然语言需求，我会先回显理解结果，再带你进入 shortlist。"));
    console.log(chalk.dim("例如：找 3 年以上做推理优化的工程师，杭州或远程，熟悉 CUDA / vLLM。\n"));
  }

  displayInitialSearch(query: string) {
    console.log(`\n🔎 ${chalk.bold("本轮需求")} ${chalk.cyan(query)}`);
  }

  displayClarifiedDraft(draft: SearchDraft) {
    const { conditions, missing } = draft;
    console.log(`\n${chalk.bold("我先帮你收敛一下：")}`);
    console.log(`- ${chalk.blue("角色")}：${conditions.role || chalk.dim("暂未明确")}`);
    console.log(`- ${chalk.blue("技术栈")}：${conditions.skills.length > 0 ? conditions.skills.join(" / ") : chalk.dim("暂未明确")}`);
    console.log(`- ${chalk.blue("地点")}：${conditions.locations.length > 0 ? conditions.locations.join(" / ") : chalk.dim("暂未限制")}`);
    console.log(`- ${chalk.blue("经验")}：${conditions.experience || chalk.dim("暂未限制")}`);
    if (conditions.sourceBias) {
      console.log(`- ${chalk.blue("来源偏好")}：${conditions.sourceBias}`);
    }

    if (missing.length > 0) {
      console.log(`- ${chalk.yellow("目前还缺")}：${missing.join("、")}`);
    }

    console.log(`\n${chalk.bold("下一步：")}`);
    console.log(`[1] 直接搜索`);
    console.log(`[2] 再补充条件`);
    console.log(`[3] 放宽条件`);
    console.log(`[4] 重新描述需求`);
    console.log(`[q] 退出`);
  }

  async promptClarifyAction(): Promise<ClarifyAction> {
    const raw = await this.promptLine(">", "1");
    const normalized = raw.trim().toLowerCase();

    if (normalized === "" || normalized === "1" || normalized === "s" || normalized === "search") {
      return "search";
    }

    if (normalized === "2" || normalized === "a" || normalized === "add") {
      return "add";
    }

    if (normalized === "3" || normalized === "w" || normalized === "relax") {
      return "relax";
    }

    if (normalized === "4" || normalized === "restart") {
      return "restart";
    }

    if (normalized === "q" || normalized === "quit" || normalized === "exit") {
      return "quit";
    }

    return "search";
  }

  displayShortlist(candidates: ScoredCandidate[], conditions: SearchConditions, options: ShortlistViewOptions) {
    const sortLabel: Record<SortMode, string> = {
      overall: "综合分",
      tech: "技术匹配",
      project: "项目深度",
      location: "地点匹配",
      fresh: "新鲜度",
      source: "来源优先级",
      evidence: "证据强度"
    };

    if (options.reuseViewport && this.shortlistViewportHeight > 0) {
      process.stdout.write(`\u001B[${this.shortlistViewportHeight}A\u001B[0J`);
    }

    const lines: string[] = [];
    lines.push("");
    lines.push(`${chalk.bold(`Top ${options.showingCount}`)} / ${options.totalCount} | ${chalk.bold("排序")}：${sortLabel[options.sortMode]}`);
    lines.push(chalk.dim(this.formatConditionsSummary(conditions)));
    lines.push(chalk.dim("=".repeat(72)));

    if (options.statusMessage) {
      const colorize = options.statusMessage.tone === "success"
        ? chalk.green
        : options.statusMessage.tone === "warning"
          ? chalk.yellow
          : chalk.cyan;
      lines.push(colorize(options.statusMessage.text));
      lines.push(chalk.dim("-".repeat(72)));
    }

    const poolMembers = new Set(options.poolPersonIds || []);

    candidates.slice(0, options.showingCount).forEach((candidate, index) => {
      const isSelected = options.selectedIndex === index;
      const isInPool = poolMembers.has(candidate.personId);
      const sourceBadge = this.formatSourceBadge(candidate.sources);
      const freshness = this.formatFreshness(candidate.latestEvidenceAt, candidate.lastSyncedAt);
      const matchStrengthBadge = this.formatMatchStrengthBadge(candidate.matchStrength);
      const linePrefix = isSelected ? chalk.cyanBright("❯") : " ";
      const detailPrefix = isSelected ? chalk.cyan("│") : " ";
      const nameLabel = isSelected
        ? chalk.bgBlue.white(` ${candidate.name} `)
        : chalk.blueBright(candidate.name);
      const poolBadge = isInPool ? chalk.bgYellow.black(" 对比池 ") : "";
      const linkHint = candidate.bonjourUrl
        ? `${detailPrefix} ${chalk.cyan(`🔗 ${candidate.bonjourUrl}`)}`
        : "";

      lines.push(
        `${linePrefix} ${chalk.bold(`${index + 1}.`)} ${nameLabel}  ${chalk.green(candidate.matchScore.toFixed(1))}  ${matchStrengthBadge} ${sourceBadge} ${freshness}${poolBadge ? ` ${poolBadge}` : ""}`
      );
      lines.push(`${detailPrefix} ${chalk.dim(candidate.location || "地点未知")} · ${candidate.headline || "No headline"}`);
      if (linkHint) {
        lines.push(linkHint);
      }
      lines.push(`${detailPrefix} ${chalk.yellow("为什么匹配")}：${candidate.matchReason || "与本轮条件高度相关"}`);
    });

    lines.push(chalk.dim("=".repeat(72)));
    const poolHint = options.poolCount && options.poolCount > 0
      ? chalk.dim(` | pool ${options.poolCount}人`)
      : "";
    const selectedLabel = typeof options.selectedIndex === "number"
      ? `当前选中 #${options.selectedIndex + 1}`
      : "使用方向键选择";
    lines.push(chalk.dim(`热键：↑/↓/j/k 移动 | Enter 详情 | space 入池/移出 | o 打开 | / refine | s 排序 | e 导出 | : 命令 | ? 帮助 | q 退出${poolHint}`));
    lines.push(chalk.dim(`${selectedLabel} | 高级命令仍支持 :history / :show / :sort fresh / :export md`));

    const output = lines.join("\n");
    process.stdout.write(`${output}\n`);
    this.shortlistViewportHeight = output.split("\n").length + 1;
  }

  private formatSourceBadge(sources: string[]): string {
    if (!sources || sources.length === 0 || sources[0] === "Unknown") {
      return chalk.dim("来源未知");
    }

    const badges = sources.map((source) => {
      if (source === "Bonjour") {
        return chalk.bgCyan.black(" Bonjour ");
      }
      if (source === "GitHub") {
        return chalk.bgMagenta.white(" GitHub ");
      }
      return chalk.dim(source);
    });

    return badges.join(" ");
  }

  private formatMatchStrengthBadge(matchStrength?: MatchStrength): string {
    if (matchStrength === "strong") {
      return chalk.bgGreen.black(" 强匹配 ");
    }

    if (matchStrength === "medium") {
      return chalk.bgYellow.black(" 中匹配 ");
    }

    return chalk.bgRed.white(" 弱匹配 ");
  }

  private formatFreshness(latestEvidence?: Date, lastSynced?: Date): string {
    if (!latestEvidence && !lastSynced) {
      return chalk.dim("新鲜度未知");
    }

    const now = new Date();
    const referenceDate = latestEvidence || lastSynced;

    if (!referenceDate) {
      return chalk.dim("新鲜度未知");
    }

    const daysDiff = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 7) {
      return chalk.greenBright(`新鲜 ${daysDiff}天`);
    }
    if (daysDiff <= 30) {
      return chalk.green(`${daysDiff}天前`);
    }
    if (daysDiff <= 90) {
      return chalk.yellow(`${daysDiff}天前`);
    }
    return chalk.dim(`${daysDiff}天前`);
  }

  async promptShortlistAction(state: ShortlistPromptState): Promise<ResultListCommand> {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      const raw = await this.promptLine("shortlist>", `v ${state.selectedIndex + 1}`);
      return this.parseShortlistCommand(raw);
    }

    return this.promptShortlistHotkeys(state);
  }

  async promptDetailAction(name: string): Promise<DetailAction> {
    console.log(chalk.dim(`动作：back 返回 | o 打开 Bonjour | why 看评分依据 | refine 继续收敛 | q 退出`));
    const raw = await this.promptLine(`${name}>`, "back");
    const normalized = raw.trim().toLowerCase();

    if (normalized === "" || normalized === "back" || normalized === "b") {
      return "back";
    }

    if (normalized === "o" || normalized === "open") {
      return "open";
    }

    if (normalized === "why" || normalized === "w") {
      return "why";
    }

    if (normalized === "refine" || normalized === "r") {
      return "refine";
    }

    if (normalized === "q" || normalized === "quit" || normalized === "exit") {
      return "quit";
    }

    return "back";
  }

  async promptCompareAction(): Promise<CompareAction> {
    console.log(chalk.dim("动作：back 返回 shortlist | clear 清空对比池 | q 退出"));
    const raw = await this.promptLine("compare>", "back");
    const normalized = raw.trim().toLowerCase();

    if (normalized === "" || normalized === "back" || normalized === "b") {
      return "back";
    }

    if (normalized === "clear") {
      return "clear";
    }

    if (normalized === "q" || normalized === "quit" || normalized === "exit") {
      return "quit";
    }

    return "back";
  }

  displayNoResults(conditions: SearchConditions) {
    console.log(chalk.yellow("\n这一轮没有找到合适候选人。"));
    console.log(chalk.dim(`当前条件：${this.formatConditionsSummary(conditions)}`));
    console.log(chalk.dim("可以试试放宽地点、经验，或者补充更明确的技术栈。"));
  }

  displayInvalidCommand(input: string) {
    console.log(chalk.yellow(`未识别的输入：${input || "(空)"}`));
    console.log(chalk.dim("输入 `help` 查看可用动作。"));
  }

  displayCompareNeedsMoreCandidates(poolCount: number) {
    if (poolCount <= 0) {
      console.log(chalk.yellow("\n对比池为空，先在 shortlist 里按 `space` 把候选人加入对比池。"));
      console.log(chalk.dim("例如：先选中 1 号按一次 space，再选中 2 号按一次 space，然后输入 c。"));
      return;
    }

    console.log(chalk.yellow(`\n当前对比池只有 ${poolCount} 人，决策对比至少需要 2 人。`));
    console.log(chalk.dim("继续按 `space` 再补一个候选人，然后输入 c。"));
  }

  displayHelp() {
    console.log(chalk.bold("\nshortlist 热键："));
    console.log(chalk.dim("  ↑/↓ 或 j/k     上下移动当前选中项"));
    console.log(chalk.dim("  Enter          查看当前选中候选人详情"));
    console.log(chalk.dim("  space          把当前候选人加入/移出对比池"));
    console.log(chalk.dim("  o              打开当前候选人的 Bonjour 页面"));
    console.log(chalk.dim("  c              进入对比池 compare"));
    console.log(chalk.dim("  / 或 r         直接输入 refine 指令"));
    console.log(chalk.dim("  s              快速输入排序命令（例如 fresh / source）"));
    console.log(chalk.dim("  e              快速输入导出命令（例如 md / pool md）"));
    console.log(chalk.dim("  :              进入高级命令模式"));
    console.log(chalk.dim("  p              查看当前对比池"));
    console.log(chalk.dim("  u              回到上一轮搜索条件"));
    console.log(chalk.dim("  m              展示更多结果"));
    console.log(chalk.dim("  ? / h          打开帮助"));
    console.log(chalk.dim("  q              退出"));
    console.log(chalk.bold("\n高级命令："));
    console.log(chalk.dim("  v 2             查看第 2 位候选人"));
    console.log(chalk.dim("  c 1 3           进入第 1 和第 3 位的决策对比视图"));
    console.log(chalk.dim("  add 1           把第 1 位加入对比池"));
    console.log(chalk.dim("  remove 1        把第 1 位移出对比池"));
    console.log(chalk.dim("  pool            查看当前对比池"));
    console.log(chalk.dim("  clear           清空对比池"));
    console.log(chalk.dim("  history         查看搜索历史"));
    console.log(chalk.dim("  undo            回到上一轮搜索条件"));
    console.log(chalk.dim("  show            显示当前筛选条件"));
    console.log(chalk.dim("  export md       导出当前 shortlist 为 Markdown"));
    console.log(chalk.dim("  export csv      导出当前 shortlist 为 CSV"));
    console.log(chalk.dim("  export json     导出当前 shortlist 为 JSON"));
    console.log(chalk.dim("  export pool md  导出当前对比池"));
    console.log(chalk.dim("  sort overall    恢复综合排序"));
    console.log(chalk.dim("  sort tech       按技术匹配排序"));
    console.log(chalk.dim("  sort project    按项目深度排序"));
    console.log(chalk.dim("  sort location   按地点匹配排序"));
    console.log(chalk.dim("  sort fresh      按新鲜度重排当前 shortlist"));
    console.log(chalk.dim("  sort source     按 Bonjour 优先重排当前 shortlist"));
    console.log(chalk.dim("  sort evidence   按证据强度重排当前 shortlist"));
    console.log(chalk.dim("  r 去掉销售       直接输入自然语言 refine 指令"));
    console.log(chalk.dim("  r 更看重最近活跃"));
    console.log(chalk.dim("  r 像 2 号但更偏后端"));
    console.log(chalk.dim("  提示：sort 只重排当前结果；refine 会触发新一轮搜索"));
  }

  displaySortApplied(sortMode: SortMode) {
    const label: Record<SortMode, string> = {
      overall: "综合排序",
      tech: "技术匹配",
      project: "项目深度",
      location: "地点匹配",
      fresh: "新鲜度",
      source: "来源优先级",
      evidence: "证据强度"
    };

    console.log(chalk.green(`\n✓ 已按${label[sortMode]}重排当前 shortlist。`));
    console.log(chalk.dim("这是 rerank-only 操作，仅重排当前结果，不会重新搜索。"));
  }

  displayPoolAdded(name: string, poolCount: number) {
    console.log(chalk.green(`\n✓ ${name} 已加入对比池 (当前 ${poolCount} 人)`));
  }

  displayPoolEmpty() {
    console.log(chalk.yellow("\n对比池为空。"));
    console.log(chalk.dim("在 shortlist 中按 `space` 可快速入池，也可以用 `add N`，例如：add 1。"));
  }

  displayPool(candidates: ScoredCandidate[]) {
    console.log(chalk.bold(`\n对比池 (${candidates.length} 人)：`));
    console.log(chalk.dim("-".repeat(40)));
    candidates.forEach((candidate, index) => {
      console.log(`${index + 1}. ${chalk.blueBright(candidate.name)} | ${chalk.green(candidate.matchScore.toFixed(1))}分 | ${candidate.location || "地点未知"}`);
      console.log(chalk.dim(`   ${candidate.matchReason || "与条件匹配"}`));
    });
    console.log(chalk.dim("-".repeat(40)));
    console.log(chalk.dim("下一步：输入 c 进入决策对比 | export pool md 导出对比池 | clear 清空对比池 | back 返回 shortlist"));
  }

  displayPoolCleared() {
    console.log(chalk.green("\n对比池已清空。"));
  }

  displayExportSuccess(artifact: ExportArtifact) {
    const primaryFile = artifact.files[0];
    const targetLabel = artifact.target === "pool" ? "对比池" : "shortlist";
    const formatLabel = this.formatExportLabel(artifact.format);

    console.log(chalk.green(`\n✓ 已导出${targetLabel}（${artifact.count} 人，${formatLabel}）`));
    console.log(chalk.dim(`目录：${artifact.outputDir}`));
    if (primaryFile) {
      console.log(chalk.dim(`文件：${primaryFile.path}`));
    }
  }

  displayExportEmpty(target: ExportTarget) {
    if (target === "pool") {
      console.log(chalk.yellow("\n对比池为空，暂时无法导出。"));
    console.log(chalk.dim("先在 shortlist 里按 `space` 入池，或使用 `add N`，再执行 `export pool md`。"));
      return;
    }

    console.log(chalk.yellow("\n当前 shortlist 没有可导出的候选人。"));
  }

  displayHistory(history: SearchHistoryEntry[]) {
    if (history.length === 0) {
      console.log(chalk.yellow("\n暂无搜索历史。"));
      return;
    }

    console.log(chalk.bold(`\n搜索历史 (${history.length} 轮)：`));
    console.log(chalk.dim("-".repeat(50)));
    history.forEach((entry, index) => {
      const timeStr = entry.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      const conditionsStr = this.formatConditionsSummary(entry.conditions);
      console.log(`${index + 1}. ${chalk.dim(timeStr)} | ${chalk.green(`${entry.resultCount}人`)} | ${conditionsStr.slice(0, 40)}${conditionsStr.length > 40 ? "..." : ""}`);
    });
    console.log(chalk.dim("-".repeat(50)));
    console.log(chalk.dim("动作：undo 回到上一轮 | back 返回"));
  }

  displayUndo(previousConditions: SearchConditions | null) {
    if (!previousConditions) {
      console.log(chalk.yellow("\n无法 undo：没有更早的搜索记录。"));
      return;
    }

    console.log(chalk.green("\n已回退到上一轮搜索条件："));
    console.log(chalk.dim(this.formatConditionsSummary(previousConditions)));
  }

  displayFilters(conditions: SearchConditions) {
    console.log(chalk.bold("\n当前搜索条件："));
    console.log(chalk.dim("-".repeat(40)));
    console.log(`${chalk.blue("角色")}：${conditions.role || chalk.dim("未限制")}`);
    console.log(`${chalk.blue("技术栈")}：${conditions.skills.length > 0 ? conditions.skills.join(" / ") : chalk.dim("未限制")}`);
    console.log(`${chalk.blue("地点")}：${conditions.locations.length > 0 ? conditions.locations.join(" / ") : chalk.dim("未限制")}`);
    console.log(`${chalk.blue("经验")}：${conditions.experience || chalk.dim("未限制")}`);
    console.log(`${chalk.blue("来源")}：${conditions.sourceBias || chalk.dim("未限制")}`);
    console.log(`${chalk.blue("必须项")}：${conditions.mustHave.length > 0 ? conditions.mustHave.join(" / ") : chalk.dim("未设置")}`);
    console.log(`${chalk.blue("优先项")}：${conditions.niceToHave.length > 0 ? conditions.niceToHave.join(" / ") : chalk.dim("未设置")}`);
    console.log(`${chalk.blue("排除项")}：${conditions.exclude.length > 0 ? conditions.exclude.join(" / ") : chalk.dim("未设置")}`);
    console.log(`${chalk.blue("近期偏好")}：${conditions.preferFresh ? "优先最近活跃" : chalk.dim("无")}`);
    console.log(`${chalk.blue("参考候选")}：${
      conditions.candidateAnchor?.name
        ? `${conditions.candidateAnchor.name}${conditions.candidateAnchor.shortlistIndex ? ` (#${conditions.candidateAnchor.shortlistIndex})` : ""}`
        : conditions.candidateAnchor?.shortlistIndex
          ? `#${conditions.candidateAnchor.shortlistIndex}`
          : chalk.dim("无")
    }`);
    console.log(`${chalk.blue("结果上限")}：${conditions.limit}`);
    console.log(chalk.dim("-".repeat(40)));
  }

  resetShortlistViewport() {
    this.shortlistViewportHeight = 0;
  }

  private async promptLine(message: string, initial = ""): Promise<string> {
    const promptBuffer = new Input({
      message,
      initial
    });

    const result = await promptBuffer.run();
    return result.trim();
  }

  private async promptShortlistHotkeys(state: ShortlistPromptState): Promise<ResultListCommand> {
    const stdin = process.stdin as NodeJS.ReadStream & {
      isRaw?: boolean;
      setRawMode(mode: boolean): void;
    };
    const wasRaw = Boolean(stdin.isRaw);

    emitKeypressEvents(stdin);
    if (!wasRaw) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    return new Promise((resolve) => {
      let settled = false;

      const renderPrompt = () => {
        const prompt = chalk.dim(
          `shortlist> #${state.selectedIndex + 1} | ↑/↓/j/k 移动 | Enter 详情 | space 入池/移出 | / refine | s 排序 | e 导出 | : 命令 | ? 帮助`
        );
        process.stdout.write(`\u001B[2K\r${prompt}`);
      };

      const cleanup = (appendNewline: boolean) => {
        stdin.off("keypress", onKeypress);
        if (!wasRaw) {
          stdin.setRawMode(false);
        }
        process.stdout.write("\u001B[2K\r");
        if (appendNewline) {
          process.stdout.write("\n");
        }
      };

      const finalize = (command: ResultListCommand, appendNewline = true) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup(appendNewline);
        resolve(command);
      };

      const enterLineMode = (
        message: string,
        initial: string,
        mapResult: (raw: string) => ResultListCommand,
        fallback: ResultListCommand = { type: "back" }
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup(false);
        void this.promptLine(message, initial)
          .then((raw) => resolve(mapResult(raw)))
          .catch(() => resolve(fallback));
      };

      const onKeypress = (str: string, key: { ctrl?: boolean; name?: string; sequence?: string; meta?: boolean }) => {
        if (key.ctrl && key.name === "c") {
          finalize({ type: "quit" });
          return;
        }

        if (key.name === "up" || (!key.ctrl && !key.meta && key.name === "k") || (key.ctrl && key.name === "p")) {
          finalize({ type: "moveSelection", direction: "up" });
          return;
        }

        if (key.name === "down" || (!key.ctrl && !key.meta && key.name === "j") || (key.ctrl && key.name === "n")) {
          finalize({ type: "moveSelection", direction: "down" });
          return;
        }

        if (key.name === "return") {
          finalize({ type: "view", indexes: [state.selectedIndex + 1] });
          return;
        }

        if (key.name === "space") {
          finalize({ type: "togglePool", indexes: [state.selectedIndex + 1] });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "o") {
          finalize({ type: "open", indexes: [state.selectedIndex + 1] });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "c") {
          finalize({ type: "compare" });
          return;
        }

        if (!key.ctrl && !key.meta && (key.name === "r" || str === "/")) {
          enterLineMode(
            "refine>",
            "",
            (raw) => {
              const prompt = raw.trim();
              return prompt ? { type: "refine", prompt } : { type: "back" };
            }
          );
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "q") {
          finalize({ type: "quit" });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "m") {
          finalize({ type: "showMore" });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "p") {
          finalize({ type: "pool" });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "u") {
          finalize({ type: "undo" });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "s") {
          enterLineMode("sort>", "", (raw) => {
            const input = raw.trim();
            if (!input) {
              return { type: "back" };
            }
            return this.parseShortlistCommand(`sort ${input}`);
          });
          return;
        }

        if (!key.ctrl && !key.meta && key.name === "e") {
          enterLineMode("export>", "", (raw) => {
            const input = raw.trim();
            if (!input) {
              return { type: "back" };
            }
            return this.parseShortlistCommand(`export ${input}`);
          });
          return;
        }

        if (str === ":") {
          enterLineMode("command>", "", (raw) => this.parseShortlistCommand(raw), { type: "help" });
          return;
        }

        if (!key.ctrl && !key.meta && (str === "?" || key.name === "h")) {
          finalize({ type: "help" });
          return;
        }

        if (!key.ctrl && !key.meta && str && /^[1-9]$/.test(str)) {
          finalize({ type: "view", indexes: [Number(str)] });
          return;
        }
      };

      stdin.on("keypress", onKeypress);
      renderPrompt();
    });
  }

  private parseShortlistCommand(raw: string): ResultListCommand {
    const trimmed = raw.trim().replace(/^[:/]\s*/, "");
    const normalized = trimmed.toLowerCase();

    if (!trimmed || normalized === "v" || normalized === "view") {
      return { type: "view", indexes: [1] };
    }

    if (normalized === "q" || normalized === "quit" || normalized === "exit") {
      return { type: "quit" };
    }

    if (normalized === "r" || normalized === "refine") {
      return { type: "refine" };
    }

    if (normalized === "m" || normalized === "more") {
      return { type: "showMore" };
    }

    if (normalized === "h" || normalized === "help" || normalized === "?") {
      return { type: "help" };
    }

    if (normalized === "pool" || normalized === "p") {
      return { type: "pool" };
    }

    if (normalized === "clear") {
      return { type: "clear" };
    }

    if (normalized === "history" || normalized === "hist") {
      return { type: "history" };
    }

    if (normalized === "undo" || normalized === "u") {
      return { type: "undo" };
    }

    if (normalized === "show" || normalized === "filters") {
      return { type: "show" };
    }

    if (normalized === "back" || normalized === "b") {
      return { type: "back" };
    }

    const [command, ...rest] = normalized.split(/\s+/);
    const indexes = rest
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if ((command === "v" || command === "view") && indexes.length > 0) {
      return { type: "view", indexes: [indexes[0]] };
    }

    if ((command === "r" || command === "refine") && rest.length > 0) {
      return { type: "refine", prompt: trimmed.slice(trimmed.indexOf(" ") + 1).trim() };
    }

    // compare: with indexes OR use pool (empty indexes triggers pool usage in workflow)
    if (command === "c" || command === "compare") {
      return { type: "compare", indexes: indexes.length >= 2 ? indexes : undefined };
    }

    if (command === "sort") {
      const token = rest[0];
      const mode = token === "freshness"
        ? "fresh"
        : token === "sources"
          ? "source"
          : token === "evidence-strength"
            ? "evidence"
            : token as SortMode | undefined;

      if (mode && ["overall", "tech", "project", "location", "fresh", "source", "evidence"].includes(mode)) {
        return { type: "sort", sortMode: mode };
      }
    }

    if (command === "add" && indexes.length > 0) {
      return { type: "add", indexes };
    }

    if ((command === "remove" || command === "rm" || command === "del") && indexes.length > 0) {
      return { type: "remove", indexes };
    }

    if (command === "export" || command === "e") {
      const exportTarget = this.parseExportTarget(rest);
      const exportFormat = this.parseExportFormat(rest);

      if (!exportTarget && !exportFormat && rest.length > 0) {
        return { type: "help" };
      }

      return {
        type: "export",
        exportFormat: exportFormat || "md",
        exportTarget: exportTarget || "shortlist"
      };
    }

    // open: open Bonjour profile in browser
    if ((command === "o" || command === "open") && indexes.length > 0) {
      return { type: "open", indexes: [indexes[0]] };
    }

    return { type: "help" };
  }

  private parseExportFormat(tokens: string[]): ExportFormat | undefined {
    if (tokens.includes("md") || tokens.includes("markdown")) {
      return "md";
    }

    if (tokens.includes("csv")) {
      return "csv";
    }

    if (tokens.includes("json")) {
      return "json";
    }

    return undefined;
  }

  private parseExportTarget(tokens: string[]): ExportTarget | undefined {
    if (tokens.includes("pool") || tokens.includes("compare")) {
      return "pool";
    }

    if (tokens.includes("shortlist") || tokens.includes("list")) {
      return "shortlist";
    }

    return undefined;
  }

  private formatExportLabel(format: ExportFormat): string {
    if (format === "md") {
      return "Markdown";
    }

    if (format === "csv") {
      return "CSV";
    }

    return "JSON";
  }

  private formatConditionsSummary(conditions: SearchConditions): string {
    const parts = [
      conditions.role ? `角色 ${conditions.role}` : "",
      conditions.skills.length > 0 ? `技能 ${conditions.skills.join("/")}` : "",
      conditions.locations.length > 0 ? `地点 ${conditions.locations.join("/")}` : "",
      conditions.experience ? `经验 ${conditions.experience}` : "",
      conditions.sourceBias ? `来源 ${conditions.sourceBias}` : "",
      conditions.mustHave.length > 0 ? `必须 ${conditions.mustHave.join("/")}` : "",
      conditions.niceToHave.length > 0 ? `优先 ${conditions.niceToHave.join("/")}` : "",
      conditions.exclude.length > 0 ? `排除 ${conditions.exclude.join("/")}` : "",
      conditions.preferFresh ? "最近活跃优先" : "",
      conditions.candidateAnchor?.name
        ? `参考 ${conditions.candidateAnchor.name}`
        : conditions.candidateAnchor?.shortlistIndex
          ? `参考 #${conditions.candidateAnchor.shortlistIndex}`
          : ""
    ].filter(Boolean);

    return parts.join(" | ") || "未设置明确条件";
  }
}
