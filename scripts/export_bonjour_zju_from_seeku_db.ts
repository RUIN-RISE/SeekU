import { config } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  and,
  createDatabaseConnection,
  eq,
  sourceProfiles,
  type SourceProfile
} from "../packages/db/src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, "../.env") });

const ZJU_KEYWORDS = [
  "浙江大学",
  "浙大",
  "ZJU",
  "Zhejiang University",
  "ZJU X-Lab",
  "启真交叉学科创新创业实验室",
  "竺可桢学院",
  "求是学院",
  "浙江大学 计算机",
  "浙江大学 人工智能"
] as const;

const PRIORITY_LABS = [
  {
    key: "cad-cg",
    aliases: ["cad&cg", "cad cg", "浙江大学cad&cg", "cad&cg国家重点实验室"]
  },
  {
    key: "vipa",
    aliases: ["vipa", "vipa lab", "视觉感知实验室", "visual information processing and analysis"]
  },
  {
    key: "arc",
    aliases: ["arc", "arc lab", "advanced robotics and control", "机器人与控制相关实验室"]
  }
] as const;

const TARGET_COMPANIES = [
  { canonicalName: "DeepSeek", aliases: ["deepseek", "深度求索"] },
  { canonicalName: "Moonshot AI", aliases: ["moonshot ai", "kimi", "月之暗面"] },
  { canonicalName: "MiniMax", aliases: ["minimax", "稀宇科技"] },
  { canonicalName: "Zhipu AI", aliases: ["zhipu ai", "智谱", "智谱ai", "北京智谱华章"] },
  { canonicalName: "01.AI", aliases: ["01.ai", "零一万物"] },
  { canonicalName: "StepFun", aliases: ["stepfun", "step fun", "阶跃星辰"] },
  { canonicalName: "Baichuan", aliases: ["baichuan", "百川智能"] },
  { canonicalName: "SenseTime", aliases: ["sensetime", "商汤", "商汤科技"] },
  { canonicalName: "Alibaba DAMO", aliases: ["alibaba damo", "damo", "阿里达摩院", "达摩院"] },
  { canonicalName: "Tencent Hunyuan", aliases: ["tencent hunyuan", "hunyuan", "腾讯混元"] },
  { canonicalName: "ByteDance Seed", aliases: ["bytedance seed", "字节 seed", "字节跳动 seed"] },
  { canonicalName: "Baidu", aliases: ["baidu", "百度", "文心", "ernie"] },
  { canonicalName: "Huawei Noah", aliases: ["huawei noah", "华为诺亚", "诺亚方舟实验室"] },
  { canonicalName: "Xiaomi AI Lab", aliases: ["xiaomi ai lab", "小米 ai lab", "小米ai实验室"] },
  { canonicalName: "Tencent AI Lab", aliases: ["tencent ai lab", "腾讯 ai lab", "腾讯ailab"] },
  { canonicalName: "Meituan", aliases: ["meituan", "美团"] },
  { canonicalName: "Ant Group", aliases: ["ant group", "ant", "蚂蚁", "蚂蚁集团"] },
  { canonicalName: "Kuaishou", aliases: ["kuaishou", "快手"] },
  { canonicalName: "Bilibili", aliases: ["bilibili", "b站", "哔哩哔哩"] },
  { canonicalName: "JD", aliases: ["jd", "京东", "jd.com"] },
  { canonicalName: "NetEase Fuxi", aliases: ["netease fuxi", "伏羲", "网易伏羲"] },
  { canonicalName: "OPPO", aliases: ["oppo"] },
  { canonicalName: "vivo", aliases: ["vivo"] },
  { canonicalName: "DJI", aliases: ["dji", "大疆"] },
  { canonicalName: "Unitree", aliases: ["unitree", "宇树", "宇树科技"] },
  { canonicalName: "Fourth Paradigm", aliases: ["fourth paradigm", "第四范式"] },
  { canonicalName: "ModelBest", aliases: ["modelbest", "面壁智能"] },
  { canonicalName: "Infinigence", aliases: ["infinigence", "无问芯穹"] },
  { canonicalName: "SiliconFlow", aliases: ["siliconflow", "硅基流动"] }
] as const;

interface RawHandleSummary {
  handle: string;
  occurrences: number;
  categories: string[];
  categoryTitles: string[];
  profileNames: string[];
  profileDescriptions: string[];
  sourceKinds: string[];
  externalSources: string[];
}

interface ExportRow {
  姓名: string;
  Handle: string;
  "Bonjour URL": string;
  命中来源: string;
  ZJU信号: string;
  实验室信号: string;
  目标公司: string;
  出现分类: string;
  关联帖子数: number;
  当前角色: string;
  当前在做: string;
  所在地: string;
  技能: string;
  GitHub: string;
  X: string;
  个人网站: string;
  简介: string;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function normalizeHandleSummary(item: RawHandleSummary): RawHandleSummary {
  return {
    handle: normalizeString(item.handle),
    occurrences: typeof item.occurrences === "number" ? item.occurrences : 0,
    categories: normalizeStringArray(item.categories),
    categoryTitles: normalizeStringArray(item.categoryTitles),
    profileNames: normalizeStringArray(item.profileNames),
    profileDescriptions: normalizeStringArray(item.profileDescriptions),
    sourceKinds: normalizeStringArray(item.sourceKinds),
    externalSources: normalizeStringArray(item.externalSources)
  };
}

function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAliasMention(text: string, alias: string) {
  const normalizedAlias = normalizeText(alias);

  if (/[A-Za-z0-9]/.test(normalizedAlias)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`, "i");
    return pattern.test(text);
  }

  return text.includes(normalizedAlias);
}

function collectZjuKeywordMatches(value: string) {
  const normalized = normalizeText(value);
  return ZJU_KEYWORDS.filter((keyword) => hasAliasMention(normalized, keyword));
}

function findMentionedPriorityLabs(value: string) {
  const normalized = normalizeText(value);
  return PRIORITY_LABS.filter((lab) =>
    lab.aliases.some((alias) => hasAliasMention(normalized, alias))
  );
}

function findMentionedTargetCompanies(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();

  return TARGET_COMPANIES.filter((company) =>
    company.aliases.some((alias) => hasAliasMention(normalized, alias))
  );
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : [];
}

function collectNestedStrings(value: unknown, output: string[]) {
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    if (normalized) {
      output.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNestedStrings(item, output);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectNestedStrings(nested, output);
    }
  }
}

function buildBonjourSearchText(profile: SourceProfile) {
  const rawPayload = (profile.rawPayload ?? {}) as Record<string, unknown>;
  const normalizedPayload = (profile.normalizedPayload ?? {}) as Record<string, unknown>;
  const nestedStrings: string[] = [];

  collectNestedStrings(
    {
      socials: rawPayload.socials ?? normalizedPayload.aliases ?? [],
      contacts: rawPayload.contacts ?? [],
      creations: rawPayload.creations ?? [],
      gridItems: rawPayload.gridItems ?? [],
      memories: rawPayload.memories ?? {},
      basicInfo: rawPayload.basicInfo ?? {},
      aliases: normalizedPayload.aliases ?? []
    },
    nestedStrings
  );

  return compact([
    profile.displayName,
    profile.headline,
    profile.bio,
    profile.locationText,
    normalizeString(rawPayload.name),
    normalizeString(rawPayload.bio),
    normalizeString(rawPayload.description),
    normalizeString(((rawPayload.basicInfo ?? {}) as Record<string, unknown>).current_doing),
    normalizeString(((rawPayload.basicInfo ?? {}) as Record<string, unknown>).role),
    normalizeString(((rawPayload.basicInfo ?? {}) as Record<string, unknown>).skill),
    normalizeString(normalizedPayload.displayName),
    normalizeString(normalizedPayload.headline),
    normalizeString(normalizedPayload.summary),
    normalizeString(normalizedPayload.locationText),
    ...nestedStrings
  ])
    .join("\n")
    .toLowerCase();
}

function collectAliasByType(normalizedPayload: Record<string, unknown>, aliasType: string) {
  const aliases = Array.isArray(normalizedPayload.aliases)
    ? (normalizedPayload.aliases as Array<Record<string, unknown>>)
    : [];

  return aliases
    .filter((alias) => normalizeString(alias.type) === aliasType)
    .map((alias) => normalizeString(alias.value))
    .filter(Boolean)
    .join(", ");
}

function compareRows(left: ExportRow, right: ExportRow) {
  const leftSignalScore =
    left.ZJU信号.split(", ").filter(Boolean).length + left.实验室信号.split(", ").filter(Boolean).length;
  const rightSignalScore =
    right.ZJU信号.split(", ").filter(Boolean).length + right.实验室信号.split(", ").filter(Boolean).length;

  return (
    rightSignalScore - leftSignalScore ||
    right.关联帖子数 - left.关联帖子数 ||
    left.Handle.localeCompare(right.Handle)
  );
}

function escapeCsvField(value: unknown): string {
  const str =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join(" | ")
        : String(value);

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function serializeCsv<T extends object>(rows: T[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const lines = [headers.join(",")];

  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(headers.map((header) => escapeCsvField(record[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]) {
  const now = new Date();
  const defaultDate = now.toISOString().slice(0, 10);
  const defaultTimestamp = now.toISOString().replace(/:/g, "-");

  let date = defaultDate;
  let rawRoot = path.resolve(__dirname, "../output/bonjour-raw/2026-04-11");
  let output = path.resolve(
    "/Users/rosscai/seek-zju/output/bonjour-zju",
    defaultDate,
    `bonjour-zju-from-seeku-db-${defaultTimestamp}.csv`
  );

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = argv[index + 1] ?? date;
      index += 1;
      continue;
    }

    if (arg === "--raw-root") {
      rawRoot = path.resolve(argv[index + 1] ?? rawRoot);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      output = path.resolve(argv[index + 1] ?? output);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!output.includes(path.sep)) {
    output = path.resolve("/Users/rosscai/seek-zju/output/bonjour-zju", date, output);
  }

  return { date, rawRoot, output };
}

async function buildHandleSummaryMap(rawRoot: string) {
  const entries = await readDirJson(rawRoot);
  const merged = new Map<string, RawHandleSummary>();

  for (const entry of entries) {
    for (const item of entry) {
      const normalizedItem = normalizeHandleSummary(item);
      if (!normalizedItem.handle) {
        continue;
      }

      const current = merged.get(normalizedItem.handle);
      if (!current) {
        merged.set(normalizedItem.handle, {
          ...normalizedItem,
          categories: [...normalizedItem.categories],
          categoryTitles: [...normalizedItem.categoryTitles],
          profileNames: [...normalizedItem.profileNames],
          profileDescriptions: [...normalizedItem.profileDescriptions],
          sourceKinds: [...normalizedItem.sourceKinds],
          externalSources: [...normalizedItem.externalSources]
        });
        continue;
      }

      current.occurrences = Math.max(current.occurrences, normalizedItem.occurrences);
      current.categories = [...new Set([...current.categories, ...normalizedItem.categories])];
      current.categoryTitles = [
        ...new Set([...current.categoryTitles, ...normalizedItem.categoryTitles])
      ];
      current.profileNames = [...new Set([...current.profileNames, ...normalizedItem.profileNames])];
      current.profileDescriptions = [
        ...new Set([...current.profileDescriptions, ...normalizedItem.profileDescriptions])
      ];
      current.sourceKinds = [...new Set([...current.sourceKinds, ...normalizedItem.sourceKinds])];
      current.externalSources = [
        ...new Set([...current.externalSources, ...normalizedItem.externalSources])
      ];
    }
  }

  return merged;
}

async function readDirJson(rawRoot: string) {
  const dirEntries = await (await import("node:fs/promises")).readdir(rawRoot, {
    withFileTypes: true
  });
  const batches = dirEntries.filter((entry) => entry.isDirectory());
  const results: RawHandleSummary[][] = [];

  for (const batch of batches) {
    const handlesPath = path.join(rawRoot, batch.name, "handles.json");
    try {
      const parsed = JSON.parse(await readFile(handlesPath, "utf8")) as RawHandleSummary[];
      results.push(parsed);
    } catch {
      continue;
    }
  }

  return results;
}

async function main() {
  const { rawRoot, output } = parseArgs(process.argv.slice(2));
  const handleMap = await buildHandleSummaryMap(rawRoot);
  const { db, close } = createDatabaseConnection();

  try {
    const profiles = await db
      .select()
      .from(sourceProfiles)
      .where(and(eq(sourceProfiles.source, "bonjour"), eq(sourceProfiles.isDeleted, false)));

    const rows: ExportRow[] = [];

    for (const profile of profiles) {
      const normalizedPayload = (profile.normalizedPayload ?? {}) as Record<string, unknown>;
      const searchText = buildBonjourSearchText(profile);
      const summary = handleMap.get(profile.sourceHandle);
      const contextSearchText = [
        ...(summary?.profileNames ?? []),
        ...(summary?.profileDescriptions ?? []),
        ...(summary?.categoryTitles ?? [])
      ]
        .join("\n")
        .toLowerCase();

      const profileZju = collectZjuKeywordMatches(searchText);
      const contextZju = collectZjuKeywordMatches(contextSearchText);
      const zjuSignals = [...new Set([...profileZju, ...contextZju])];

      const profileLabs = findMentionedPriorityLabs(searchText).map((lab) => lab.key);
      const contextLabs = findMentionedPriorityLabs(contextSearchText).map((lab) => lab.key);
      const labSignals = [...new Set([...profileLabs, ...contextLabs])];

      if (zjuSignals.length === 0 && labSignals.length === 0) {
        continue;
      }

      const companySignals = findMentionedTargetCompanies(searchText).map(
        (company) => company.canonicalName
      );

      const hitSources = [
        profileZju.length > 0 || profileLabs.length > 0 ? "profile" : null,
        contextZju.length > 0 || contextLabs.length > 0 ? "community_context" : null
      ].filter(Boolean) as string[];

      rows.push({
        姓名: normalizeString(profile.displayName) || profile.sourceHandle,
        Handle: profile.sourceHandle,
        "Bonjour URL": profile.canonicalUrl,
        命中来源: hitSources.join(", "),
        ZJU信号: zjuSignals.join(", "),
        实验室信号: labSignals.join(", "),
        目标公司: [...new Set(companySignals)].join(", "),
        出现分类: (summary?.categoryTitles ?? []).join(", "),
        关联帖子数: summary?.occurrences ?? 0,
        当前角色:
          normalizeString(normalizedPayload.currentRole) || normalizeString(profile.headline),
        当前在做: normalizeString(normalizedPayload.currentDoing),
        所在地: normalizeString(profile.locationText),
        技能: normalizeString(normalizedPayload.skill),
        GitHub: collectAliasByType(normalizedPayload, "github"),
        X: collectAliasByType(normalizedPayload, "x"),
        个人网站: collectAliasByType(normalizedPayload, "website"),
        简介:
          normalizeString(normalizedPayload.summary) ||
          normalizeString(profile.bio) ||
          normalizeString(profile.headline)
      });
    }

    rows.sort(compareRows);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, serializeCsv(rows), "utf8");

    console.log(`bonjour_profiles=${profiles.length}`);
    console.log(`matched_rows=${rows.length}`);
    console.log(`output_path=${output}`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
