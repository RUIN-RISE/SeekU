import { describe, expect, it, vi } from "vitest";

import {
  UserExitError,
  isUserExitError,
  runPromptWithUserExit
} from "../prompt-abort.js";

describe("prompt-abort", () => {
  it("rejects with UserExitError and cancels the prompt on SIGINT", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const promptBuffer = {
      run: vi.fn(() => new Promise<string>(() => undefined)),
      cancel
    };

    const promptPromise = runPromptWithUserExit(promptBuffer);
    process.emit("SIGINT");

    await expect(promptPromise).rejects.toBeInstanceOf(UserExitError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("recognizes structured USER_EXIT errors", () => {
    expect(isUserExitError(new UserExitError())).toBe(true);
    expect(isUserExitError({ code: "USER_EXIT" })).toBe(true);
    expect(isUserExitError(new Error("boom"))).toBe(false);
  });
});
