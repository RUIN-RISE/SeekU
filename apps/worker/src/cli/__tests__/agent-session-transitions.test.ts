import { describe, expect, it } from "vitest";
import {
  assertAllowedRecoveryPhaseTransition,
  assertAllowedSessionStatusTransition,
  getSessionStatusForRecoveryPhase,
} from "../agent-session-transitions.js";

describe("agent-session-transitions", () => {
  it("allows the recovery path from searching into recovering and shortlist fallback", () => {
    expect(() => assertAllowedSessionStatusTransition("searching", "recovering")).not.toThrow();
    expect(() => assertAllowedSessionStatusTransition("recovering", "shortlist")).not.toThrow();
    expect(getSessionStatusForRecoveryPhase("diagnosing")).toBe("recovering");
    expect(getSessionStatusForRecoveryPhase("low_confidence_shortlist")).toBe("shortlist");
    expect(getSessionStatusForRecoveryPhase("exhausted")).toBe("blocked");
  });

  it("rejects invalid status and recovery phase jumps", () => {
    expect(() => assertAllowedSessionStatusTransition("completed", "searching")).toThrow(
      "Invalid session status transition: completed -> searching",
    );
    expect(() => assertAllowedRecoveryPhaseTransition("idle", "low_confidence_shortlist")).toThrow(
      "Invalid recovery phase transition: idle -> low_confidence_shortlist",
    );
  });
});
