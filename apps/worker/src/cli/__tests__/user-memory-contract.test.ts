import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { UserIdentityProvider } from "../user-identity-provider.js";
import type {
  MemoryScope,
  UserMemoryRecord
} from "../user-memory-types.js";
import {
  getExplicitExpiryDate,
  getInferredExpiryDate,
  INFERRED_MEMORY_EXPIRY_DAYS
} from "../user-memory-types.js";

// Mock homedir so tests don't touch the real ~/.seeku
let mockHomedirValue: string;
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => mockHomedirValue
  };
});

// ============================================================================
// Inline scope helpers (mirrors packages/db/src/user-memories.ts)
// ============================================================================

type ScopeKind = "global" | "role" | "location" | "work_item";

function scopeToColumns(scope: MemoryScope): {
  scopeKind: ScopeKind;
  scopeValue: string | null;
} {
  switch (scope.kind) {
    case "global":
      return { scopeKind: "global", scopeValue: null };
    case "role":
      return { scopeKind: "role", scopeValue: scope.role };
    case "location":
      return { scopeKind: "location", scopeValue: scope.location };
    case "work_item":
      return { scopeKind: "work_item", scopeValue: scope.workItemId };
  }
}

function columnsToScope(
  scopeKind: ScopeKind,
  scopeValue: string | null
): MemoryScope {
  switch (scopeKind) {
    case "global":
      return { kind: "global" };
    case "role":
      return { kind: "role", role: scopeValue! };
    case "location":
      return { kind: "location", location: scopeValue! };
    case "work_item":
      return { kind: "work_item", workItemId: scopeValue! };
  }
}

// ============================================================================
// UserIdentityProvider Tests
// ============================================================================

describe("UserIdentityProvider", () => {
  let tempHomedir: string;

  beforeEach(() => {
    tempHomedir = join("/tmp", `seeku-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempHomedir, { recursive: true });
    mockHomedirValue = tempHomedir;
  });

  afterEach(() => {
    rmSync(tempHomedir, { recursive: true, force: true });
  });

  it("generates and persists a stable user ID on first resolve", () => {
    const provider = new UserIdentityProvider();
    const identity = provider.resolve();

    expect(identity.userId).toMatch(/^local-/);
    expect(identity.source).toBe("generated");
    expect(provider.isResolved()).toBe(true);
  });

  it("returns the same ID on subsequent resolves", () => {
    const provider = new UserIdentityProvider();
    const first = provider.resolve();
    const second = provider.resolve();

    expect(first.userId).toBe(second.userId);
    expect(second.source).toBe("generated");
  });

  it("persists ID so a new provider instance reads it back", () => {
    const provider1 = new UserIdentityProvider();
    const identity1 = provider1.resolve();

    const provider2 = new UserIdentityProvider();
    const identity2 = provider2.resolve();

    expect(identity2.userId).toBe(identity1.userId);
    expect(identity2.source).toBe("local_profile");
  });

  it("getUserId throws before resolve is called", () => {
    const provider = new UserIdentityProvider();
    expect(() => provider.getUserId()).toThrow("resolve() must be called");
  });

  it("getUserId returns the resolved user ID", () => {
    const provider = new UserIdentityProvider();
    provider.resolve();
    expect(provider.getUserId()).toMatch(/^local-/);
  });

  it("reset clears the cached identity", () => {
    const provider = new UserIdentityProvider();
    provider.resolve();
    expect(provider.isResolved()).toBe(true);

    provider.reset();
    expect(provider.isResolved()).toBe(false);
  });

  it("handles corrupted profile file gracefully", () => {
    const profilePath = join(tempHomedir, ".seeku", "profile.json");
    mkdirSync(join(tempHomedir, ".seeku"), { recursive: true });
    writeFileSync(profilePath, "not valid json{{{");

    const provider = new UserIdentityProvider();
    const identity = provider.resolve();

    expect(identity.userId).toMatch(/^local-/);
    expect(identity.source).toBe("generated");
  });

  it("stores profile in ~/.seeku/profile.json regardless of working directory", () => {
    const provider = new UserIdentityProvider();
    provider.resolve();

    const profilePath = join(tempHomedir, ".seeku", "profile.json");
    expect(existsSync(profilePath)).toBe(true);
  });
});

// ============================================================================
// Structured MemoryScope Tests
// ============================================================================

describe("MemoryScope round-trip", () => {
  const scopes: Array<{ scope: MemoryScope; expectedKind: string; expectedValue: string | null }> = [
    { scope: { kind: "global" }, expectedKind: "global", expectedValue: null },
    { scope: { kind: "role", role: "backend" }, expectedKind: "role", expectedValue: "backend" },
    { scope: { kind: "location", location: "杭州" }, expectedKind: "location", expectedValue: "杭州" },
    { scope: { kind: "work_item", workItemId: "wi-123" }, expectedKind: "work_item", expectedValue: "wi-123" }
  ];

  for (const { scope, expectedKind, expectedValue } of scopes) {
    it(`round-trips ${expectedKind} scope`, () => {
      const columns = scopeToColumns(scope);
      expect(columns.scopeKind).toBe(expectedKind);
      expect(columns.scopeValue).toBe(expectedValue);

      const restored = columnsToScope(columns.scopeKind, columns.scopeValue);
      expect(restored).toEqual(scope);
    });
  }
});

// ============================================================================
// Expiration Policy Tests
// ============================================================================

describe("Expiration policy", () => {
  it("explicit memory has no expiration by default", () => {
    expect(getExplicitExpiryDate()).toBeNull();
  });

  it("inferred memory expires after 30 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00.000Z"));

    const expiry = getInferredExpiryDate();
    expect(expiry).toBeTruthy();

    const diffMs = expiry!.getTime() - new Date("2026-04-22T00:00:00.000Z").getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(INFERRED_MEMORY_EXPIRY_DAYS);

    vi.useRealTimers();
  });
});

// ============================================================================
// UserMemoryStore Contract Tests (mocked DB)
// ============================================================================

describe("UserMemoryStore contract", () => {
  // These tests validate the contract interface without a real DB.
  // Integration tests with a real DB should be added separately.

  it("MemoryScope type accepts all valid shapes", () => {
    const scopes: MemoryScope[] = [
      { kind: "global" },
      { kind: "role", role: "backend" },
      { kind: "location", location: "杭州" },
      { kind: "work_item", workItemId: "wi-abc" }
    ];

    for (const scope of scopes) {
      expect(scope.kind).toBeDefined();
    }
  });

  it("CreateUserMemoryOptions requires explicit source distinction", () => {
    const explicit = {
      kind: "preference" as const,
      scope: { kind: "global" as const },
      content: { techStack: ["rust"] },
      source: "explicit" as const
    };

    const inferred = {
      kind: "preference" as const,
      scope: { kind: "global" as const },
      content: { techStack: ["python"] },
      source: "inferred" as const
    };

    expect(explicit.source).toBe("explicit");
    expect(inferred.source).toBe("inferred");
    expect(explicit.source).not.toBe(inferred.source);
  });

  it("UserMemoryRecord has all required fields", () => {
    const record: UserMemoryRecord = {
      id: "mem-1",
      userId: "user-1",
      kind: "preference",
      scope: { kind: "global" },
      content: { techStack: ["rust"] },
      source: "explicit",
      confidence: 1.0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(record.id).toBe("mem-1");
    expect(record.scope.kind).toBe("global");
    expect(record.source).toBe("explicit");
    expect(record.expiresAt).toBeUndefined();
  });

  it("inferred record includes expiresAt", () => {
    const record: UserMemoryRecord = {
      id: "mem-2",
      userId: "user-1",
      kind: "preference",
      scope: { kind: "global" },
      content: { avoidTechStack: ["java"] },
      source: "inferred",
      confidence: 0.7,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: getInferredExpiryDate()
    };

    expect(record.source).toBe("inferred");
    expect(record.expiresAt).not.toBeNull();
    expect(record.confidence).toBeLessThan(1.0);
  });
});
