import enquirer from "enquirer";
import chalk from "chalk";
import { DetailAction, ResultListCommand, ScoredCandidate, SearchConditions, SearchDraft, SortMode, ClarifyAction, SearchHistoryEntry } from "./types.js";

const { Input } = enquirer as unknown as { Input: any };

interface ShortlistViewOptions {
  sortMode: SortMode;
  showingCount: number;
  totalCount: number;
  poolCount?: number;
}

export class TerminalUI {
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
      location: "地点匹配"
    };

    console.log(`\n${chalk.bold(`Top ${options.showingCount}`)} / ${options.totalCount} | ${chalk.bold("排序")}：${sortLabel[options.sortMode]}`);
    console.log(chalk.dim(this.formatConditionsSummary(conditions)));
    console.log(chalk.dim("=".repeat(72)));

    candidates.slice(0, options.showingCount).forEach((candidate, index) => {
      console.log(
        `${chalk.bold(`${index + 1}.`)} ${chalk.blueBright(candidate.name)}  ${chalk.green(candidate.matchScore.toFixed(1))}`
      );
      console.log(`   ${chalk.dim(candidate.location || "地点未知")} · ${candidate.headline || "No headline"}`);
      console.log(`   ${chalk.yellow("为什么匹配")}：${candidate.matchReason || "与本轮条件高度相关"}`);
    });

    console.log(chalk.dim("=".repeat(72)));
    const poolHint = options.poolCount && options.poolCount > 0
      ? chalk.dim(` | pool ${options.poolCount}人`)
      : "";
    console.log(chalk.dim(`动作：v 2 查看详情 | c 1 3 对比 | add 1 加入pool | pool 查看pool${poolHint} | sort tech | r 重新收敛 | m 更多 | q 退出`));
  }

  async promptShortlistAction(): Promise<ResultListCommand> {
    const raw = await this.promptLine("shortlist>", "v 1");
    return this.parseShortlistCommand(raw);
  }

  async promptDetailAction(name: string): Promise<DetailAction> {
    console.log(chalk.dim(`动作：back 返回结果页 | why 看评分依据 | refine 继续收敛 | q 退出`));
    const raw = await this.promptLine(`${name}>`, "back");
    const normalized = raw.trim().toLowerCase();

    if (normalized === "" || normalized === "back" || normalized === "b") {
      return "back";
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

  displayNoResults(conditions: SearchConditions) {
    console.log(chalk.yellow("\n这一轮没有找到合适候选人。"));
    console.log(chalk.dim(`当前条件：${this.formatConditionsSummary(conditions)}`));
    console.log(chalk.dim("可以试试放宽地点、经验，或者补充更明确的技术栈。"));
  }

  displayInvalidCommand(input: string) {
    console.log(chalk.yellow(`未识别的输入：${input || "(空)"}`));
    console.log(chalk.dim("输入 `help` 查看可用动作。"));
  }

  displayHelp() {
    console.log(chalk.dim("\nshortlist 命令："));
    console.log(chalk.dim("  v 2           查看第 2 位候选人"));
    console.log(chalk.dim("  c 1 3         对比第 1 和第 3 位候选人"));
    console.log(chalk.dim("  add 1         把第 1 位加入对比池"));
    console.log(chalk.dim("  pool          查看当前对比池"));
    console.log(chalk.dim("  clear         清空对比池"));
    console.log(chalk.dim("  history       查看搜索历史"));
    console.log(chalk.dim("  undo          回到上一轮搜索条件"));
    console.log(chalk.dim("  show          显示当前筛选条件"));
    console.log(chalk.dim("  sort tech     按技术匹配排序"));
    console.log(chalk.dim("  sort project  按项目深度排序"));
    console.log(chalk.dim("  sort location 按地点匹配排序"));
    console.log(chalk.dim("  r             基于当前结果继续 refine"));
    console.log(chalk.dim("  m             展示更多结果"));
    console.log(chalk.dim("  q             退出"));
  }

  displayPoolAdded(name: string, poolCount: number) {
    console.log(chalk.green(`\n✓ ${name} 已加入对比池 (当前 ${poolCount} 人)`));
  }

  displayPoolEmpty() {
    console.log(chalk.yellow("\n对比池为空。"));
    console.log(chalk.dim("使用 `add N` 把候选人加入对比池。"));
  }

  displayPool(candidates: ScoredCandidate[]) {
    console.log(chalk.bold(`\n对比池 (${candidates.length} 人)：`));
    console.log(chalk.dim("-".repeat(40)));
    candidates.forEach((candidate, index) => {
      console.log(`${index + 1}. ${chalk.blueBright(candidate.name)} | ${chalk.green(candidate.matchScore.toFixed(1))}分 | ${candidate.location || "地点未知"}`);
      console.log(chalk.dim(`   ${candidate.matchReason || "与条件匹配"}`));
    });
    console.log(chalk.dim("-".repeat(40)));
    console.log(chalk.dim("动作：c 对比池内候选人 | clear 清空 | back 返回"));
  }

  displayPoolCleared() {
    console.log(chalk.green("\n对比池已清空。"));
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
    console.log(`${chalk.blue("结果上限")}：${conditions.limit}`);
    console.log(chalk.dim("-".repeat(40)));
  }

  private async promptLine(message: string, initial = ""): Promise<string> {
    const promptBuffer = new Input({
      message,
      initial
    });

    const result = await promptBuffer.run();
    return result.trim();
  }

  private parseShortlistCommand(raw: string): ResultListCommand {
    const trimmed = raw.trim();
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

    const [command, ...rest] = normalized.split(/\s+/);
    const indexes = rest
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if ((command === "v" || command === "view") && indexes.length > 0) {
      return { type: "view", indexes: [indexes[0]] };
    }

    // compare: with indexes OR use pool (empty indexes triggers pool usage in workflow)
    if (command === "c" || command === "compare") {
      return { type: "compare", indexes: indexes.length >= 2 ? indexes : undefined };
    }

    if (command === "sort") {
      const mode = rest[0] as SortMode | undefined;
      if (mode && ["overall", "tech", "project", "location"].includes(mode)) {
        return { type: "sort", sortMode: mode };
      }
    }

    if (command === "add" && indexes.length > 0) {
      return { type: "add", indexes };
    }

    return { type: "help" };
  }

  private formatConditionsSummary(conditions: SearchConditions): string {
    const parts = [
      conditions.role ? `角色 ${conditions.role}` : "",
      conditions.skills.length > 0 ? `技能 ${conditions.skills.join("/")}` : "",
      conditions.locations.length > 0 ? `地点 ${conditions.locations.join("/")}` : "",
      conditions.experience ? `经验 ${conditions.experience}` : "",
      conditions.sourceBias ? `来源 ${conditions.sourceBias}` : ""
    ].filter(Boolean);

    return parts.join(" | ") || "未设置明确条件";
  }
}
