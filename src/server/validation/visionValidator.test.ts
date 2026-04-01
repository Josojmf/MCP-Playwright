import assert from "node:assert/strict";
import test from "node:test";
import { validateStepWithVision } from "./visionValidator";
import type { LLMProvider, LLMResponse, LLMRequest } from "../../shared/llm/types";

// Mock LLM provider for testing
class MockLLMProvider implements LLMProvider {
  constructor(
    private responseContent: any,
    private shouldFail: boolean = false
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.shouldFail) {
      throw new Error("Mock provider error");
    }

    return {
      id: "mock-123",
      model: request.model,
      choices: [
        {
          index: 0,
          finishReason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(this.responseContent),
          },
        },
      ],
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.001,
      },
    };
  }

  async stream() {
    throw new Error("Not implemented");
  }

  async estimateCost() {
    return 0.001;
  }
}

test("validateStepWithVision: paso failed no hace llamada LLM", async () => {
  const provider = new MockLLMProvider({}, false);
  const result = await validateStepWithVision({
    stepStatus: "failed",
    stepText: "Then I should see dashboard",
    imageBuffer: Buffer.from("fake"),
    provider,
    orchestratorModel: "gpt-4.1",
  });

  assert.equal(result.verdict, "contradicts");
  assert.equal(result.needsReview, false);
  assert.equal(result.hallucinated, false);
  assert.ok(result.confidence > 0.85);
});

test("validateStepWithVision: respuesta JSON válida con verdicts", async () => {
  const provider = new MockLLMProvider({
    verdict: "matches",
    confidence: 0.95,
    needsReview: false,
    hallucinated: false,
    rationale: "Screenshot matches expected behavior",
  });

  const result = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then I should see dashboard",
    imageBuffer: Buffer.from("fake"),
    provider,
    orchestratorModel: "gpt-4.1",
  });

  assert.equal(result.verdict, "matches");
  assert.equal(result.confidence, 0.95);
  assert.equal(result.hallucinated, false);
});

test("validateStepWithVision: JSON inválido vuelve a uncertain con review", async () => {
  // Create a provider that returns invalid JSON (will fail parsing)
  const badProvider = new (class implements LLMProvider {
    async complete() {
      return {
        id: "mock-bad",
        model: "test",
        choices: [
          {
            index: 0,
            finishReason: "stop",
            message: {
              role: "assistant" as const,
              content: "{invalid json without closing brace",
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          estimatedCostUsd: 0.001,
        },
      };
    }
    async stream() {
      throw new Error("Not implemented");
    }
    async estimateCost() {
      return 0.001;
    }
  })();

  const result = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then I should see dashboard",
    imageBuffer: Buffer.from("fake"),
    provider: badProvider,
    orchestratorModel: "gpt-4.1",
  });

  assert.equal(result.verdict, "uncertain");
  assert.equal(result.confidence, 0.2);
  assert.equal(result.needsReview, true);
  assert.equal(result.hallucinated, false);
});

test("validateStepWithVision: error del provider vuelve a uncertain", async () => {
  const provider = new MockLLMProvider({}, true);

  const result = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then I should see dashboard",
    imageBuffer: Buffer.from("fake"),
    provider,
    orchestratorModel: "gpt-4.1",
  });

  assert.equal(result.verdict, "uncertain");
  assert.equal(result.needsReview, true);
  assert.equal(result.hallucinated, false);
  assert.ok(result.rationale.includes("Vision LLM error"));
});
