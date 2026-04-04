import assert from "node:assert/strict";
import test from "node:test";
import { validateStepWithVision } from "./visionValidator";
import type { LLMProvider, LLMRequest, LLMResponse, LLMChunk } from "../../shared/llm/types";

class InspectingProvider implements LLMProvider {
  public calls: LLMRequest[] = [];
  private responses: Array<{ verdict: string; confidence: number; needsReview?: boolean; hallucinated?: boolean; rationale?: string }>;

  constructor(responses: Array<{ verdict: string; confidence: number; needsReview?: boolean; hallucinated?: boolean; rationale?: string }>) {
    this.responses = [...responses];
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.calls.push(request);
    const next = this.responses.shift() ?? {
      verdict: "uncertain",
      confidence: 0.2,
      needsReview: true,
      hallucinated: false,
      rationale: "fallback",
    };

    return {
      id: `mock-${this.calls.length}`,
      model: request.model,
      choices: [
        {
          index: 0,
          finishReason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(next),
          },
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      },
    };
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMChunk> {
    yield { index: 0, delta: "", finishReason: "stop" };
  }

  async estimateCost(): Promise<number> {
    return 0.001;
  }
}

test("phase9 contract (VALID-07): failed/aborted no invocan provider.complete", async () => {
  const provider = new InspectingProvider([{ verdict: "matches", confidence: 0.9 }]);

  const result = await validateStepWithVision({
    stepStatus: "failed",
    stepText: "Then User should see results",
    imageBuffer: Buffer.from("fake"),
    provider,
    orchestratorModel: "gpt-4o",
  });

  assert.equal(provider.calls.length, 0);
  assert.equal(result.verdict, "contradicts");
  assert.equal(result.hallucinated, false);
});

test("phase9 contract (VALID-03): contradicción con confianza > 0.8 escala a high-tier", async () => {
  const provider = new InspectingProvider([
    { verdict: "contradicts", confidence: 0.91, needsReview: false, hallucinated: true, rationale: "low tier" },
    { verdict: "contradicts", confidence: 0.96, needsReview: false, hallucinated: true, rationale: "high tier" },
  ]);

  const result = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then User should see results related to \"Cucumber BDD\"",
    imageBuffer: Buffer.from("fake-image"),
    provider,
    orchestratorModel: "gpt-4o",
    lowCostAuditorModel: "gpt-4.1-mini",
    highAccuracyAuditorModel: "gpt-4.1",
  });

  assert.equal(provider.calls.length, 2);
  assert.equal(result.tier, "high");
  assert.equal(result.verdict, "contradicts");
  assert.equal(result.hallucinated, true);
});

test("phase9 contract (VALID-03): si low-tier no contradice, no escala", async () => {
  const provider = new InspectingProvider([{ verdict: "matches", confidence: 0.88, needsReview: false, hallucinated: false }]);

  const result = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then step",
    imageBuffer: Buffer.from("fake-image"),
    provider,
    orchestratorModel: "gpt-4o",
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.tier, "low");
  assert.equal(result.verdict, "matches");
});

test("phase9 contract (VALID-07): request usa temperature 0, json_object y payload multimodal", async () => {
  const provider = new InspectingProvider([{ verdict: "matches", confidence: 0.99, needsReview: false, hallucinated: false }]);

  await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then step",
    imageBuffer: Buffer.from("fake-image"),
    provider,
    orchestratorModel: "gpt-4o",
  });

  assert.equal(provider.calls.length, 1);
  const req = provider.calls[0];
  assert.equal(req.temperature, 0);
  assert.deepEqual(req.responseFormat, { type: "json_object" });

  const user = req.messages[0];
  assert.equal(user.role, "user");
  assert.ok(Array.isArray(user.content));
  const parts = user.content as Array<{ type: string }>;
  assert.ok(parts.some((p) => p.type === "text"));
  assert.ok(parts.some((p) => p.type === "image_url"));
});

test("phase9 contract (VALID-04/VALID-05): reglas de hallucinated y needsReview", async () => {
  const lowConfidenceProvider = new InspectingProvider([{ verdict: "contradicts", confidence: 0.3, needsReview: false, hallucinated: true }]);
  const reviewResult = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then step",
    imageBuffer: Buffer.from("fake-image"),
    provider: lowConfidenceProvider,
    orchestratorModel: "gpt-4o",
  });

  assert.equal(reviewResult.needsReview, true);
  assert.equal(reviewResult.hallucinated, false);

  const highConfidenceProvider = new InspectingProvider([{ verdict: "contradicts", confidence: 0.81, needsReview: false, hallucinated: false }, { verdict: "contradicts", confidence: 0.93, needsReview: false, hallucinated: false }]);
  const hallucinatedResult = await validateStepWithVision({
    stepStatus: "passed",
    stepText: "Then step",
    imageBuffer: Buffer.from("fake-image"),
    provider: highConfidenceProvider,
    orchestratorModel: "gpt-4o",
  });

  assert.equal(hallucinatedResult.hallucinated, true);
});

