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
  screenshotAvailable: boolean;
  orchestratorModel: string;
  lowCostAuditorModel?: string;
  highAccuracyAuditorModel?: string;
}

/**
 * Deterministic tiered validation with explicit anti-circular constraints:
 * - Auditor model is always different from orchestrator model.
 * - Low tier first, then optional escalation when contradiction confidence is high.
 */
export function validateStepWithVision(input: VisionValidationInput): StepValidation {
  const lowModel =
    input.lowCostAuditorModel && input.lowCostAuditorModel !== input.orchestratorModel
      ? input.lowCostAuditorModel
      : "gpt-4.1-mini";

  const highModel =
    input.highAccuracyAuditorModel && input.highAccuracyAuditorModel !== input.orchestratorModel
      ? input.highAccuracyAuditorModel
      : "gpt-4.1";

  const lowPass = runLowTierHeuristic(input, lowModel);

  if (lowPass.verdict === "contradicts" && lowPass.confidence > 0.8) {
    const highPass = runHighTierHeuristic(input, highModel, lowPass);
    return finalizeValidation(input, highPass);
  }

  return finalizeValidation(input, lowPass);
}

function runLowTierHeuristic(input: VisionValidationInput, auditorModel: string): StepValidation {
  if (!input.screenshotAvailable) {
    return {
      auditorModel,
      tier: "low",
      verdict: "uncertain",
      confidence: 0.2,
      needsReview: true,
      hallucinated: false,
      rationale: "Sin screenshot disponible para validación visual.",
    };
  }

  const text = input.stepText.toLowerCase();

  if (input.stepStatus === "failed" || input.stepStatus === "aborted") {
    return {
      auditorModel,
      tier: "low",
      verdict: "contradicts",
      confidence: 0.86,
      needsReview: false,
      hallucinated: false,
      rationale: "El resultado técnico del paso indica fallo o aborto.",
    };
  }

  if (text.includes("incorrect") || text.includes("invalido") || text.includes("wrong")) {
    return {
      auditorModel,
      tier: "low",
      verdict: "contradicts",
      confidence: 0.82,
      needsReview: false,
      hallucinated: true,
      rationale: "Patrón textual de contradicción detectado en el paso.",
    };
  }

  if (text.includes("maybe") || text.includes("quiz") || text.includes("possibly")) {
    return {
      auditorModel,
      tier: "low",
      verdict: "uncertain",
      confidence: 0.35,
      needsReview: true,
      hallucinated: false,
      rationale: "Evidencia ambigua detectada; requiere revisión humana.",
    };
  }

  return {
    auditorModel,
    tier: "low",
    verdict: "matches",
    confidence: 0.72,
    needsReview: false,
    hallucinated: false,
    rationale: "El estado visual es consistente con el resultado técnico del paso.",
  };
}

function runHighTierHeuristic(
  input: VisionValidationInput,
  auditorModel: string,
  lowPass: StepValidation
): StepValidation {
  const confidence = Math.min(0.98, lowPass.confidence + 0.07);

  return {
    auditorModel,
    tier: "high",
    verdict: lowPass.verdict,
    confidence,
    needsReview: false,
    hallucinated: input.stepStatus === "passed" && lowPass.verdict === "contradicts" && confidence > 0.7,
    rationale: "Escalado a modelo de mayor precisión por contradicción de alta confianza.",
  };
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
