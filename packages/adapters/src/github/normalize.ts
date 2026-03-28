import { createHash } from "node:crypto";

import { NormalizedProfileSchema, type Alias, type NormalizedProfile } from "@seeku/shared";

import type { GithubProfile } from "./client.js";

function trimToUndefined(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compact<T>(values: Array<T | null | undefined | false>) {
  return values.filter(Boolean) as T[];
}

function extractAliases(profile: GithubProfile): Alias[] {
  return compact<Alias>([
    trimToUndefined(profile.twitter_username)
      ? {
          type: "x",
          value: trimToUndefined(profile.twitter_username)!,
          confidence: 1
        }
      : null,
    trimToUndefined(profile.blog)
      ? {
          type: "website",
          value: trimToUndefined(profile.blog)!,
          confidence: 1
        }
      : null,
    trimToUndefined(profile.company)
      ? {
          type: "other",
          value: trimToUndefined(profile.company)!,
          confidence: 0.6
        }
      : null
  ]);
}

export function computeGithubProfileHash(profile: GithubProfile) {
  const hashInput = JSON.stringify({
    login: profile.login,
    name: profile.name,
    bio: profile.bio,
    location: profile.location,
    company: profile.company,
    blog: profile.blog,
    twitterUsername: profile.twitter_username,
    publicRepos: profile.public_repos,
    updatedAt: profile.updated_at
  });

  return createHash("sha256").update(hashInput).digest("hex");
}

export function normalizeGithubProfile(profile: GithubProfile): NormalizedProfile {
  const normalized: NormalizedProfile = {
    source: "github",
    sourceProfileId: String(profile.id),
    sourceHandle: profile.login,
    canonicalUrl: profile.html_url,
    displayName: trimToUndefined(profile.name),
    headline: trimToUndefined(profile.bio),
    bio: trimToUndefined(profile.bio),
    summary: compact([
      trimToUndefined(profile.bio),
      trimToUndefined(profile.company),
      trimToUndefined(profile.location)
    ]).join("\n\n") || undefined,
    avatarUrl: trimToUndefined(profile.avatar_url),
    locationText: trimToUndefined(profile.location),
    aliases: extractAliases(profile),
    rawMetadata: {
      publicRepos: profile.public_repos,
      followers: profile.followers,
      following: profile.following,
      company: profile.company,
      blog: profile.blog,
      twitterUsername: profile.twitter_username,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    }
  };

  return NormalizedProfileSchema.parse(normalized);
}
