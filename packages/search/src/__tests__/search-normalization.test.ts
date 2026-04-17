import { describe, expect, it } from "vitest";

import {
  collectDocumentAliasTerms,
  isBoundarySensitiveSearchTerm,
  normalizeSearchText,
} from "../search-normalization.js";

describe("search normalization", () => {
  it("folds punctuation and width variants for names", () => {
    expect(normalizeSearchText("Elliottt！")).toBe("elliottt");
    expect(normalizeSearchText("Elliottt!")).toBe("elliottt");
  });

  it("canonicalizes zju university aliases", () => {
    expect(normalizeSearchText("Law@ZJU")).toContain("law zhejiang university");
    expect(normalizeSearchText("浙大智能教育研究中心成员")).toContain("zhejiang university");
  });

  it("marks short single-token ascii terms as boundary-sensitive", () => {
    expect(isBoundarySensitiveSearchTerm("aura")).toBe(true);
    expect(isBoundarySensitiveSearchTerm("zhejiang university")).toBe(false);
    expect(isBoundarySensitiveSearchTerm("朱奕霏clara")).toBe(false);
  });

  it("adds missing school aliases for indexed documents", () => {
    expect(collectDocumentAliasTerms(["浙大智能教育研究中心成员"])).toEqual(
      expect.arrayContaining(["zhejiang university", "zju", "浙江大学"])
    );
  });
});
