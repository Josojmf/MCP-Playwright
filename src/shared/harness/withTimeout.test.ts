import assert from "node:assert/strict";
import test from "node:test";
import { withTimeout, TimeoutError } from "./withTimeout";

test("withTimeout aborts long operation and propagates TimeoutError", async () => {
  const abortController = new AbortController();

  const neverEnding = new Promise<void>((_resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("operation unexpectedly resolved"));
    }, 5000);

    abortController.signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        // Don't reject here - let withTimeout handle the timeout error
      },
      { once: true }
    );
  });

  const startedAt = Date.now();

  await assert.rejects(
    withTimeout(neverEnding, 40, "mock-tier", abortController),
    (error: unknown) => error instanceof TimeoutError
  );

  const elapsedMs = Date.now() - startedAt;
  assert.equal(abortController.signal.aborted, true);
  assert.ok(elapsedMs < 350, `Timeout exceeded expected range: ${elapsedMs}ms`);
});

test("withTimeout returns result when operation completes in time", async () => {
  const value = await withTimeout(Promise.resolve("ok"), 500, "mock-tier");
  assert.equal(value, "ok");
});
