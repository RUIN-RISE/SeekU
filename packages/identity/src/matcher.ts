import type { SourceProfile } from "@seeku/db";
import type { Alias, NormalizedProfile } from "@seeku/shared";

import type { MatchResult, MatchReason, ProfileMatchInput } from "./types.js";

function isValidAlias(alias: unknown): alias is Alias {
  return (
    alias !== null &&
    typeof alias === "object" &&
    typeof (alias as Record<string, unknown>).type === "string" &&
    typeof (alias as Record<string, unknown>).value === "string" &&
    typeof (alias as Record<string, unknown>).confidence === "number"
  );
}

function isValidNormalizedProfile(payload: unknown): payload is NormalizedProfile {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  
  const p = payload as Record<string, unknown>;
  
  // Check required fields
  if (typeof p.source !== "string") return false;
  if (typeof p.sourceHandle !== "string") return false;
  if (typeof p.canonicalUrl !== "string") return false;
  if (!Array.isArray(p.aliases)) return false;
  
  // Validate source is valid SourceName
  const validSources = ["bonjour", "github", "web"] as const;
  if (!validSources.includes(p.source as typeof validSources[number])) return false;
  
  return true;
}

function getNormalizedProfile(profile: SourceProfile): NormalizedProfile | null {
  const payload = profile.normalizedPayload;
  
  if (isValidNormalizedProfile(payload)) {
    return payload;
  }
  
  // Fallback: try to coerce and validate
  const coerced = typeof payload === "string" ? JSON.parse(payload) : payload;
  
  if (isValidNormalizedProfile(coerced)) {
    return coerced;
  }
  
  return null;
}

function normalizeAliasValue(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.replace(/^\/+/, "").split("/")[0]?.toLowerCase() ?? value.toLowerCase();
  } catch {
    return value.replace(/^@/, "").trim().toLowerCase();
  }
}

const GITHUB_PROFILE_URL_PATTERN = /github\.com\/([A-Za-z0-9_.-]+)(?:\/)?(?=$|[?#"'`\s,)}\]]|\\)/gi;

function extractGithubHandlesFromPayloadText(profile: SourceProfile): string[] {
  const handles = new Set<string>();
  const texts = [profile.normalizedPayload, profile.rawPayload]
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value ?? {})));

  for (const text of texts) {
    for (const match of text.matchAll(GITHUB_PROFILE_URL_PATTERN)) {
      const handle = normalizeAliasValue(match[1] ?? "");
      if (handle) {
        handles.add(handle);
      }
    }
  }

  return [...handles];
}

function findAliases(profile: SourceProfile, aliasType: Alias["type"]): Alias[] {
  const normalized = getNormalizedProfile(profile);
  if (!normalized) return [];
  return (normalized.aliases ?? []).filter((alias) => alias.type === aliasType);
}

export function findExplicitLinks(profile: SourceProfile) {
  const normalized = getNormalizedProfile(profile);
  const githubHandles = new Set<string>();
  const bonjourHandles = new Set<string>();

  if (!normalized) {
    return {
      githubHandles: [...githubHandles],
      bonjourHandles: [...bonjourHandles],
      confidence: 0
    };
  }

  for (const alias of normalized.aliases ?? []) {
    if (alias.type === "github") {
      githubHandles.add(normalizeAliasValue(alias.value));
    }

    if (alias.type === "website" && alias.value.includes("bonjour.bio/")) {
      bonjourHandles.add(normalizeAliasValue(alias.value));
    }
  }

  if (profile.source === "bonjour") {
    for (const handle of extractGithubHandlesFromPayloadText(profile)) {
      githubHandles.add(handle);
    }
  }

  return {
    githubHandles: [...githubHandles],
    bonjourHandles: [...bonjourHandles],
    confidence: githubHandles.size > 0 || bonjourHandles.size > 0 ? 1 : 0
  };
}

export function compareNames(name1: string | null, name2: string | null) {
  if (!name1 || !name2) {
    return 0;
  }

  const normalizedLeft = name1.toLowerCase().trim();
  const normalizedRight = name2.toLowerCase().trim();

  if (normalizedLeft === normalizedRight) {
    return 0.5;
  }

  if (normalizedLeft.replace(/\s+/g, "") === normalizedRight.replace(/\s+/g, "")) {
    return 0.4;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.25;
  }

  return 0;
}

export function compareLocations(location1: string | null, location2: string | null) {
  if (!location1 || !location2) {
    return 0;
  }

  const left = location1.toLowerCase().trim();
  const right = location2.toLowerCase().trim();

  if (left === right) {
    return 0.3;
  }

  const leftTokens = left.split(/\s*[,/]\s*|\s+/).filter(Boolean);
  const rightTokens = right.split(/\s*[,/]\s*|\s+/).filter(Boolean);
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;

  if (overlap >= 2) {
    return 0.2;
  }

  if (overlap === 1) {
    return 0.1;
  }

  return 0;
}

export function compareCompanySignals(profile1: SourceProfile, profile2: SourceProfile) {
  const left = `${profile1.headline ?? ""} ${profile1.bio ?? ""}`.toLowerCase();
  const right = `${profile2.headline ?? ""} ${profile2.bio ?? ""}`.toLowerCase();

  const leftCompanyAliases = findAliases(profile1, "other").map((alias) => alias.value.toLowerCase());
  const rightCompanyAliases = findAliases(profile2, "other").map((alias) => alias.value.toLowerCase());

  const sharedAlias = leftCompanyAliases.find((alias) => right.includes(alias));
  if (sharedAlias) {
    return 0.2;
  }

  const reverseSharedAlias = rightCompanyAliases.find((alias) => left.includes(alias));
  if (reverseSharedAlias) {
    return 0.2;
  }

  const keywords = ["founder", "engineer", "developer", "designer", "product"];
  const sharedKeyword = keywords.some((keyword) => left.includes(keyword) && right.includes(keyword));
  return sharedKeyword ? 0.1 : 0;
}

export function computeMatchScore(profile1: SourceProfile, profile2: SourceProfile): MatchResult {
  const reasons: MatchReason[] = [];

  if (profile1.source === "bonjour" && profile2.source === "github") {
    const explicit = findExplicitLinks(profile1);
    if (explicit.githubHandles.includes(profile2.sourceHandle.toLowerCase())) {
      return {
        confidence: 1,
        reasons: [{ signal: "explicit_github_link", confidence: 1 }]
      };
    }
  }

  if (profile1.source === "github" && profile2.source === "bonjour") {
    const explicit = findExplicitLinks(profile1);
    if (explicit.bonjourHandles.includes(profile2.sourceHandle.toLowerCase())) {
      return {
        confidence: 1,
        reasons: [{ signal: "explicit_bonjour_link", confidence: 1 }]
      };
    }
  }

  const nameScore = compareNames(profile1.displayName, profile2.displayName);
  if (nameScore > 0) {
    reasons.push({ signal: "name_match", confidence: nameScore });
  }

  const locationScore = compareLocations(profile1.locationText, profile2.locationText);
  if (locationScore > 0) {
    reasons.push({ signal: "location_match", confidence: locationScore });
  }

  const companyScore = compareCompanySignals(profile1, profile2);
  if (companyScore > 0) {
    reasons.push({ signal: "company_signal", confidence: companyScore });
  }

  return {
    confidence: Math.min(1, reasons.reduce((sum, reason) => sum + reason.confidence, 0)),
    reasons
  };
}

export function matchProfiles(input: ProfileMatchInput) {
  return input.candidateProfiles.map((candidate) => {
    if (candidate.source === input.sourceProfile.source) {
      return {
        confidence: 0,
        reasons: [{ signal: "same_source", confidence: 0 }]
      };
    }

    return computeMatchScore(input.sourceProfile, candidate);
  });
}

export function findBestMatch(sourceProfile: SourceProfile, candidates: SourceProfile[]) {
  const results = matchProfiles({
    sourceProfile,
    candidateProfiles: candidates
  });

  let bestIndex = -1;
  let bestConfidence = 0;

  for (let index = 0; index < results.length; index += 1) {
    if (results[index].confidence > bestConfidence) {
      bestIndex = index;
      bestConfidence = results[index].confidence;
    }
  }

  return {
    bestMatch: bestIndex >= 0 ? candidates[bestIndex] : null,
    result: bestIndex >= 0 ? results[bestIndex] : { confidence: 0, reasons: [] }
  };
}
