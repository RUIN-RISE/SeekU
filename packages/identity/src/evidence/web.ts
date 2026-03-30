import { createHash } from "node:crypto";
import type { EvidenceType } from "@seeku/db";
import type { EvidenceExtractionResult, EvidenceItemInput } from "../types.js";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function extractWebEvidence(profile: any): EvidenceExtractionResult {
  const items: EvidenceItemInput[] = [];

  if (profile.bio || profile.headline) {
    items.push({
      source: "web" as any,
      sourceProfileId: profile.sourceProfileId || profile.sourceHandle,
      evidenceType: "summary" as EvidenceType,
      title: profile.headline || "Personal Website Summary",
      description: profile.bio,
      url: profile.canonicalUrl,
      metadata: {},
      evidenceHash: hash(`web:summary:${profile.sourceHandle}:${profile.canonicalUrl}`)
    });
  }

  return {
    items,
    errors: []
  };
}
