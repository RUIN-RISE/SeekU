import type { Person, PersonIdentity, SeekuDatabase, SourceProfile } from "@seeku/db";
import {
  coerceJsonObject,
  createPerson,
  createPersonIdentity,
  ensurePersonAliasesFromProfile,
  getPersonById,
  updatePerson,
  updatePersonConfidence
} from "@seeku/db";
import type { NormalizedProfile } from "@seeku/shared";

import type { MatchResult } from "./types.js";

export const AUTO_MERGE_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.7;
const MAX_HEADLINE_LENGTH = 60;

function getNormalizedProfile(profile: SourceProfile) {
  return coerceJsonObject(profile.normalizedPayload) as unknown as NormalizedProfile;
}

function clampHeadline(value: string | undefined) {
  const normalized = value
    ?.split(/\r?\n/)[0]
    ?.replace(/\s+/g, " ")
    ?.trim();

  if (!normalized) {
    return undefined;
  }

  const chars = Array.from(normalized);
  if (chars.length <= MAX_HEADLINE_LENGTH) {
    return normalized;
  }

  return `${chars.slice(0, MAX_HEADLINE_LENGTH - 3).join("")}...`;
}

function deriveHeadlineFromProfile(profile: SourceProfile) {
  const normalized = getNormalizedProfile(profile);
  const rawMetadata = coerceJsonObject(normalized.rawMetadata);
  const basicInfo = coerceJsonObject(rawMetadata.basicInfo);

  const role = typeof basicInfo.role === "string" ? basicInfo.role : undefined;
  const currentDoing =
    typeof basicInfo.current_doing === "string" ? basicInfo.current_doing : undefined;

  return (
    clampHeadline(role) ||
    clampHeadline(currentDoing) ||
    clampHeadline(profile.headline || normalized.headline || profile.bio || normalized.bio) ||
    clampHeadline(normalized.summary)
  );
}

export function resolveConflict(preferred?: string | null, fallback?: string | null) {
  const preferredValue = preferred?.trim();
  if (preferredValue) {
    return preferredValue;
  }

  const fallbackValue = fallback?.trim();
  return fallbackValue || undefined;
}

export function selectPrimaryName(profiles: SourceProfile[]) {
  const bonjour = profiles.find((profile) => profile.source === "bonjour" && profile.displayName?.trim());
  if (bonjour?.displayName) {
    return bonjour.displayName.trim();
  }

  const named = profiles.find((profile) => profile.displayName?.trim());
  return named?.displayName?.trim() ?? profiles[0]?.sourceHandle ?? "Unknown";
}

export function selectPrimaryHeadline(profiles: SourceProfile[]) {
  const bonjour = profiles.find((profile) => profile.source === "bonjour");
  const bonjourHeadline = bonjour ? deriveHeadlineFromProfile(bonjour) : undefined;
  if (bonjourHeadline) {
    return bonjourHeadline;
  }

  for (const profile of profiles) {
    const headline = deriveHeadlineFromProfile(profile);
    if (headline) {
      return headline;
    }
  }

  return undefined;
}

export function buildMergedSummary(profiles: SourceProfile[]) {
  const summaries = profiles.flatMap((profile) => {
    const normalized = getNormalizedProfile(profile);
    return [normalized.summary, normalized.bio]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => `[${profile.source}] ${value.trim()}`);
  });

  return summaries.length > 0 ? [...new Set(summaries)].join("\n\n") : undefined;
}

export function selectPrimaryLocation(profiles: SourceProfile[]) {
  return profiles
    .map((profile) => profile.locationText?.trim())
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.split("/").length - left.split("/").length)[0];
}

function selectAvatarUrl(profiles: SourceProfile[]) {
  const bonjour = profiles.find((profile) => profile.source === "bonjour" && profile.avatarUrl?.trim());
  if (bonjour?.avatarUrl) {
    return bonjour.avatarUrl.trim();
  }

  return profiles.find((profile) => profile.avatarUrl?.trim())?.avatarUrl?.trim() ?? undefined;
}

function deriveConfidence(profiles: SourceProfile[], matchResults: Map<string, MatchResult>) {
  if (profiles.length <= 1) {
    return 0.5;
  }

  const values = profiles
    .map((profile) => matchResults.get(profile.id)?.confidence ?? 0)
    .filter((value) => value > 0);

  if (values.length === 0) {
    return 0.5;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function mergeProfilesIntoPerson(
  db: SeekuDatabase,
  profiles: SourceProfile[],
  matchResults: Map<string, MatchResult>
): Promise<{ person: Person; identities: PersonIdentity[] }> {
  const person = await createPerson(db, {
    primaryName: selectPrimaryName(profiles),
    primaryHeadline: selectPrimaryHeadline(profiles),
    summary: buildMergedSummary(profiles),
    primaryLocation: selectPrimaryLocation(profiles),
    avatarUrl: selectAvatarUrl(profiles),
    confidenceScore: deriveConfidence(profiles, matchResults)
  });

  const identities: PersonIdentity[] = [];

  for (const profile of profiles) {
    const match = matchResults.get(profile.id);
    const identity = await createPersonIdentity(db, {
      personId: person.id,
      sourceProfileId: profile.id,
      matchScore: match?.confidence ?? 0.5,
      matchReason: match?.reasons ?? [{ signal: "single_source_profile", confidence: 0.5 }],
      isPrimary: profile.source === "bonjour"
    });

    identities.push(identity);
    await ensurePersonAliasesFromProfile(db, person.id, profile);
  }

  return {
    person,
    identities
  };
}

export async function attachProfilesToPerson(
  db: SeekuDatabase,
  personId: string,
  profiles: SourceProfile[],
  matchResults: Map<string, MatchResult>
) {
  const existingPerson = await getPersonById(db, personId);
  if (!existingPerson) {
    throw new Error(`Person ${personId} not found`);
  }

  const existingConfidence = Number(existingPerson.confidenceScore);

  for (const profile of profiles) {
    const match = matchResults.get(profile.id);
    await createPersonIdentity(db, {
      personId,
      sourceProfileId: profile.id,
      matchScore: match?.confidence ?? existingConfidence,
      matchReason: match?.reasons ?? [{ signal: "existing_person_attach", confidence: 0.5 }],
      isPrimary: profile.source === "bonjour"
    });

    await ensurePersonAliasesFromProfile(db, personId, profile);
  }

  const mergedProfiles = profiles;
  const mergedHeadline = selectPrimaryHeadline(mergedProfiles);
  const updated = await updatePerson(db, personId, {
    primaryName: resolveConflict(selectPrimaryName(mergedProfiles), existingPerson.primaryName),
    primaryHeadline: resolveConflict(mergedHeadline, existingPerson.primaryHeadline),
    summary: resolveConflict(buildMergedSummary(mergedProfiles), existingPerson.summary),
    primaryLocation: resolveConflict(
      selectPrimaryLocation(mergedProfiles),
      existingPerson.primaryLocation
    ),
    avatarUrl: resolveConflict(selectAvatarUrl(mergedProfiles), existingPerson.avatarUrl),
    confidenceScore: Math.max(existingConfidence, deriveConfidence(profiles, matchResults))
  });

  if (!updated) {
    await updatePersonConfidence(
      db,
      personId,
      Math.max(existingConfidence, deriveConfidence(profiles, matchResults))
    );
  }

  return getPersonById(db, personId);
}
