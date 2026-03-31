import { describe, expect, it } from "vitest";

import { extractGithubHandlesFromSourceProfile } from "./github-sync.js";

describe("extractGithubHandlesFromSourceProfile", () => {
  it("collects top-level github profile URLs and ignores repository URLs", () => {
    const handles = extractGithubHandlesFromSourceProfile({
      normalizedPayload: {
        aliases: [
          { type: "github", value: "https://github.com/Al3cLee" }
        ]
      },
      rawPayload: {
        socials: [
          { type: "website", content: "https://github.com/al3clee" },
          { type: "website", content: "https://github.com/toeverything/AFFiNE" }
        ]
      }
    });

    expect(handles).toContain("al3clee");
    expect(handles).not.toContain("toeverything");
  });
});
