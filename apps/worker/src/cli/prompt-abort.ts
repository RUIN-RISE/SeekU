export class UserExitError extends Error {
  readonly code = "USER_EXIT";

  constructor(message = "User exited the current CLI prompt.") {
    super(message);
    this.name = "UserExitError";
  }
}

export function isUserExitError(error: unknown): error is UserExitError {
  return error instanceof UserExitError
    || (error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "USER_EXIT");
}

export async function runPromptWithUserExit<T>(
  promptBuffer: {
    run(): Promise<T>;
    cancel?(error?: unknown): unknown;
  }
): Promise<T> {
  const exitError = new UserExitError();

  return await new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      process.off("SIGINT", onSigint);
    };

    const settleResolve = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onSigint = () => {
      void Promise.resolve(promptBuffer.cancel?.(exitError)).catch(() => undefined);
      settleReject(exitError);
    };

    process.on("SIGINT", onSigint);
    void promptBuffer.run().then(settleResolve, settleReject);
  });
}
