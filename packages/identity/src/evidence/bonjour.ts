import { createHash } from "node:crypto";

import type { BonjourCommunityPost, BonjourProfile } from "@seeku/adapters";
import type { EvidenceType } from "@seeku/db";

import type { EvidenceExtractionResult, EvidenceItemInput } from "../types.js";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function extractBonjourProjects(profile: BonjourProfile): EvidenceItemInput[] {
  return (profile.creations ?? [])
    .filter((creation) => creation.url || creation.title)
    .map((creation) => ({
      source: "bonjour" as const,
      sourceProfileId: profile._id,
      evidenceType: "project" as EvidenceType,
      title: creation.title?.trim() || undefined,
      description: creation.description?.trim() || undefined,
      url: creation.url?.trim() || undefined,
      metadata: {
        imageUrl: creation.image
      },
      evidenceHash: hash(`bonjour:project:${profile._id}:${creation.url || creation.title}`)
    }));
}

export function extractBonjourSocials(profile: BonjourProfile): EvidenceItemInput[] {
  return (profile.socials ?? [])
    .filter((social) => social.content?.trim())
    .map((social) => ({
      source: "bonjour" as const,
      sourceProfileId: profile._id,
      evidenceType: "social" as EvidenceType,
      title: social.type,
      description: social.content.trim(),
      url: social.content.startsWith("http") ? social.content.trim() : undefined,
      metadata: {
        socialType: social.type.toLowerCase()
      },
      evidenceHash: hash(`bonjour:social:${profile._id}:${social.type}:${social.content}`)
    }));
}

export function extractBonjourJobSignals(
  posts: BonjourCommunityPost[],
  profileId: string
): EvidenceItemInput[] {
  const signalKeys = [
    "open-to-work",
    "open_to_work",
    "open to work",
    "we-are-hiring",
    "we_are_hiring",
    "we are hiring"
  ];

  return posts.flatMap((post) => {
    const haystacks = [
      post.type?.toLowerCase() ?? "",
      post.content?.toLowerCase() ?? "",
      ...(post.category?.map((category) => category.key.toLowerCase()) ?? [])
    ];

    const matched = signalKeys.find((signal) => haystacks.some((value) => value.includes(signal)));
    if (!matched) {
      return [];
    }

    return [
      {
        source: "bonjour" as const,
        sourceProfileId: profileId,
        evidenceType: "job_signal" as EvidenceType,
        title: post.type ?? "Job Signal",
        description: post.content?.trim() || undefined,
        url: post.link,
        occurredAt: post.create_time ? new Date(post.create_time) : undefined,
        metadata: {
          postId: post._id,
          categories: post.category?.map((category) => category.key) ?? [],
          signalType: matched.includes("hiring") ? "hiring" : "open_to_work"
        },
        evidenceHash: hash(`bonjour:job_signal:${profileId}:${post._id}`)
      }
    ];
  });
}

export function extractBonjourProfileFields(profile: BonjourProfile): EvidenceItemInput[] {
  const fields: Array<{ title: string; value?: string }> = [
    {
      title: "Current Doing",
      value: profile.basicInfo?.current_doing
    },
    {
      title: "Role",
      value: profile.basicInfo?.role
    },
    {
      title: "Skill",
      value: profile.basicInfo?.skill
    }
  ];

  return fields
    .filter((field) => field.value?.trim())
    .map((field) => ({
      source: "bonjour" as const,
      sourceProfileId: profile._id,
      evidenceType: "profile_field" as EvidenceType,
      title: field.title,
      description: field.value?.trim(),
      metadata: {
        field: field.title.toLowerCase().replace(/\s+/g, "_")
      },
      evidenceHash: hash(`bonjour:profile_field:${profile._id}:${field.title}:${field.value}`)
    }));
}

export function extractAllBonjourEvidence(
  profile: BonjourProfile,
  communityPosts: BonjourCommunityPost[] = []
): EvidenceExtractionResult {
  const items: EvidenceItemInput[] = [];
  const errors: Array<{ message: string; context?: unknown }> = [];

  try {
    items.push(...extractBonjourProjects(profile));
  } catch (error) {
    errors.push({ message: "Failed to extract Bonjour projects", context: error });
  }

  try {
    items.push(...extractBonjourSocials(profile));
  } catch (error) {
    errors.push({ message: "Failed to extract Bonjour socials", context: error });
  }

  try {
    items.push(...extractBonjourProfileFields(profile));
  } catch (error) {
    errors.push({ message: "Failed to extract Bonjour profile fields", context: error });
  }

  if (communityPosts.length > 0) {
    try {
      items.push(...extractBonjourJobSignals(communityPosts, profile._id));
    } catch (error) {
      errors.push({ message: "Failed to extract Bonjour job signals", context: error });
    }
  }

  return {
    items,
    errors
  };
}
