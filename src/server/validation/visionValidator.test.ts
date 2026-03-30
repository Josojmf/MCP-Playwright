import assert from "node:assert/strict";
import test from "node:test";
import { validateStepWithVision } from "./visionValidator";

test("visionValidator marca NEEDS_REVIEW sin screenshot", () => {
  const result = validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then I should see dashboard",
    screenshotAvailable: false,
    orchestratorModel: "gpt-4.1",
  });

  assert.equal(result.needsReview, true);
  assert.equal(result.verdict, "uncertain");
  assert.equal(result.hallucinated, false);
});

test("visionValidator detecta contradicción en paso passed y marca hallucinated", () => {
  const result = validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then I should see wrong url",
    screenshotAvailable: true,
    orchestratorModel: "gpt-4.1",
  });

  assert.equal(result.verdict, "contradicts");
  assert.equal(result.hallucinated, true);
  assert.ok(result.confidence > 0.7);
});
