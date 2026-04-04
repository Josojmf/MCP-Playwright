import test from "node:test";
import {
  assertJsxExpressionReferences,
  assertNormalizedFragments,
  loadSourceContract,
} from "../../../test/support/sourceContracts";

test("RunScorecard derives trust and execution config values from runMetaByMcp", () => {
  const source = loadSourceContract(new URL("./RunScorecard.tsx", import.meta.url));

  assertNormalizedFragments(source, [
    'const trust = Object.values(runMetaByMcp).some((meta) => meta.trustState === "DEGRADED") ? "DEGRADED" : "AUDITABLE"',
    "const trustReasons = [...new Set(Object.values(runMetaByMcp).flatMap((meta) => meta.trustReasons))]",
  ], "RunScorecard trust aggregation");
  assertJsxExpressionReferences(source, [
    "trust",
    "firstMeta.executionConfig.provider",
    "firstMeta.executionConfig.orchestratorModel",
    "firstMeta.executionConfig.lowCostAuditorModel",
    "firstMeta.executionConfig.highAccuracyAuditorModel",
  ]);
});
