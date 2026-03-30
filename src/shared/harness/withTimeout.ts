export const TIMEOUT_TIERS = {
  SCREENSHOT: 5000,
  LLM_API: 15000,
  PLAYWRIGHT_ACTION: 25000,
  STEP: 30000,
  RUN: 300000,
};

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout race.
 * If the duration is exceeded, it rejects with TimeoutError and invokes `abortController.abort()` to actively cancel.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  durationMs: number,
  tierName: string,
  abortController?: AbortController
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      if (abortController && !abortController.signal.aborted) {
        abortController.abort(new TimeoutError(`${tierName} timed out after ${durationMs}ms`));
      }
      reject(new TimeoutError(`${tierName} timed out after ${durationMs}ms`));
    }, durationMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutHandle!);
  }
}
