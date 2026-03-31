import { describe, expect, it } from "vitest";

import { findExplicitLinks } from "./matcher.js";

describe("findExplicitLinks", () => {
  it("extracts github handles from bonjour payload profile URLs", () => {
    const result = findExplicitLinks({
      source: "bonjour",
      sourceHandle: "alec",
      canonicalUrl: "https://bonjour.bio/alec",
      displayName: "Alec",
      headline: null,
      bio: null,
      locationText: null,
      avatarUrl: null,
      rawPayload: {
        socials: [
          { type: "website", content: "https://github.com/Al3cLee" }
        ]
      },
      normalizedPayload: {
        source: "bonjour",
        sourceHandle: "alec",
        canonicalUrl: "https://bonjour.bio/alec",
        aliases: [],
        rawMetadata: {}
      }
    } as any);

    expect(result.githubHandles).toContain("al3clee");
  });
});
