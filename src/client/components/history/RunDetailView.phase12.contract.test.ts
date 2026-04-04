import test from "node:test";
import { assertJsxExpressionReferences, loadSourceContract } from "../../../test/support/sourceContracts";

test("RunDetailView renders persisted trust, config, and trace values from the run payload", () => {
  const source = loadSourceContract(new URL("./RunDetailView.tsx", import.meta.url));

  assertJsxExpressionReferences(source, [
    'run.trustState === "degraded" ? "DEGRADED" : "AUDITABLE"',
    "run.provider ?? \"-\"",
    "run.orchestratorModel ?? \"-\"",
    "run.lowCostAuditorModel ?? \"-\"",
    "run.highAccuracyAuditorModel ?? \"-\"",
    "toolCall.correlationId",
  ]);
});
