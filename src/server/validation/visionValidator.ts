import { LLMProvider, LLMMessage } from "../../shared/llm/types";

export type VisionVerdict = "matches" | "contradicts" | "uncertain";
export type VisionTier = "low" | "high";

export interface StepValidation {
  auditorModel: string;
  tier: VisionTier;
  verdict: VisionVerdict;
  confidence: number;
  needsReview: boolean;
  hallucinated: boolean;
  rationale: string;
}

export interface VisionValidationInput {
  stepStatus: "passed" | "failed" | "aborted";
  stepText: string;
  imageBuffer: Buffer;
  provider: LLMProvider;
  orchestratorModel: string;
  lowCostAuditorModel?: string;
  highAccuracyAuditorModel?: string;
}

/**
 * Async vision validation with real LLM calls.
 * Uses tiered escalation: low-cost model first, high-accuracy on contradiction.
 */
export async function validateStepWithVision(input: VisionValidationInput): Promise<StepValidation> {
  const lowModel =
    input.lowCostAuditorModel && input.lowCostAuditorModel !== input.orchestratorModel
      ? input.lowCostAuditorModel
      : "gpt-4.1-mini";

  const highModel =
    input.highAccuracyAuditorModel && input.highAccuracyAuditorModel !== input.orchestratorModel
      ? input.highAccuracyAuditorModel
      : "gpt-4.1";

  // Failed/aborted steps get deterministic result without LLM call
  if (input.stepStatus !== "passed") {
    return {
      auditorModel: lowModel,
      tier: "low",
      verdict: "contradicts",
      confidence: 0.95,
      needsReview: false,
      hallucinated: false,
      rationale: "Technical step result indicates failure or abort.",
    };
  }

  // Run low-tier evaluation with real LLM
  const lowPass = await runLowTierLLMEvaluation(input, lowModel);

  // Escalate to high-tier if contradiction and high confidence
  if (lowPass.verdict === "contradicts" && lowPass.confidence > 0.8) {
    const highPass = await runHighTierLLMEvaluation(input, highModel, lowPass);
    return finalizeValidation(input, highPass);
  }

  return finalizeValidation(input, lowPass);
}

async function runLowTierLLMEvaluation(
  input: VisionValidationInput,
  auditorModel: string
): Promise<StepValidation> {
  const imageB64 = input.imageBuffer.toString("base64");
  const imageUrl = `data:image/png;base64,${imageB64}`;

  const userMessage: LLMMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: `Analyze this step execution evidence and determine if it succeeded or failed:

Step Text: "${input.stepText}"

Instructions:
1. Examine the screenshot carefully.
2. Determine if the step execution appears to have succeeded (matches) or failed (contradicts).
3. Rate your confidence from 0 to 1.
4. Indicate if the result requires human review.
5. Indicate if this appears to be a hallucination (model output doesn't match reality).

Respond ONLY with valid JSON matching this structure:
{
  "verdict": "matches" | "contradicts" | "uncertain",
  "confidence": <0-1>,
  "needsReview": <boolean>,
  "hallucinated": <boolean>,
  "rationale": "<explanation>"
}`,
      },
      {
        type: "image_url",
        image_url: { url: imageUrl },
      },
    ],
  };

  try {
    const response = await input.provider.complete({
      model: auditorModel,
      messages: [userMessage],
      maxTokens: 500,
      temperature: 0,
      responseFormat: { type: "json_object" },
    });

    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") {
      throw new Error("Invalid response from provider");
    }

    const verdict = JSON.parse(content);

    return {
      auditorModel,
      tier: "low",
      verdict: verdict.verdict ?? "uncertain",
      confidence: verdict.confidence ?? 0.5,
      needsReview: verdict.needsReview ?? true,
      hallucinated: verdict.hallucinated ?? false,
      rationale: verdict.rationale ?? "Low-tier evaluation performed.",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      auditorModel,
      tier: "low",
      verdict: "uncertain",
      confidence: 0.2,
      needsReview: true,
      hallucinated: false,
      rationale: `Vision LLM error: ${errorMsg}`,
    };
  }
}

async function runHighTierLLMEvaluation(
  input: VisionValidationInput,
  auditorModel: string,
  lowPass: StepValidation
): Promise<StepValidation> {
  const imageB64 = input.imageBuffer.toString("base64");
  const imageUrl = `data:image/png;base64,${imageB64}`;

  const userMessage: LLMMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: `Re-analyze this step execution with high accuracy:

Step Text: "${input.stepText}"

Previous assessment indicates a contradiction with high confidence. 
Confirm or revise the verdict.

Respond ONLY with valid JSON:
{
  "verdict": "matches" | "contradicts" | "uncertain",
  "confidence": <0-1>,
  "needsReview": <boolean>,
  "hallucinated": <boolean>,
  "rationale": "<explanation>"
}`,
      },
      {
        type: "image_url",
        image_url: { url: imageUrl },
      },
    ],
  };

  try {
    const response = await input.provider.complete({
      model: auditorModel,
      messages: [userMessage],
      maxTokens: 500,
      temperature: 0,
      responseFormat: { type: "json_object" },
    });

    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") {
      throw new Error("Invalid response from provider");
    }

    const verdict = JSON.parse(content);

    return {
      auditorModel,
      tier: "high",
      verdict: verdict.verdict ?? lowPass.verdict,
      confidence: Math.min(0.98, verdict.confidence ?? lowPass.confidence + 0.05),
      needsReview: verdict.needsReview ?? false,
      hallucinated: verdict.hallucinated ?? false,
      rationale: verdict.rationale ?? "Escalated to high-tier evaluation.",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      auditorModel,
      tier: "high",
      verdict: lowPass.verdict,
      confidence: lowPass.confidence,
      needsReview: true,
      hallucinated: false,
      rationale: `High-tier escalation error: ${errorMsg}`,
    };
  }
}

function finalizeValidation(input: VisionValidationInput, validation: StepValidation): StepValidation {
  const needsReview = validation.confidence < 0.4 || validation.verdict === "uncertain";
  const hallucinated =
    input.stepStatus === "passed" &&
    validation.verdict === "contradicts" &&
    validation.confidence > 0.7;

  return {
    ...validation,
    needsReview,
    hallucinated,
  };
}
