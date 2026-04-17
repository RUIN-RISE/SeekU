import { describe, expect, it } from "vitest";

import type { EvidenceItem, Person } from "@seeku/db";

import { buildSearchDocument } from "../index-builder.js";

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    primaryName: "Test Person",
    primaryHeadline: null,
    summary: null,
    primaryLocation: null,
    avatarUrl: null,
    searchStatus: "active",
    confidenceScore: "0.8",
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: "evidence-1",
    personId: "person-1",
    sourceProfileId: null,
    source: "bonjour",
    evidenceType: "profile_field",
    title: "Role",
    description: null,
    url: null,
    occurredAt: null,
    metadata: {},
    evidenceHash: "hash-1",
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides
  };
}

describe("index-builder facetRole extraction", () => {
  it("extracts concise Chinese role tags from summary and profile fields", () => {
    const person = makePerson({
      summary: "[bonjour] 后端工程师；创业合伙人；AI 基础设施研究"
    });

    const document = buildSearchDocument({
      person,
      evidence: [
        makeEvidence({
          description: "后端工程师；创业合伙人；AI 基础设施研究",
          metadata: {
            field: "role",
            roleSignals: ["后端工程师", "创业合伙人", "AI 基础设施研究"]
          }
        })
      ]
    });

    const facetRole = document.facetRole ?? [];

    expect(facetRole).toEqual(
      expect.arrayContaining(["后端工程师", "合伙人", "AI研究员"])
    );
    facetRole.forEach((role) => expect(Array.from(role).length).toBeLessThanOrEqual(24));
  });

  it("canonicalizes English role phrases into concise tags", () => {
    const person = makePerson({
      primaryHeadline: "Backend Engineer @ Startup",
      summary: "Founder and product manager building agent workflows"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["后端工程师", "创始人", "产品经理"])
    );
  });

  it("uses metadata.roleSignals to recover role tags from sparse profile fields", () => {
    const person = makePerson();

    const document = buildSearchDocument({
      person,
      evidence: [
        makeEvidence({
          title: "Skill",
          description: "LangChain, Python, vector database",
          metadata: {
            field: "skill",
            roleSignals: ["Agent 架构研究", "Backend Engineer"]
          }
        })
      ]
    });

    expect(document.facetRole ?? []).toEqual(
      expect.arrayContaining(["AI研究员", "后端工程师"])
    );
  });

  it("does not leak long narrative text into facetRole", () => {
    const longNarrative =
      "寻找AI领域合伙人/项目制合作。专注为企业提供AI智能体行业解决方案，涵盖从需求分析、智能体定制开发到落地部署的全过程。";
    const person = makePerson({ summary: longNarrative });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.facetRole ?? []).toEqual([]);
    expect(document.facetRole ?? []).not.toContain(longNarrative);
  });

  it("expands zju aliases into docText for future indexing", () => {
    const person = makePerson({
      primaryHeadline: "浙大智能教育研究中心成员"
    });

    const document = buildSearchDocument({ person, evidence: [] });

    expect(document.docText).toContain("浙大智能教育研究中心成员");
    expect(document.docText).toContain("zhejiang university");
    expect(document.docText).toContain("zju");
    expect(document.docText).toContain("浙江大学");
  });

  it("adds zju manual seed tag for curated bonjour alumni handles", () => {
    const person = makePerson({
      primaryName: "Aura"
    });

    const document = buildSearchDocument({
      person,
      evidence: [],
      sourceHints: [
        { source: "bonjour", handle: "zxhq0c" }
      ]
    });

    expect(document.facetTags ?? []).toContain("zju_manual_seed");
  });
});
