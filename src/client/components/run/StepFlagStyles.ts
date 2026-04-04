import type { CSSProperties } from "react";

interface StepFlagInput {
  hallucinated?: boolean;
  needsReview?: boolean;
}

interface StepFlagStylesResult {
  accentColor: string | null;
  containerStyle: CSSProperties | null;
  icon: "hallucinated" | "needsReview" | null;
  label: string | null;
}

const HALLUCINATED_STYLE: CSSProperties = {
  background: "color-mix(in srgb, var(--app-danger) 10%, var(--app-panel))",
  borderLeft: "3px solid color-mix(in srgb, var(--app-danger) 30%, transparent)",
};

const NEEDS_REVIEW_STYLE: CSSProperties = {
  background: "color-mix(in srgb, var(--app-warning) 10%, var(--app-panel))",
  borderLeft: "3px solid color-mix(in srgb, var(--app-warning) 30%, transparent)",
};

export function getStepFlagStyles(step: StepFlagInput): StepFlagStylesResult {
  if (step.hallucinated) {
    return {
      accentColor: "var(--app-danger)",
      containerStyle: HALLUCINATED_STYLE,
      icon: "hallucinated",
      label: "[HALLUCINATED]",
    };
  }

  if (step.needsReview) {
    return {
      accentColor: "var(--app-warning)",
      containerStyle: NEEDS_REVIEW_STYLE,
      icon: "needsReview",
      label: "[NEEDS REVIEW]",
    };
  }

  return {
    accentColor: null,
    containerStyle: null,
    icon: null,
    label: null,
  };
}
