import type { Person, EvidenceItem, NewSearchDocument, RankFeatures } from "@seeku/db";

import { collectDocumentAliasTerms } from "./search-normalization.js";
import { isKnownZjuAlumniSeed, type SearchSourceHint, ZJU_MANUAL_SEED_TAG } from "./zju-alumni-seeds.js";
import { buildCandidateDirectionProfile, toDirectionFacetTags } from "./daily-deal-flow.js";

export interface SearchDocumentInput {
  person: Person;
  evidence: EvidenceItem[];
  sourceHints?: SearchSourceHint[];
}

export function buildSearchDocument(input: SearchDocumentInput): NewSearchDocument {
  const { person, evidence, sourceHints = [] } = input;

  // Build doc_text from person and evidence
  const textParts: string[] = [];

  // Person basic info
  if (person.primaryName) textParts.push(person.primaryName);
  if (person.primaryHeadline) textParts.push(person.primaryHeadline);
  if (person.summary) textParts.push(person.summary);
  if (person.primaryLocation) textParts.push(person.primaryLocation);

  // Evidence items
  for (const item of evidence) {
    if (item.title) textParts.push(item.title);
    if (item.description) textParts.push(item.description);
  }

  textParts.push(...collectDocumentAliasTerms(textParts));

  const docText = textParts.join(" ");

  // Extract facets
  const facetRole = extractRoles(person, evidence);
  const facetLocation = extractLocations(person, evidence);
  const facetSource = extractSources(evidence, sourceHints);
  const facetTags = extractTags(person, evidence, sourceHints);

  // Compute rank features
  const rankFeatures = computeRankFeatures(person, evidence);

  return {
    personId: person.id,
    docText,
    facetRole,
    facetLocation,
    facetSource,
    facetTags,
    rankFeatures,
    updatedAt: new Date()
  };
}

const ROLE_LABEL_MAX_LENGTH = 24;
const MAX_FACET_ROLES = 6;
const ROLE_SIGNAL_MAX_LENGTH = 160;
const SHORT_ROLE_SEGMENT_MAX_LENGTH = 36;
const RELEVANT_PROFILE_FIELDS = new Set(["role", "current_doing", "skill", "bio"]);
const ROLE_PRIORITY = [
  "研究科学家",
  "AI研究员",
  "研究员",
  "算法工程师",
  "AI工程师",
  "技术负责人",
  "架构师",
  "产品经理",
  "创始人",
  "联合创始人",
  "合伙人",
  "投资人",
  "全栈工程师",
  "后端工程师",
  "前端工程师",
  "工程师",
  "开发者",
  "开源开发者",
  "独立开发者",
  "负责人",
  "管理者",
  "运营",
  "市场",
  "设计师",
  "学生",
  "媒体",
  "HR"
] as const;

function normalizeRoleSourceText(value: string) {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[“”"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRoleSegments(value: string): string[] {
  const normalized = normalizeRoleSourceText(value);
  if (!normalized) {
    return [];
  }

  const prepared = normalized
    .replace(/\r?\n+/g, "\n")
    .replace(/[|｜;；]+/g, "\n")
    .replace(/[，,、]+/g, "\n")
    .replace(/\s*[\/／]\s*/g, "\n")
    .replace(/[。！？!?]+/g, "\n");

  return prepared
    .split("\n")
    .map((segment) =>
      segment
        .trim()
        .replace(/^[\-•·]+/u, "")
        .replace(/\s*@\s*[^@]+$/u, "")
        .replace(/\s+at\s+.+$/iu, "")
        .trim()
    )
    .filter((segment) => segment.length > 0 && Array.from(segment).length <= ROLE_SIGNAL_MAX_LENGTH);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function rankRole(role: string) {
  const index = ROLE_PRIORITY.indexOf(role as typeof ROLE_PRIORITY[number]);
  return index === -1 ? ROLE_PRIORITY.length : index;
}

function trimFacetRoles(values: Iterable<string>): string[] {
  return Array.from(new Set(values))
    .filter((role) => role.length > 0 && Array.from(role).length <= ROLE_LABEL_MAX_LENGTH)
    .sort((left, right) => rankRole(left) - rankRole(right))
    .slice(0, MAX_FACET_ROLES);
}

function shouldIgnoreRoleSegment(segment: string, lower: string) {
  if (/(looking for|open to work|we are hiring|hiring|招聘|招募|寻找|求职)/i.test(lower)) {
    return true;
  }

  if (/合作伙伴/.test(segment)) {
    return true;
  }

  return false;
}

function classifyRoleSegment(segment: string): string[] {
  const normalized = segment.trim();
  if (!normalized) {
    return [];
  }

  const lower = normalized.toLowerCase();
  if (shouldIgnoreRoleSegment(normalized, lower)) {
    return [];
  }

  const isShortSegment = Array.from(normalized).length <= SHORT_ROLE_SEGMENT_MAX_LENGTH;
  const hasStrongRoleTitle =
    /(co[- ]?founder|founder|联合创始人|创始人|创业者|合伙人|\bpartner\b|\bceo\b|\bcoo\b|\bcmo\b|\bcfo\b|总经理|负责人|总监|董事|经理|管理|investor|\bvc\b|cvc\b|投资人|投资者|投资经理|战略投资|投资负责|venture capital|^投资$|产品经理|项目经理|product manager|project manager|\bpm\b|^产品$|ai\s*产品|game[- ]?design|策划|planner|designer|设计师|uiux|ui\/ux|ux designer|ui designer|product design|产品设计|交互设计|平面设计|结构设计|技术美术|摄影师|photographer|摄像|剪辑师|飞行员|机长|\bpilot\b|captain|engineer|工程师|developer|\bdev\b|开发者|开发|程序员|独立开发者|open[- ]?sourcerer|open source maintainer|开源作者|开源维护者|researcher|研究员|科研工作者|scientist|科学家|研究科学家|首席科学家|行业研究|ai4science\s*研究|具身智能研究|优化算法|postdoc|博士后|professor|教授|phd|博士|研究生|硕士|本科|undergraduate|master|b\.s\.|m\.s\.|实习生|intern|算法工程师|机器学习工程师|ml engineer|ai engineer|nlp工程师|cv工程师|rag工程师|agent工程师|ai infra|技术负责人|技术总监|\btl\b|架构师|architect|tech lead|cto|ios|销售|客户经理|大客户经理|渠道经理|顾问|consultant|student|学生|creator|创作者|aigcer|博主|运营|operations?|后端|frontend|前端|全栈|full[- ]?stack|sre|devops|数据工程师|data engineer|platform engineer|api gateway|waf|应用防火墙|marketing|branding|市场|品牌|增长|growth|\bgtm\b|\bpr\b|strategist|strategy|战略|生态|主理人|店主|owner|host|hrbp|\bhr\b|recruiter|猎头|律师|lawyer|编辑|记者|journalist|editor|导演|编导|媒体|传媒|财务|金融|采购|招商)/i.test(
      lower
    );

  if (!isShortSegment && !hasStrongRoleTitle) {
    return [];
  }

  const roles: string[] = [];
  const hasAiDomain =
    /(aigc|ai\b|agent|rag|llm|gpt|machine learning|deep learning|\bml\b|智能体|大模型|模型|算法|优化算法|多模态|计算机视觉|具身智能|ai infra|infra|neocloud)/i.test(
      lower
    );
  const hasResearchSignal = /(researcher|research|研究员|研究|scientist)/i.test(lower);
  const hasExplicitResearcher = /(researcher|研究员|scientist)/i.test(lower);
  const hasEngineerSignal = /(engineer|工程师|研发)/i.test(lower);
  const hasDeveloperSignal =
    /(developer|开发者|builder|独立开发者|indie hacker|independent developer|open[- ]?sourcerer|open source maintainer|开源作者|开源维护者)/i.test(lower) ||
    /(网站开发|应用开发|软件开发|小程序开发|游戏开发|程序开发)/i.test(lower) ||
    (isShortSegment && /((游戏|小程序|应用|软件|网站|程序|代码).{0,8}开发|开发.{0,8}(游戏|小程序|应用|软件|网站|程序|代码))/i.test(lower));
  const hasProductManager = /(product manager|产品经理|\bpm\b)/i.test(lower);
  const hasConservativeProductAlias =
    /(产品人|产品创造者|智能座舱产品|会点代码的产品|产品\s*\+\s*技术|产品\s+大模型算法|产品.{0,4}(算法|设计|项目|推荐))/i.test(
      lower
    );

  if (/(co[- ]?founder|联合创始人)/i.test(lower)) {
    roles.push("联合创始人");
  } else if (/(founder|创始人|创业者)/i.test(lower)) {
    roles.push("创始人");
  }

  if (/\bceo\b|总经理|^管理$|^经理$|董事/i.test(lower)) {
    roles.push("管理者");
  }

  if (/\bcoo\b/.test(lower)) {
    roles.push("运营");
    roles.push("管理者");
  }

  if (/\bcmo\b/.test(lower)) {
    roles.push("市场");
    roles.push("管理者");
  }

  if (/\bcfo\b|财务|金融民工/i.test(lower)) {
    roles.push("财务");
  }

  if (/(合伙人|\bpartner\b)/i.test(lower)) {
    roles.push("合伙人");
  }

  if (
    /(investor|投资人|投资者|投资经理|投资分析|战略投资|投资负责|个人投资|\bcvc\b|\bvc\b|venture capital|^投资$|投资助理|一级投资|战投经理|量化投资|科技投资)/i.test(
      lower
    )
  ) {
    roles.push("投资人");
  }

  if (hasProductManager || /^产品$/i.test(normalized) || /ai\s*产品|ai产品/i.test(lower) || hasConservativeProductAlias) {
    roles.push("产品经理");
  }

  if (/(project manager|项目经理)/i.test(lower)) {
    roles.push("项目经理");
  }

  if (/(^策划$|游戏策划|产品策划|活动策划|内容策划|策展人|game[- ]?design|\bplanner\b)/i.test(lower)) {
    roles.push("策划");
  }

  if (/(designer|设计师|品牌设计|\bux\b|\bui\b|uiux|ui\/ux|ux designer|ui designer|product design|视觉设计|产品设计|交互设计|平面设计|结构设计|技术美术)/i.test(lower)) {
    roles.push("设计师");
  }

  const hasExplicitMarketing = /(marketing|branding|brand strategist|market strategist|市场|品牌|品牌策略|营销)/i.test(lower);
  if (hasExplicitMarketing || /\bgtm\b|\bpr\b/i.test(lower)) {
    roles.push("市场");
  }

  const hasExplicitOperations = /(运营|operations?|operator|品牌运营|商业化运营|社区运营|主理人|店主|owner|host)/i.test(lower);
  if (hasExplicitOperations || (!hasProductManager && isShortSegment && /(growth|增长)/i.test(lower))) {
    roles.push("运营");
  }

  if (isShortSegment && /(strategist|strategy|战略|生态)/i.test(lower)) {
    roles.push("战略");
  }

  if (
    /(sales|商务|销售|\bbd\b|business development|业务开发|业务经理|解决方案经理|客户经理|大客户经理|渠道经理|招商|采购|customer solutions|tender manager)/i.test(
      lower
    )
  ) {
    roles.push("销售");
  }

  if (/(hrbp|\bhr\b|recruiter|猎头|招聘)/i.test(lower)) {
    roles.push("HR");
  }

  if (/(consultant|advisor|顾问)/i.test(lower)) {
    roles.push("顾问");
  }

  if (/(律师|lawyer|legal counsel)/i.test(lower)) {
    roles.push("律师");
  }

  if (/(科技媒体编辑|科技记者|编辑|记者|journalist|editor|导演|编导|媒体|传媒|剪辑师)/i.test(lower)) {
    roles.push("媒体");
  }

  if (/(teacher|lecturer|讲师|导师)/i.test(lower)) {
    roles.push("讲师");
  }

  if (/(photographer|摄影师|摄像师|摄像|摄影)/i.test(lower)) {
    roles.push("摄影师");
  }

  if (/(飞行员|机长|\bpilot\b|captain)/i.test(lower)) {
    roles.push("飞行员");
  }

  if (/(student|中学生|学生|undergraduate|本科|研究生|硕士|master|phd candidate|doctoral candidate|博士生|博士研究生|准大三|b\.s\.|m\.s\.|实习生|\bintern\b|大一新生|大学牲)/i.test(lower)) {
    roles.push("学生");
  }

  if (/(creator|创作者|aigcer|podcaster|播客主|博主|up主|视频创作|内容创作)/i.test(lower)) {
    roles.push("创作者");
  }

  let hasSpecificEngineeringRole = false;

  if (/full[- ]?stack|全栈/i.test(lower)) {
    roles.push("全栈工程师");
    hasSpecificEngineeringRole = true;
  } else if (/backend|后端|后台开发/i.test(lower)) {
    roles.push("后端工程师");
    hasSpecificEngineeringRole = true;
  } else if (/frontend|前端/i.test(lower)) {
    roles.push("前端工程师");
    hasSpecificEngineeringRole = true;
  }

  // Research & science roles
  if (/研究科学家|research scientist|首席科学家|chief scientist/i.test(lower)) {
    roles.push("研究科学家");
  } else if (/(assistant professor|associate professor|professor|教授|博导|导师)/i.test(lower)) {
    roles.push("研究员");
  } else if (/(postdoc|postdoctoral|博士后)/i.test(lower)) {
    roles.push("研究员");
  } else if (/(行业研究|ai4science\s*研究|科研工作者|研究者|研究人员|研究人員|\bresearch\b|研究所)/i.test(lower)) {
    roles.push("研究员");
  } else if (hasAiDomain && hasResearchSignal) {
    roles.push("AI研究员");
  } else if (hasExplicitResearcher || /研究員/i.test(normalized)) {
    roles.push("研究员");
  }

  // Specialized engineering roles (more specific first)
  if (!hasSpecificEngineeringRole && /(算法工程师|算法研究员|algorithm engineer|^优化算法$)/i.test(lower)) {
    roles.push("算法工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(机器学习工程师|ml engineer|machine learning engineer)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(ai engineer|人工智能工程师)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(nlp工程师|nlp engineer|自然语言处理工程师)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(cv工程师|cv engineer|计算机视觉工程师|vision engineer)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(rag工程师|rag engineer)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(agent工程师|agent engineer|智能体工程师)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(ai程序员|ai 程序员|ai developer|ai开发|ai 开发|大模型开发|智能体开发|agent开发|rag开发)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(ai infra|ai infrastructure|ai基础设施)/i.test(lower)) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(数据工程师|data engineer)/i.test(lower)) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(platform engineer|平台工程师)/i.test(lower)) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(api gateway|waf|应用防火墙)/i.test(lower)) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  if (
    !hasSpecificEngineeringRole &&
    /(^开发$|技术开发|开发成员|嵌入式开发|安全开发|机器视觉|视觉开发|ros2|鸿蒙开发|^ios$|ios\s*开发|android\s*开发|软件开发|独立开发|小软件|程序员|\bdev\b|编程中|客户端开发|c\+\+客户端开发|elixir开发|web3合约开发|跨端开发|流程开发|设计开发)/i.test(
      lower
    )
  ) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  // Leadership roles
  if (
    /(技术负责人|技术总监|技术经理|技术管理|技术管理者|cto|vp of engineering|vp engineering|head of engineering|software tl|\btl\b|tech lead|technical lead)/i.test(
      lower
    )
  ) {
    if (!roles.includes("技术负责人")) roles.push("技术负责人");
  }

  if (!roles.includes("技术负责人") && /(负责人|总监)/i.test(lower)) {
    roles.push("负责人");
  }

  if (/(架构师|architect|software architect|系统架构|架构设计|场景架构|技术架构|宏观技术架构)/i.test(lower)) {
    if (!roles.includes("架构师")) roles.push("架构师");
  }

  if (!hasSpecificEngineeringRole && hasAiDomain && (hasEngineerSignal || (isShortSegment && hasDeveloperSignal))) {
    roles.push("AI工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /独立开发者|indie hacker|independent developer/i.test(lower)) {
    roles.push("独立开发者");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && /(open[- ]?sourcerer|open source maintainer|开源作者|开源维护者)/i.test(lower)) {
    roles.push("开源开发者");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && hasEngineerSignal) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  if (!hasSpecificEngineeringRole && hasDeveloperSignal) {
    roles.push("开发者");
  }

  // DevOps / SRE
  if (!hasSpecificEngineeringRole && /(devops|sre|site reliability)/i.test(lower)) {
    roles.push("工程师");
    hasSpecificEngineeringRole = true;
  }

  return trimFacetRoles(roles);
}

function extractRoles(person: Person, evidence: EvidenceItem[]): string[] {
  const roles: Set<string> = new Set();

  const signals: string[] = [];

  if (person.primaryHeadline) {
    signals.push(person.primaryHeadline);
  }

  if (person.summary) {
    signals.push(person.summary);
  }

  evidence.forEach((item) => {
    if (item.evidenceType === "profile_field") {
      const metadata = readMetadataRecord(item.metadata);
      const field = typeof metadata.field === "string" ? metadata.field : undefined;
      if (field && RELEVANT_PROFILE_FIELDS.has(field) && item.description) {
        signals.push(item.description);
      }

      readStringArray(metadata.roleSignals).forEach((signal) => signals.push(signal));
    }

    if (item.evidenceType === "job_signal" || item.evidenceType === "experience") {
      if (item.title) {
        signals.push(item.title);
      }
      if (item.description) {
        signals.push(item.description);
      }
    }
  });

  signals
    .flatMap((signal) => splitRoleSegments(signal))
    .forEach((segment) => {
      classifyRoleSegment(segment).forEach((role) => roles.add(role));
    });

  return trimFacetRoles(roles);
}

function extractLocations(person: Person, evidence: EvidenceItem[]): string[] {
  const locations: Set<string> = new Set();

  if (person.primaryLocation) {
    addLocationValue(locations, person.primaryLocation);
  }

  // From evidence metadata (location field)
  evidence.forEach((e) => {
    const metadata = readMetadataRecord(e.metadata);
    const loc = typeof metadata.location === "string" ? metadata.location : undefined;
    if (loc) addLocationValue(locations, loc);
  });

  const locationSignals = [
    person.primaryName,
    person.primaryHeadline,
    person.summary,
    ...evidence
      .filter((item) => item.evidenceType === "profile_field")
      .flatMap((item) => [item.title, item.description])
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  extractExplicitLocationSignals(locationSignals).forEach((location) => addLocationValue(locations, location));

  return Array.from(locations);
}

const LOCATION_ALIASES: Record<string, string[]> = {
  hangzhou: ["hangzhou", "杭州"],
  杭州: ["杭州", "hangzhou"],
  beijing: ["beijing", "北京"],
  北京: ["北京", "beijing"],
  shanghai: ["shanghai", "上海"],
  上海: ["上海", "shanghai"],
  shenzhen: ["shenzhen", "深圳"],
  深圳: ["深圳", "shenzhen"],
  guangzhou: ["guangzhou", "广州"],
  广州: ["广州", "guangzhou"],
  suzhou: ["suzhou", "苏州"],
  苏州: ["苏州", "suzhou"],
  nanjing: ["nanjing", "南京"],
  南京: ["南京", "nanjing"],
  chengdu: ["chengdu", "成都"],
  成都: ["成都", "chengdu"],
  wuhan: ["wuhan", "武汉"],
  武汉: ["武汉", "wuhan"],
  singapore: ["singapore", "新加坡"],
  新加坡: ["新加坡", "singapore"],
  tokyo: ["tokyo", "东京"],
  东京: ["东京", "tokyo"],
  "new york": ["new york", "纽约"],
  纽约: ["纽约", "new york"],
  china: ["china", "中国"],
  中国: ["中国", "china"],
  remote: ["remote", "远程"],
  远程: ["远程", "remote"]
};

const KNOWN_LOCATION_PATTERN = Object.keys(LOCATION_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const EXPLICIT_LOCATION_CONTEXTS = [
  new RegExp(
    `(?:base|based\\s+in|location|located\\s+in|坐标|人在|常驻|base地|所在地|位置)\\s*[:：|｜-]?\\s*([^\\n。；;]{0,60})`,
    "giu"
  ),
  new RegExp(`(?:${KNOWN_LOCATION_PATTERN})\\s*(?:可线下|线下|local|onsite)`, "giu"),
  new RegExp(`常驻\\s*(${KNOWN_LOCATION_PATTERN})`, "giu")
];

function addLocationValue(locations: Set<string>, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return;
  }

  locations.add(normalized);

  const parts = value
    .split(/[\/／|｜,，、&和;；\s]+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const shortName = part.replace(/(省|市|区|县|自治区|特别行政区)$/u, "").toLowerCase();
    locations.add(part.toLowerCase());
    if (shortName && shortName !== part.toLowerCase()) {
      locations.add(shortName);
    }

    for (const alias of LOCATION_ALIASES[shortName] ?? LOCATION_ALIASES[part.toLowerCase()] ?? []) {
      locations.add(alias.toLowerCase());
    }
  }
}

function extractKnownLocations(value: string): string[] {
  return [...value.matchAll(new RegExp(KNOWN_LOCATION_PATTERN, "giu"))]
    .map((match) => match[0])
    .filter(Boolean);
}

function extractExplicitLocationSignals(value: string): string[] {
  const locations = new Set<string>();

  for (const pattern of EXPLICIT_LOCATION_CONTEXTS) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const context = match[1] ?? match[0];
      extractKnownLocations(context).forEach((location) => locations.add(location));
    }
  }

  return Array.from(locations);
}

function extractSources(evidence: EvidenceItem[], sourceHints: SearchSourceHint[] = []): string[] {
  const sources: Set<string> = new Set(sourceHints.map((value) => value.source.toLowerCase()));
  evidence.forEach(e => {
    if (e.source) sources.add(e.source);
  });
  return Array.from(sources);
}

// Tech keywords for tag extraction — 100+ keywords covering AI/ML, engineering, infra, and Chinese equivalents
const TECH_KEYWORDS = [
  // Languages
  "python", "javascript", "typescript", "rust", "go", "golang", "java", "kotlin", "swift",
  "c++", "cpp", "c#", "ruby", "php", "scala", "julia", "lua", "zig", "haskell",
  // AI/ML core
  "ai", "人工智能", "machine learning", "机器学习", "deep learning", "深度学习",
  "algorithm", "算法",
  "nlp", "自然语言处理", "natural language processing",
  "rag", "检索增强", "retrieval augmented", "vector search", "向量检索", "向量数据库", "vector database",
  "llm", "大模型", "大语言模型", "large language model",
  "gpt", "transformer", "attention", "diffusion",
  "fine-tuning", "微调", "sft", "rlhf", "rl", "rlvr", "强化学习", "reinforcement learning",
  "agent", "智能体", "agentic", "agent infra",
  "multimodal", "多模态", "multi-modal",
  "computer vision", "计算机视觉", "cv",
  "speech", "语音", "audio", "音频", "tts", "asr",
  "embedding", "嵌入", "tokenizer", "分词",
  "prompt engineering", "提示工程", "prompt",
  "inference", "推理", "quantization", "量化", "pruning", "剪枝",
  "mlops", "eval", "evaluation", "benchmark", "可观测性", "observability",
  // Frameworks & Libraries
  "pytorch", "tensorflow", "jax", "keras", "paddlepaddle", "paddle",
  "langchain", "llamaindex", "llama index", "llamaindex",
  "vllm", "ollama", "openai", "anthropic", "claude",
  "huggingface", "transformers", "accelerate",
  "triton", "cuda", "cudnn", "nccl",
  "mlflow", "wandb", "tensorboard",
  "dify", "coze", "autogen", "crewai", "metagpt",
  "openclaw",
  // Web & Frontend
  "react", "vue", "angular", "svelte", "next.js", "nextjs", "nuxt", "remix",
  "tailwind", "css", "html", "webgl", "three.js",
  // Backend & Infra
  "node", "deno", "bun", "django", "flask", "fastapi", "express", "nestjs", "spring",
  "docker", "kubernetes", "k8s", "devops", "ci/cd",
  "aws", "gcp", "azure", "cloud", "serverless",
  "postgres", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
  "graphql", "grpc", "rest", "api",
  // Robotics & Hardware
  "ros", "机器人", "robotics", "ros2",
  // Blockchain
  "web3", "blockchain", "区块链", "solidity",
  // Data
  "spark", "flink", "kafka", "airflow", "dbt", "data pipeline", "数据工程",
  "analytics", "数据分析",
  // Other
  "open source", "开源", "fullstack", "全栈", "frontend", "前端", "backend", "后端",
  "mobile", "移动端", "ios", "android", "flutter", "react native",
  "security", "安全", "privacy", "隐私",
  "startup", "创业", "founder", "创始人"
];

const BOUNDARY_SENSITIVE_TECH_KEYWORDS = new Set([
  "ai",
  "go",
  "java",
  "lua",
  "cv",
  "rl",
  "sft",
  "ios",
  "api",
  "aws",
  "gcp",
  "c#",
  "c++"
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMatchesTechKeyword(text: string, keyword: string) {
  const normalizedKeyword = keyword.toLowerCase();
  if (!normalizedKeyword) {
    return false;
  }

  if (/[\u3400-\u9fff]/u.test(normalizedKeyword) || normalizedKeyword.includes(" ") || normalizedKeyword.includes("-")) {
    return text.includes(normalizedKeyword);
  }

  if (BOUNDARY_SENSITIVE_TECH_KEYWORDS.has(normalizedKeyword) || normalizedKeyword.length <= 3) {
    return new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(normalizedKeyword)}([^a-z0-9+#]|$)`, "i").test(text);
  }

  return text.includes(normalizedKeyword);
}

function extractTags(person: Person, evidence: EvidenceItem[], sourceHints: SearchSourceHint[] = []): string[] {
  const tags: Set<string> = new Set();
  const directionProfile = buildCandidateDirectionProfile(person, evidence);

  const allText = [
    person.primaryName,
    person.primaryHeadline,
    person.summary,
    ...evidence.map(e => `${e.title ?? ""} ${e.description ?? ""}`)
  ].join(" ").toLowerCase();

  TECH_KEYWORDS.forEach(kw => {
    if (textMatchesTechKeyword(allText, kw)) tags.add(kw);
  });

  // Also extract tech tags from profile_field metadata.skill and metadata.roleSignals
  // This catches skills that appear in structured fields but might not match TECH_KEYWORDS exactly
  for (const item of evidence) {
    if (item.evidenceType !== "profile_field") continue;
    const metadata = readMetadataRecord(item.metadata);
    const field = typeof metadata.field === "string" ? metadata.field : undefined;
    if (field === "skill" || field === "current_doing") {
      // Extract individual skill tokens from description
      const desc = item.description ?? "";
      const tokens = desc.split(/[,，、;；|｜\/／\n]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
      for (const token of tokens) {
        // Check if token matches any tech keyword
        for (const kw of TECH_KEYWORDS) {
          if (textMatchesTechKeyword(token, kw)) {
            tags.add(kw);
          }
        }
      }
    }
    // Extract role signals as potential tags
    const roleSignals = readStringArray(metadata.roleSignals);
    for (const signal of roleSignals) {
      const lower = signal.toLowerCase();
      for (const kw of TECH_KEYWORDS) {
        if (textMatchesTechKeyword(lower, kw)) {
          tags.add(kw);
        }
      }
    }
  }

  // From repository language
  evidence
    .filter(e => e.evidenceType === "repository")
    .forEach(e => {
      const metadata = readMetadataRecord(e.metadata);
      const lang = typeof metadata.language === "string" ? metadata.language : undefined;
      if (lang) tags.add(lang.toLowerCase());
    });

  if (allText.includes("ragflow")) {
    tags.add("rag");
  }

  if (isKnownZjuAlumniSeed(sourceHints)) {
    tags.add(ZJU_MANUAL_SEED_TAG);
  }

  for (const directionTag of toDirectionFacetTags(directionProfile.directionTags)) {
    tags.add(directionTag);
  }

  return Array.from(tags);
}

const LEADERSHIP_TITLE_PATTERN = /(founder|co-founder|ceo|cto|vp|director|总监|创始人|联合创始人|技术负责人|技术总监)/i;

const RESEARCH_SIGNAL_TERMS = [
  "research", "researcher", "paper", "publication", "论文", "发表",
  "cvpr", "neurips", "iclr", "icml", "acl", "emnlp", "aaai", "ijcai", "kdd", "sigir",
  "arxiv", "google scholar", "研究", "科研", "postdoc", "博士后", "professor", "教授"
];

function extractStrongRoles(evidence: EvidenceItem[]): string[] {
  const roles = new Set<string>();
  for (const item of evidence) {
    if (item.evidenceType !== "experience" && item.evidenceType !== "job_signal") continue;
    if (!item.title) continue;
    for (const segment of splitRoleSegments(item.title)) {
      for (const role of classifyRoleSegment(segment)) {
        roles.add(role);
      }
    }
  }
  return Array.from(roles);
}

function extractStrongSkills(evidence: EvidenceItem[]): string[] {
  const skills = new Set<string>();
  for (const item of evidence) {
    if (item.evidenceType !== "project" && item.evidenceType !== "repository") continue;
    const text = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
    for (const kw of TECH_KEYWORDS) {
      if (textMatchesTechKeyword(text, kw)) {
        skills.add(kw);
      }
    }
    if (item.evidenceType === "repository") {
      const metadata = readMetadataRecord(item.metadata);
      const lang = typeof metadata.language === "string" ? metadata.language : undefined;
      if (lang) skills.add(lang.toLowerCase());
    }
  }
  return Array.from(skills);
}

function countLeadershipEvidence(evidence: EvidenceItem[]): number {
  let count = 0;
  for (const item of evidence) {
    if (item.evidenceType !== "experience" && item.evidenceType !== "job_signal") continue;
    if (item.title && LEADERSHIP_TITLE_PATTERN.test(item.title)) {
      count++;
    }
  }
  return count;
}

function detectResearchSignal(person: Person, evidence: EvidenceItem[]): boolean {
  const parts: string[] = [];
  if (person.primaryHeadline) parts.push(person.primaryHeadline);
  if (person.summary) parts.push(person.summary);
  for (const item of evidence) {
    if (item.title) parts.push(item.title);
    if (item.description) parts.push(item.description);
  }
  const combined = parts.join(" ").toLowerCase();
  return RESEARCH_SIGNAL_TERMS.some(term => combined.includes(term));
}

function computeRankFeatures(person: Person, evidence: EvidenceItem[]): RankFeatures {
  const now = Date.now();
  const updatedAt = person.updatedAt ? new Date(person.updatedAt).getTime() : now;
  const freshness = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));

  return {
    evidenceCount: evidence.length,
    projectCount: evidence.filter(e => e.evidenceType === "project").length,
    repoCount: evidence.filter(e => e.evidenceType === "repository").length,
    followerCount: 0,
    freshness,
    strongRoles: extractStrongRoles(evidence),
    strongSkills: extractStrongSkills(evidence),
    leadershipEvidenceCount: countLeadershipEvidence(evidence),
    hasResearchSignal: detectResearchSignal(person, evidence)
  };
}

export async function buildAllSearchDocuments(
  persons: Person[],
  evidenceByPerson: Map<string, EvidenceItem[]>,
  sourceHintsByPerson: Map<string, SearchSourceHint[]> = new Map()
): Promise<NewSearchDocument[]> {
  return persons.map(person => {
    const evidence = evidenceByPerson.get(person.id) ?? [];
    const sourceHints = sourceHintsByPerson.get(person.id) ?? [];
    return buildSearchDocument({ person, evidence, sourceHints });
  });
}
