import test from "node:test";
import {
  assertCallArgumentObjectProperties,
  assertCallStringArguments,
  assertNoNormalizedFragments,
  assertNormalizedFragments,
  loadSourceContract,
} from "../test/support/sourceContracts";

const runManagerSource = loadSourceContract(new URL("./runManager.ts", import.meta.url));

test("phase12 evidence contract: run_started emits explicit executionConfig", () => {
  // D-01/D-02: keep the architectural contract, not a free-form regex snapshot.
  assertCallArgumentObjectProperties(runManagerSource, {
    callee: "this.emit",
    withinFunction: "simulateRun",
    stringArgument: {
      index: 1,
      value: "run_started",
    },
    argumentIndex: 2,
    propertyPath: ["executionConfig"],
    expectations: {
      provider: "session.config.provider",
      orchestratorModel: "session.config.orchestratorModel",
      lowCostAuditorModel: "session.config.lowCostAuditorModel",
      highAccuracyAuditorModel: "session.config.highAccuracyAuditorModel",
    },
  });
});

test("phase12 evidence contract: persisted step evidence prefers instrumented traces and degrades missing audit inputs", () => {
  assertCallArgumentObjectProperties(runManagerSource, {
    callee: "mcpResults.push",
    withinFunction: "trackStepResult",
    argumentIndex: 0,
    expectations: {
      toolCalls: "instrumentedTraces.length > 0 ? instrumentedTraces : stepResult.toolCalls",
      validation: "validation",
      networkOverheadMs: "networkOverheadMs",
      trustReasons: "trustReasons",
    },
  });

  assertCallStringArguments(runManagerSource, {
    callee: "reasons.add",
    withinFunction: "deriveStepTrustReasons",
    values: [
      "missing_tool_trace",
      "missing_step_screenshot",
      "review_only_validation",
      "unsupported_translated_assertion",
    ],
  });
});

test("phase12 evidence contract: screenshots are never fabricated and persisted runs keep trust metadata", () => {
  assertNoNormalizedFragments(runManagerSource, ["1x1 transparent PNG", "getPlaceholderScreenshot"]);
  assertNormalizedFragments(
    runManagerSource,
    ["return { screenshotId: null, screenshotPath: null }"],
    "capture fallback"
  );
  assertCallArgumentObjectProperties(runManagerSource, {
    callee: "saveRun",
    withinFunction: "persistRunResults",
    argumentIndex: 5,
    expectations: {
      trustState: "trustState",
      trustReasons: "trustReasons",
      provider: "session.config.provider",
      orchestratorModel: "session.config.orchestratorModel",
      lowCostAuditorModel: "session.config.lowCostAuditorModel",
      highAccuracyAuditorModel: "session.config.highAccuracyAuditorModel",
    },
  });
});
