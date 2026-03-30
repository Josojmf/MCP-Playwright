import assert from "node:assert/strict";
import test from "node:test";
import { estimateCostUsd, fetchOpenRouterPricing, resolvePricing } from "./resolver";

test("estimateCostUsd returns deterministic result", () => {
  const value = estimateCostUsd(250_000, 100_000, {
    inputPer1MTokens: 2,
    outputPer1MTokens: 6,
  });

  assert.equal(value, 1.1);
});

test("resolvePricing returns provider fallback when model is unknown", () => {
  const pricing = resolvePricing("openai", "non-existing-model");
  assert.ok(pricing);
  assert.equal(pricing?.inputPer1MTokens, 5);
});

test("fetchOpenRouterPricing returns empty map on failed response", async () => {
  const mockFetch = async () =>
    new Response("{}", {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });

  const result = await fetchOpenRouterPricing("token", mockFetch as unknown as typeof fetch, 50);
  assert.equal(result.size, 0);
});
