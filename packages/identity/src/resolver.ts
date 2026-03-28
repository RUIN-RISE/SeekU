import {
  getIdentityBySourceProfileId,
  getPersonById,
  getSourceProfileByHandle,
  listSourceProfilesByHandles,
  type SeekuDatabase,
  type SourceProfile
} from "@seeku/db";

import { findBestMatch } from "./matcher.js";
import { AUTO_MERGE_THRESHOLD, REVIEW_THRESHOLD, attachProfilesToPerson, mergeProfilesIntoPerson } from "./merger.js";
import type { MatchResult, ResolutionInput, ResolutionResult } from "./types.js";

async function ensureSingletonPerson(
  db: SeekuDatabase,
  profile: SourceProfile,
  result: ResolutionResult
) {
  const existingIdentity = await getIdentityBySourceProfileId(db, profile.id);
  if (existingIdentity) {
    return;
  }

  const created = await mergeProfilesIntoPerson(db, [profile], new Map());
  result.personsCreated += 1;
  result.identitiesCreated += created.identities.length;
  result.unresolvedProfiles += 1;
}

export async function resolveIdentities(input: ResolutionInput): Promise<ResolutionResult> {
  const result: ResolutionResult = {
    personsCreated: 0,
    identitiesCreated: 0,
    matchedPairs: 0,
    reviewPairs: 0,
    unresolvedProfiles: 0,
    matches: [],
    errors: []
  };

  const consumedBonjour = new Set<string>();
  const consumedGithub = new Set<string>();

  for (const bonjourProfile of input.bonjourProfiles) {
    const availableGithubProfiles = input.githubProfiles.filter(
      (profile) => !consumedGithub.has(profile.id)
    );

    const { bestMatch, result: match } = findBestMatch(bonjourProfile, availableGithubProfiles);

    if (bestMatch && match.confidence >= AUTO_MERGE_THRESHOLD) {
      try {
        const bonjourIdentity = await getIdentityBySourceProfileId(input.db, bonjourProfile.id);
        const githubIdentity = await getIdentityBySourceProfileId(input.db, bestMatch.id);

        if (
          bonjourIdentity &&
          githubIdentity &&
          bonjourIdentity.personId !== githubIdentity.personId
        ) {
          result.errors.push({
            message: "Conflicting existing person identities for matched pair",
            context: {
              bonjourProfileId: bonjourProfile.id,
              githubProfileId: bestMatch.id
            }
          });
          continue;
        }

        const matchResults = new Map<string, MatchResult>([
          [bonjourProfile.id, match],
          [bestMatch.id, match]
        ]);

        let personId = bonjourIdentity?.personId ?? githubIdentity?.personId;
        let identitiesCreated = 0;

        if (personId) {
          await attachProfilesToPerson(input.db, personId, [bonjourProfile, bestMatch], matchResults);
        } else {
          const created = await mergeProfilesIntoPerson(
            input.db,
            [bonjourProfile, bestMatch],
            matchResults
          );
          personId = created.person.id;
          result.personsCreated += 1;
          identitiesCreated = created.identities.length;
        }

        result.identitiesCreated += identitiesCreated;
        result.matchedPairs += 1;
        result.matches.push({
          personId,
          bonjourProfileId: bonjourProfile.id,
          githubProfileId: bestMatch.id,
          confidence: match.confidence,
          reasons: match.reasons
        });

        consumedBonjour.add(bonjourProfile.id);
        consumedGithub.add(bestMatch.id);
      } catch (error) {
        result.errors.push({
          message: error instanceof Error ? error.message : String(error),
          context: {
            bonjourProfileId: bonjourProfile.id,
            githubProfileId: bestMatch.id
          }
        });
      }

      continue;
    }

    if (bestMatch && match.confidence >= REVIEW_THRESHOLD) {
      result.reviewPairs += 1;
    }
  }

  for (const profile of input.bonjourProfiles) {
    if (!consumedBonjour.has(profile.id)) {
      await ensureSingletonPerson(input.db, profile, result);
    }
  }

  for (const profile of input.githubProfiles) {
    if (!consumedGithub.has(profile.id)) {
      await ensureSingletonPerson(input.db, profile, result);
    }
  }

  return result;
}

export async function runIdentityResolution(
  db: SeekuDatabase,
  bonjourHandles: string[],
  githubHandles: string[]
) {
  const [bonjourProfiles, githubProfiles] = await Promise.all([
    listSourceProfilesByHandles(db, "bonjour", bonjourHandles),
    listSourceProfilesByHandles(db, "github", githubHandles)
  ]);

  return resolveIdentities({
    db,
    bonjourProfiles,
    githubProfiles
  });
}
