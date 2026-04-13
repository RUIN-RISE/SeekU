import { createHash } from "node:crypto";

import {
  NormalizedProfileSchema,
  type Alias,
  type AliasType,
  type NormalizedProfile
} from "@seeku/shared";

import type { BonjourProfile } from "./client.js";

const SOCIAL_TYPE_MAP: Record<string, AliasType> = {
  github: "github",
  x: "x",
  twitter: "x",
  jike: "jike",
  website: "website"
};

function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}

function trimToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const MAX_HEADLINE_LENGTH = 60;

function firstLine(value: string | undefined) {
  return value?.split(/\r?\n/)[0];
}

function clampHeadline(value: string | undefined) {
  const normalized = trimToUndefined(firstLine(value)?.replace(/\s+/g, " "));
  if (!normalized) {
    return undefined;
  }

  const chars = Array.from(normalized);
  if (chars.length <= MAX_HEADLINE_LENGTH) {
    return normalized;
  }

  return `${chars.slice(0, MAX_HEADLINE_LENGTH - 3).join("")}...`;
}

function normalizeHandleishUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/^\/+/, "").split("/")[0];
    return path || value;
  } catch {
    return value;
  }
}

function mapSocialType(type: unknown): AliasType {
  if (typeof type !== "string") {
    return "other";
  }

  return SOCIAL_TYPE_MAP[type.toLowerCase()] ?? "other";
}

function normalizeAliasValue(type: AliasType, value: string) {
  if (type === "github" || type === "x") {
    return normalizeHandleishUrl(value);
  }

  return value.trim();
}

function buildLocationText(profile: BonjourProfile) {
  const region = profile.basicInfo?.region;

  if (!region) {
    return undefined;
  }

  return compact([region.countryName, region.provinceName, region.cityName]).join(" / ") || undefined;
}

function extractSocialLinks(text: string | null | undefined): Alias[] {
  if (!text) {
    return [];
  }

  const aliases: Alias[] = [];

  // GitHub Regex: github.com/xxx or @xxx (heuristic)
  const githubMatches = text.matchAll(/(?:github\.com\/|@)([a-zA-Z0-9-]{1,39})/gi);
  for (const match of githubMatches) {
    const handle = match[1];
    // Filter out common false positives like @浙大
    if (handle.length > 2 && !["浙大", "浙江大学", "ZJU"].includes(handle.toUpperCase())) {
      aliases.push({ type: "github", value: handle, confidence: 0.8 });
    }
  }

  // X/Twitter Regex: x.com/xxx or twitter.com/xxx
  const xMatches = text.matchAll(/(?:x\.com\/|twitter\.com\/)([a-zA-Z0-9_]{1,15})/gi);
  for (const match of xMatches) {
    aliases.push({ type: "x", value: match[1], confidence: 0.8 });
  }

  return aliases;
}

function extractAliases(profile: BonjourProfile): Alias[] {
  const aliases = new Map<string, Alias>();

  // 1. From explicit social links
  for (const social of profile.socials ?? []) {
    if (typeof social.type !== "string") {
      continue;
    }

    const rawValue = trimToUndefined(social.content);
    if (!rawValue) {
      continue;
    }

    const type = mapSocialType(social.type);
    const value = normalizeAliasValue(type, rawValue);
    const key = `${type}:${value.toLowerCase()}`;

    if (!aliases.has(key)) {
      aliases.set(key, {
        type,
        value,
        confidence: 1
      });
    }
  }

  // 2. From gridItems (Bonjour's modular UI components often contain social links)
  for (const item of profile.gridItems ?? []) {
    const social = (item.content as Record<string, unknown> | undefined)?.social;
    if (!social || typeof social !== "object" || Array.isArray(social)) {
      continue;
    }

    const socialRecord = social as Record<string, unknown>;
    const rawValue =
      typeof socialRecord.content === "string" ? trimToUndefined(socialRecord.content) : undefined;
    if (!rawValue) {
      continue;
    }

    const type = mapSocialType(socialRecord.type);
    const value = normalizeAliasValue(type, rawValue);
    const key = `${type}:${value.toLowerCase()}`;

    if (!aliases.has(key)) {
      aliases.set(key, {
        type,
        value,
        confidence: 1
      });
    }
  }

  // 3. Heuristic extraction from bio/description
  const searchText = `${profile.name || ""} ${profile.bio || ""} ${profile.description || ""}`;
  const heuristicAliases = extractSocialLinks(searchText);
  
  for (const alias of heuristicAliases) {
    const key = `${alias.type}:${alias.value.toLowerCase()}`;
    if (!aliases.has(key)) {
      aliases.set(key, alias);
    }
  }

  return [...aliases.values()];
}

function buildSummary(profile: BonjourProfile) {
  return compact([
    trimToUndefined(profile.bio),
    trimToUndefined(profile.description),
    trimToUndefined(profile.basicInfo?.current_doing),
    trimToUndefined(profile.basicInfo?.role),
    trimToUndefined(profile.basicInfo?.skill)
  ]).join("\n\n") || undefined;
}

export function buildHeadline(profile: BonjourProfile) {
  return (
    clampHeadline(profile.basicInfo?.role) ||
    clampHeadline(profile.basicInfo?.current_doing) ||
    clampHeadline(profile.bio) ||
    clampHeadline(buildSummary(profile))
  );
}

function normalizeCanonicalHandle(profile: BonjourProfile) {
  return trimToUndefined(profile.user_link)?.replace(/^\/+/, "") ?? profile.profile_link;
}

export function computeProfileHash(profile: BonjourProfile) {
  const hashInput = JSON.stringify({
    sourceProfileId: profile._id,
    profileLink: profile.profile_link,
    userLink: profile.user_link,
    name: profile.name,
    bio: profile.bio,
    description: profile.description,
    updateTime: profile.update_time,
    socials: profile.socials,
    creations: profile.creations,
    basicInfo: profile.basicInfo
  });

  return createHash("sha256").update(hashInput).digest("hex");
}

export function normalizeBonjourProfile(profile: BonjourProfile): NormalizedProfile {
  const sourceHandle = normalizeCanonicalHandle(profile);
  const normalized: NormalizedProfile = {
    source: "bonjour",
    sourceProfileId: trimToUndefined(profile._id),
    sourceHandle,
    canonicalUrl: `https://bonjour.bio/${sourceHandle}`,
    displayName: trimToUndefined(profile.name),
    headline: buildHeadline(profile),
    bio: trimToUndefined(profile.description),
    summary: buildSummary(profile),
    avatarUrl: trimToUndefined(profile.avatar),
    locationText: buildLocationText(profile),
    aliases: extractAliases(profile),
    rawMetadata: {
      profileLink: profile.profile_link,
      createTime: profile.create_time,
      updateTime: profile.update_time,
      basicInfo: profile.basicInfo ?? {},
      contacts: profile.contacts ?? [],
      socials: profile.socials ?? [],
      creations: profile.creations ?? [],
      gridItems: profile.gridItems ?? [],
      memories: profile.memories ?? {},
      inflationRequired: profile.inflationRequired ?? false
    }
  };

  return NormalizedProfileSchema.parse(normalized);
}
