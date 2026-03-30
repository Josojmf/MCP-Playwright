import assert from "node:assert/strict";
import test from "node:test";
import { BudgetExceededError, TokenBudget } from "./TokenBudget";

test("TokenBudget warns and hard-stops when cap is exceeded", () => {
  const warnings: string[] = [];
  const budget = new TokenBudget(
    {
      hardCapTokens: 1000,
      warnThresholdRatio: 0.75,
    },
    (message) => warnings.push(message)
  );

  budget.addUsage(760);

  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("hard cap 1000"));

  // Calling checkBudget(300) would exceed the hard cap (760 + 300 > 1000),
  // so it should throw before attempting any operation
  assert.throws(
    () => budget.checkBudget(300),
    (error: unknown) => error instanceof BudgetExceededError
  );
});

test("TokenBudget estimateCostUsd returns deterministic cost", () => {
  const result = TokenBudget.estimateCostUsd({
    inputTokens: 250_000,
    outputTokens: 100_000,
    inputPer1MTokensUsd: 2,
    outputPer1MTokensUsd: 6,
  });

  assert.equal(result, 1.1);
});
