import { createHash } from "node:crypto";

import type { BonjourCommunityPost, BonjourProfile } from "@seeku/adapters";
import type { EvidenceType } from "@seeku/db";

import type { EvidenceExtractionResult, EvidenceItemInput } from "../types.js";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const ROLE_SIGNAL_PATTERN =
  /(co[- ]?founder|founder|联合创始人|创始人|合伙人|partner|investor|\bvc\b|投资|产品经理|product manager|\bpm\b|backend|frontend|full[- ]?stack|后端|前端|全栈|engineer|工程师|developer|开发者|开发|researcher|研究|研究员|designer|设计|运营|operations?|sales|销售|consultant|顾问|讲师|teacher|student|学生|creator|创作者|aigcer|agent|rag|llm|ai\b|智能体|infra|增长)/i;

function extractRoleSignals(value: string | undefined): string[] {
  const normalized = value?.trim();
  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .replace(/\r?\n+/g, "\n")
        .replace(/[|｜;；]+/g, "\n")
        .replace(/[，,、]+/g, "\n")
        .replace(/\s*[\/／]\s*/g, "\n")
        .split("\n")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0 && Array.from(segment).length <= 40)
        .filter((segment) => ROLE_SIGNAL_PATTERN.test(segment))
    )
  );
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
    .map((field) => {
      const roleSignals = extractRoleSignals(field.value);

      return {
        source: "bonjour" as const,
        sourceProfileId: profile._id,
        evidenceType: "profile_field" as EvidenceType,
        title: field.title,
        description: field.value?.trim(),
        metadata: {
          field: field.title.toLowerCase().replace(/\s+/g, "_"),
          ...(roleSignals.length > 0 ? { roleSignals } : {})
        },
        evidenceHash: hash(`bonjour:profile_field:${profile._id}:${field.title}:${field.value}`)
      };
    });
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
