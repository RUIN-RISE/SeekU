import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureExplicitPreference,
  extractPreferenceFromText,
  formatCandidateForDisplay,
  isCandidateEmpty,
  mergePreferenceCandidates,
  shouldPromptForCapture,
  type PreferenceCandidate
} from "../preference-capture.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockMemoryStore(overrides: Record<string, unknown> = {}) {
  return {
    isMemoryPaused: vi.fn(async () => false),
    create: vi.fn(async () => ({
      id: "mem-1",
      userId: "user-1",
      kind: "preference",
      scope: { kind: "global" },
      content: {},
      source: "explicit",
      confidence: 1.0,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    update: vi.fn(async () => null),
    delete: vi.fn(async () => true),
    deleteByScope: vi.fn(async () => 0),
    expireStale: vi.fn(async () => 0),
    pauseMemory: vi.fn(async () => {}),
    resumeMemory: vi.fn(async () => {}),
    hydrateContext: vi.fn(async () => ({
      userId: "user-1",
      memoryPaused: false,
      preferences: [],
      feedbacks: [],
      hiringContexts: [],
      allMemories: []
    })),
    ...overrides
  };
}

// ============================================================================
// extractPreferenceFromText (User-Stated Only)
// ============================================================================

describe("extractPreferenceFromText", () => {
  it("extracts tech stack from keywords", () => {
    const candidate = extractPreferenceFromText("找 python rust 开发");
    expect(candidate.techStack).toEqual(expect.arrayContaining(["python", "rust"]));
  });

  it("extracts tech stack from Chinese patterns", () => {
    const candidate = extractPreferenceFromText("会java 懂typescript");
    expect(candidate.techStack).toEqual(expect.arrayContaining(["java", "typescript"]));
  });

  it("extracts locations", () => {
    const candidate = extractPreferenceFromText("杭州或者北京的");
    expect(candidate.locations).toEqual(expect.arrayContaining(["杭州", "北京"]));
  });

  it("extracts role from Chinese", () => {
    const candidate = extractPreferenceFromText("找个后端");
    expect(candidate.role).toBe("backend");
  });

  it("extracts role from English", () => {
    const candidate = extractPreferenceFromText("need a frontend engineer");
    expect(candidate.role).toBe("frontend");
  });

  it("extracts source bias", () => {
    const candidate1 = extractPreferenceFromText("用 bonjour 找");
    expect(candidate1.sourceBias).toBe("bonjour");

    const candidate2 = extractPreferenceFromText("从 github 找");
    expect(candidate2.sourceBias).toBe("github");
  });

  it("extracts preferFresh", () => {
    const candidate = extractPreferenceFromText("要最近活跃的");
    expect(candidate.preferFresh).toBe(true);
  });

  it("returns empty candidate for text without preferences", () => {
    const candidate = extractPreferenceFromText("随便找找");
    expect(isCandidateEmpty(candidate)).toBe(true);
  });

  it("does NOT extract carried-forward fields like sourceBias from unrelated text", () => {
    // This is the key regression test: sourceBias should only be captured
    // if user explicitly mentions it, not if it was carried forward from
    // a previous revision.
    const candidate = extractPreferenceFromText("换个方向找算法");
    expect(candidate.sourceBias).toBeUndefined();
    expect(candidate.role).toBe("algorithm");
  });
});

// ============================================================================
// mergePreferenceCandidates
// ============================================================================

describe("mergePreferenceCandidates", () => {
  it("unions techStack arrays from base and delta", () => {
    const base: PreferenceCandidate = { techStack: ["python"] };
    const delta: PreferenceCandidate = { techStack: ["rust"] };
    const merged = mergePreferenceCandidates(base, delta);
    expect(merged.techStack).toEqual(expect.arrayContaining(["python", "rust"]));
    expect(merged.techStack).toHaveLength(2);
  });

  it("dedupes overlapping values", () => {
    const base: PreferenceCandidate = { techStack: ["python", "rust"] };
    const delta: PreferenceCandidate = { techStack: ["rust", "go"] };
    const merged = mergePreferenceCandidates(base, delta);
    expect(merged.techStack).toEqual(expect.arrayContaining(["python", "rust", "go"]));
    expect(merged.techStack).toHaveLength(3);
  });

  it("preserves base arrays when delta has no arrays", () => {
    const base: PreferenceCandidate = { locations: ["杭州"] };
    const merged = mergePreferenceCandidates(base, { role: "backend" });
    expect(merged.locations).toEqual(["杭州"]);
  });

  it("preserves base when delta is empty", () => {
    const base: PreferenceCandidate = { locations: ["杭州"] };
    const merged = mergePreferenceCandidates(base, {});
    expect(merged.locations).toEqual(["杭州"]);
  });

  it("scalar fields use delta precedence", () => {
    const base: PreferenceCandidate = { role: "backend" };
    const merged = mergePreferenceCandidates(base, { role: "algorithm" });
    expect(merged.role).toBe("algorithm");
  });

  it("simulates clarify accumulation: 杭州 Python 后端 + 再加 Rust", () => {
    const first = extractPreferenceFromText("杭州 python 后端");
    const second = extractPreferenceFromText("再加 rust");
    const accumulated = mergePreferenceCandidates(first, second);
    expect(accumulated.techStack).toEqual(expect.arrayContaining(["python", "rust"]));
    expect(accumulated.locations).toEqual(["杭州"]);
    expect(accumulated.role).toBe("backend");
  });
});

// ============================================================================
// isCandidateEmpty / shouldPromptForCapture
// ============================================================================

describe("isCandidateEmpty", () => {
  it("returns true for empty candidate", () => {
    expect(isCandidateEmpty({})).toBe(true);
  });

  it("returns false for candidate with techStack", () => {
    expect(isCandidateEmpty({ techStack: ["rust"] })).toBe(false);
  });

  it("returns false for candidate with role", () => {
    expect(isCandidateEmpty({ role: "backend" })).toBe(false);
  });

  it("returns true for candidate with only empty arrays", () => {
    expect(isCandidateEmpty({ techStack: [], locations: [] })).toBe(true);
  });
});

describe("shouldPromptForCapture", () => {
  it("prompts when candidate is non-empty", () => {
    expect(shouldPromptForCapture({ role: "backend" })).toBe(true);
  });

  it("does not prompt when candidate is empty", () => {
    expect(shouldPromptForCapture({})).toBe(false);
  });
});

// ============================================================================
// formatCandidateForDisplay
// ============================================================================

describe("formatCandidateForDisplay", () => {
  it("formats all fields", () => {
    const candidate: PreferenceCandidate = {
      techStack: ["python", "rust"],
      locations: ["杭州"],
      role: "backend",
      sourceBias: "bonjour",
      preferFresh: true
    };
    const text = formatCandidateForDisplay(candidate);
    expect(text).toContain("python");
    expect(text).toContain("rust");
    expect(text).toContain("杭州");
    expect(text).toContain("backend");
    expect(text).toContain("Bonjour");
    expect(text).toContain("最近活跃");
  });

  it("handles partial candidate", () => {
    const text = formatCandidateForDisplay({ role: "AI工程师" });
    expect(text).toContain("AI工程师");
    expect(text).not.toContain("技术栈");
  });
});

// ============================================================================
// captureExplicitPreference
// ============================================================================

describe("captureExplicitPreference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const SAMPLE_CANDIDATE: PreferenceCandidate = {
    techStack: ["python", "rust"],
    locations: ["杭州"],
    role: "backend",
    sourceBias: "bonjour",
    preferFresh: true
  };

  it("saves when user confirms", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn().mockResolvedValue("记住");

    const result = await captureExplicitPreference(
      store as any,
      { candidate: SAMPLE_CANDIDATE, sourceContext: "clarify" },
      askFreeform
    );

    expect(result.captured).toBe(true);
    expect(result.reason).toBe("confirmed");
    expect(result.candidate).toBeTruthy();
    expect(store.create).toHaveBeenCalledTimes(1);

    const createArgs = (store.create as any).mock.calls[0][0];
    expect(createArgs.kind).toBe("preference");
    expect(createArgs.source).toBe("explicit");
    expect(createArgs.scope).toEqual({ kind: "global" });
    expect(createArgs.content.techStack).toEqual(["python", "rust"]);
  });

  it("does not save when user rejects", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn().mockResolvedValue("只这次用");

    const result = await captureExplicitPreference(
      store as any,
      { candidate: SAMPLE_CANDIDATE, sourceContext: "clarify" },
      askFreeform
    );

    expect(result.captured).toBe(false);
    expect(result.reason).toBe("rejected");
    expect(result.candidate).toBeTruthy();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("skips when memory is paused", async () => {
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => true)
    });
    const askFreeform = vi.fn();

    const result = await captureExplicitPreference(
      store as any,
      { candidate: SAMPLE_CANDIDATE, sourceContext: "clarify" },
      askFreeform
    );

    expect(result.captured).toBe(false);
    expect(result.reason).toBe("skipped");
    expect(askFreeform).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("skips when candidate is empty", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn();

    const result = await captureExplicitPreference(
      store as any,
      { candidate: {}, sourceContext: "refine" },
      askFreeform
    );

    expect(result.captured).toBe(false);
    expect(result.reason).toBe("empty");
    expect(askFreeform).not.toHaveBeenCalled();
  });

  it("accepts various affirmative responses", async () => {
    const store = createMockMemoryStore();

    for (const response of ["记住", "y", "yes", "1"]) {
      store.create.mockClear();
      const askFreeform = vi.fn().mockResolvedValue(response);

      const result = await captureExplicitPreference(
        store as any,
        { candidate: SAMPLE_CANDIDATE, sourceContext: "clarify" },
        askFreeform
      );

      expect(result.captured).toBe(true);
      expect(store.create).toHaveBeenCalledTimes(1);
    }
  });

  it("rejection does not affect session", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn().mockResolvedValue("不记住");

    const result = await captureExplicitPreference(
      store as any,
      { candidate: SAMPLE_CANDIDATE, sourceContext: "refine" },
      askFreeform
    );

    expect(result.captured).toBe(false);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("duplicate confirmation does not error", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn().mockResolvedValue("记住");

    const result1 = await captureExplicitPreference(
      store as any,
      { candidate: SAMPLE_CANDIDATE, sourceContext: "clarify" },
      askFreeform
    );
    const result2 = await captureExplicitPreference(
      store as any,
      { candidate: SAMPLE_CANDIDATE, sourceContext: "clarify" },
      askFreeform
    );

    expect(result1.captured).toBe(true);
    expect(result2.captured).toBe(true);
    expect(store.create).toHaveBeenCalledTimes(2);
  });

  it("only captures user-stated fields, not carried-forward conditions", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn().mockResolvedValue("记住");

    // User only mentioned "算法" in their refine text
    // sourceBias: "bonjour" was carried forward from previous conditions
    // and should NOT be captured as explicit preference
    const userStatedOnly: PreferenceCandidate = {
      role: "algorithm"
    };

    const result = await captureExplicitPreference(
      store as any,
      { candidate: userStatedOnly, sourceContext: "refine" },
      askFreeform
    );

    expect(result.captured).toBe(true);
    const createArgs = (store.create as any).mock.calls[0][0];
    expect(createArgs.content.role).toBe("algorithm");
    expect(createArgs.content.sourceBias).toBeUndefined();
  });
});

// ============================================================================
// Workflow integration
// ============================================================================

describe("workflow preference capture integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls maybeCapturePreference after clarify loop", async () => {
    const { SearchWorkflow } = await import("../workflow.js");
    const workflow = new SearchWorkflow({} as any, {} as any);
    const mockTui = {
      displayInitialSearch: vi.fn(),
      displayClarifiedDraft: vi.fn(),
      resetShortlistViewport: vi.fn(),
      displayShortlist: vi.fn(),
      promptShortlistAction: vi.fn(),
      promptCompareAction: vi.fn(),
      displayNoResults: vi.fn(),
      displayPoolCleared: vi.fn()
    };
    const mockChat = {
      askFreeform: vi.fn().mockResolvedValue(""),
      extractConditions: vi.fn().mockResolvedValue({
        skills: ["python"],
        locations: ["杭州"],
        role: "backend",
        sourceBias: undefined,
        preferFresh: false,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        limit: 10
      }),
      reviseConditions: vi.fn(),
      detectMissing: vi.fn(() => [])
    };
    (workflow as any).tui = mockTui;
    (workflow as any).chat = mockChat;

    // No memory store → should not throw
    const runClarifyLoop = (workflow as any).runClarifyLoop.bind(workflow);
    await runClarifyLoop("杭州 python backend");

    // No error means graceful skip
  });

  it("calls capture when memoryStore is provided and user confirms", async () => {
    const { SearchWorkflow } = await import("../workflow.js");
    const mockStore = createMockMemoryStore();
    const workflow = new SearchWorkflow({} as any, {} as any, {
      memoryStore: mockStore as any
    });
    const mockTui = {
      displayInitialSearch: vi.fn(),
      displayClarifiedDraft: vi.fn(),
      resetShortlistViewport: vi.fn(),
      displayShortlist: vi.fn(),
      promptShortlistAction: vi.fn(),
      promptCompareAction: vi.fn(),
      displayNoResults: vi.fn(),
      displayPoolCleared: vi.fn()
    };
    const mockChat = {
      askFreeform: vi.fn()
        .mockResolvedValueOnce("记住"),
      extractConditions: vi.fn().mockResolvedValue({
        skills: ["python"],
        locations: ["杭州"],
        role: "backend",
        sourceBias: undefined,
        preferFresh: false,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        limit: 10
      }),
      reviseConditions: vi.fn(),
      detectMissing: vi.fn(() => [])
    };
    (workflow as any).tui = mockTui;
    (workflow as any).chat = mockChat;

    const runClarifyLoop = (workflow as any).runClarifyLoop.bind(workflow);
    await runClarifyLoop("杭州 python backend");

    expect(mockStore.create).toHaveBeenCalledTimes(1);
  });
});
