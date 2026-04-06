import assert from "node:assert/strict";
import test from "node:test";
import { estimateCostUsd, fetchOpenRouterPricing, resolvePricing } from "./resolver";
import { PRICING_TABLE } from "./table";

test("estimateCostUsd returns deterministic result", () => {
  const value = estimateCostUsd(250_000, 100_000, {
    inputPer1MTokens: 2,
    outputPer1MTokens: 6,
  });

  assert.equal(value, 1.1);
});

test("resolvePricing returns null for unknown model and exact match for known model", () => {
  assert.equal(resolvePricing("openai", "non-existing-model"), null);

  const pricing = resolvePricing("openai", "gpt-4o");
  assert.ok(pricing);
  assert.equal(pricing?.inputPer1MTokens, 2.5);
});

test("resolvePricing maps openrouter short model id to openai/… pricing entry", () => {
  const short = resolvePricing("openrouter", "gpt-4o-mini");
  const full = resolvePricing("openrouter", "openai/gpt-4o-mini");
  assert.ok(short && full);
  assert.equal(short?.inputPer1MTokens, full?.inputPer1MTokens);
});

test("resolvePricing includes OpenRouter free Qwen3.6 Plus at zero estimated rate", () => {
  const p = resolvePricing("openrouter", "qwen/qwen3.6-plus:free");
  assert.ok(p);
  assert.equal(p?.inputPer1MTokens, 0);
  assert.equal(p?.outputPer1MTokens, 0);
});

test("resolvePricing treats any OpenRouter :free model id as zero without a table row", () => {
  const p = resolvePricing("openrouter", "  vendor/model-name:free  ");
  assert.ok(p);
  assert.equal(p?.inputPer1MTokens, 0);
  assert.equal(p?.outputPer1MTokens, 0);
});

test("pricing table includes at least 15 entries", () => {
  assert.ok(Object.keys(PRICING_TABLE).length >= 15);
});

test("fetchOpenRouterPricing parses OpenRouter pricing payload", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mockFetch = async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "openrouter/auto",
            pricing: {
              prompt: "0.000002",
              completion: "0.000006",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  };

  const result = await fetchOpenRouterPricing("token", mockFetch as unknown as typeof fetch, 50);

  assert.equal(calls[0]?.url, "https://openrouter.ai/api/v1/models");
  assert.equal(result.get("openrouter/auto")?.inputPer1MTokens, 2);
  assert.equal(result.get("openrouter/auto")?.outputPer1MTokens, 6);
});
