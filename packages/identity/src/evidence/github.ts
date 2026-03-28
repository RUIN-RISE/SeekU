import { createHash } from "node:crypto";

import type { GithubProfile, GithubRepository } from "@seeku/adapters";
import type { EvidenceType } from "@seeku/db";

import type { EvidenceExtractionResult, EvidenceItemInput } from "../types.js";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function extractGithubRepositories(
  profile: GithubProfile,
  repositories: GithubRepository[]
): EvidenceItemInput[] {
  return repositories
    .filter((repository) => repository.owner.login.toLowerCase() === profile.login.toLowerCase())
    .map((repository) => ({
      source: "github" as const,
      sourceProfileId: String(profile.id),
      evidenceType: "repository" as EvidenceType,
      title: repository.name,
      description: repository.description?.trim() || undefined,
      url: repository.html_url,
      metadata: {
        fullName: repository.full_name,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        language: repository.language,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at
      },
      evidenceHash: hash(`github:repository:${profile.id}:${repository.id}`)
    }));
}

export function extractGithubProfileEvidence(profile: GithubProfile): EvidenceItemInput[] {
  const items: EvidenceItemInput[] = [];

  if (profile.company?.trim()) {
    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "profile_field" as EvidenceType,
      title: "Company",
      description: profile.company.trim(),
      metadata: { field: "company" },
      evidenceHash: hash(`github:profile_field:${profile.id}:company:${profile.company}`)
    });
  }

  if (profile.location?.trim()) {
    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "profile_field" as EvidenceType,
      title: "Location",
      description: profile.location.trim(),
      metadata: { field: "location" },
      evidenceHash: hash(`github:profile_field:${profile.id}:location:${profile.location}`)
    });
  }

  if (profile.bio?.trim()) {
    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "profile_field" as EvidenceType,
      title: "Bio",
      description: profile.bio.trim(),
      metadata: { field: "bio" },
      evidenceHash: hash(`github:profile_field:${profile.id}:bio:${profile.bio}`)
    });
  }

  if (profile.blog?.trim()) {
    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "social" as EvidenceType,
      title: "Website",
      description: profile.blog.trim(),
      url: profile.blog.trim(),
      metadata: { field: "blog" },
      evidenceHash: hash(`github:social:${profile.id}:blog:${profile.blog}`)
    });
  }

  return items;
}

export function extractAllGithubEvidence(
  profile: GithubProfile,
  repositories: GithubRepository[] = []
): EvidenceExtractionResult {
  const items: EvidenceItemInput[] = [];
  const errors: Array<{ message: string; context?: unknown }> = [];

  try {
    items.push(...extractGithubRepositories(profile, repositories));
  } catch (error) {
    errors.push({ message: "Failed to extract GitHub repositories", context: error });
  }

  try {
    items.push(...extractGithubProfileEvidence(profile));
  } catch (error) {
    errors.push({ message: "Failed to extract GitHub profile evidence", context: error });
  }

  return {
    items,
    errors
  };
}
