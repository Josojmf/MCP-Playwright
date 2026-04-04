import test from "node:test";
import {
  assertCallArgumentObjectProperties,
  assertJsxExpressionReferences,
  assertNormalizedFragments,
  assertVariableObjectProperties,
  loadSourceContract,
} from "../test/support/sourceContracts";

const appSource = loadSourceContract(new URL("./App.tsx", import.meta.url));

test("phase12 contract: App persists and sends explicit run configuration", () => {
  assertCallArgumentObjectProperties(appSource, {
    callee: "localStorage.setItem",
    withinFunction: "App",
    argumentIndex: 1,
    unwrapCall: "JSON.stringify",
    expectations: {
      provider: "provider",
      orchestratorModel: "orchestratorModel",
      lowCostAuditorModel: "lowCostAuditorModel",
      highAccuracyAuditorModel: "highAccuracyAuditorModel",
      selectedMcpIds: "selectedMcpIds",
    },
  });
  assertVariableObjectProperties(
    appSource,
    "requestBody",
    {
      provider: "provider",
      orchestratorModel: "orchestratorModel.trim()",
      lowCostAuditorModel: "lowCostAuditorModel.trim()",
      highAccuracyAuditorModel: "highAccuracyAuditorModel.trim()",
      selectedMcpIds: "selectedMcpIds",
    },
    {
      withinFunction: "App",
    }
  );
});

test("phase12 contract: App routes live execution config from SSE into the run surfaces", () => {
  // D-02/D-03: keep the payload wiring, drop label-only text checks.
  assertNormalizedFragments(appSource, [
    'source.addEventListener("run_started", (event) => {',
    "const executionConfig = parseExecutionConfig(data.executionConfig)",
    "nextRunMeta[mcpId] = { executionConfig, trustState: \"AUDITABLE\", trustReasons: [], }",
    'trustState: trustState === "degraded" ? "DEGRADED" : "AUDITABLE"',
  ], "run_started SSE wiring");
  assertJsxExpressionReferences(appSource, [
    "aggregateTrustState",
    "activeRunMeta.executionConfig.provider",
    "activeRunMeta.executionConfig.orchestratorModel",
    "activeRunMeta.executionConfig.lowCostAuditorModel",
    "activeRunMeta.executionConfig.highAccuracyAuditorModel",
    "runMetaByMcp",
  ]);
});
