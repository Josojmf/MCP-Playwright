import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { createRuntimeSmokeHarness } from "../../test/support/runtimeSmokeHarness";
import type { StepResult } from "../orchestrator/types";

let harness: Awaited<ReturnType<typeof createRuntimeSmokeHarness>>;
let saveRun: typeof import("./sqlite").saveRun;
let listRuns: typeof import("./sqlite").listRuns;
let getRun: typeof import("./sqlite").getRun;
let saveScreenshot: typeof import("./sqlite").saveScreenshot;

function buildSteps(): StepResult[] {
  return [
    {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Open the page",
      canonicalType: "given",
      status: "passed",
      tokens: { input: 10, output: 5, total: 15 },
      latencyMs: 500,
      message: "Step completed successfully",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
    {
      stepId: "step-2",
      stepIndex: 1,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Click the button",
      canonicalType: "when",
      status: "passed",
      tokens: { input: 8, output: 3, total: 11 },
      latencyMs: 300,
      message: "Action completed",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
  ];
}

async function captureDbArtifacts(label: string): Promise<void> {
  await harness.registerArtifactPath(path.join(harness.dataDir, "runs.db"), `${label}-runs-db`, {
    dataDir: harness.dataDir,
  });
}

before(async () => {
  harness = await createRuntimeSmokeHarness("sqlite-storage-smoke");
  await harness.activate();
  ({ saveRun, listRuns, getRun, saveScreenshot } = await import("./sqlite.ts"));
});

after(async () => {
  await harness.cleanup();
});

beforeEach(async () => {
  await harness.resetState();
});

describe("SQLite Repository smoke", { concurrency: 1 }, () => {
  it("saves and retrieves a persisted run", async () => {
    const runId = randomUUID();
    const steps = buildSteps();
    const result = saveRun(runId, "Test Scenario", 1, steps, "passed", {
      trustState: "degraded",
      trustReasons: ["missing_step_screenshot"],
      provider: "openai",
      orchestratorModel: "gpt-4o-mini",
      lowCostAuditorModel: "gpt-4.1-mini",
      highAccuracyAuditorModel: "gpt-4.1",
    });

    const run = getRun(runId);
    await captureDbArtifacts("sqlite-save-run");
    await harness.writeJsonArtifact("sqlite/save-run.json", run, "sqlite-save-run-detail", {
      runId,
    });

    assert.equal(result, runId, "Should return run ID");
    assert.ok(run, "Run should be retrievable");
    assert.equal(run.id, runId, "Run ID should match");
    assert.equal(run.totalSteps, 2, "Total steps should match");
    assert.equal(run.steps.length, 2, "Steps should be persisted");
    assert.ok(run.summary.includes("2 pasados"), "Summary should reflect passed steps");
    assert.equal(run.trustState, "degraded");
    assert.deepEqual(run.trustReasons, ["missing_step_screenshot"]);
    assert.equal(run.provider, "openai");
  });

  it("lists runs in descending order", async () => {
    const steps = [buildSteps()[0]];
    const runId1 = randomUUID();
    const runId2 = randomUUID();
    const runId3 = randomUUID();

    saveRun(runId1, "Run 1", 1, steps, "passed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    saveRun(runId2, "Run 2", 1, steps, "passed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    saveRun(runId3, "Run 3", 1, steps, "passed");

    const runs = listRuns(10, 0);
    await captureDbArtifacts("sqlite-list-runs");
    await harness.writeJsonArtifact("sqlite/list-runs.json", runs, "sqlite-list-runs-output");

    assert.ok(runs.length >= 3, "Should have at least 3 runs");
    const lastThree = runs.slice(0, 3);
    assert.equal(lastThree[0].id, runId3, "Most recent run should be first");
  });

  it("returns persisted metrics for a failed run", async () => {
    const runId = randomUUID();
    const steps: StepResult[] = [
      {
        ...buildSteps()[0],
        tokens: { input: 100, output: 50, total: 150 },
        latencyMs: 1000,
      },
      {
        ...buildSteps()[1],
        stepId: "step-2",
        stepIndex: 1,
        canonicalType: "then",
        status: "failed",
        message: "Assertion failed",
        tokens: { input: 50, output: 25, total: 75 },
        latencyMs: 500,
      },
    ];

    saveRun(runId, "Test Run", 1, steps, "failed");
    const run = getRun(runId);
    await captureDbArtifacts("sqlite-run-metrics");
    await harness.writeJsonArtifact("sqlite/run-metrics.json", run, "sqlite-run-metrics-output", {
      runId,
    });

    assert.ok(run, "Run should exist");
    assert.equal(run.totalTokens, 225, "Total tokens should be sum of all steps");
    assert.ok(run.estimatedCost > 0, "Should have estimated cost");
    assert.equal(run.steps[0].tokens.total, 150, "Step tokens should be parsed correctly");
  });

  it("persists screenshot metadata linked to the resolved step id", async () => {
    const runId = randomUUID();
    const steps = [
      {
        ...buildSteps()[0],
        stepId: "step-storage",
      },
    ];

    saveRun(runId, "Run", 1, steps, "passed");
    saveScreenshot(randomUUID(), runId, "step-storage", "/path/to/screenshot.png");

    const run = getRun(runId);
    await captureDbArtifacts("sqlite-screenshot-metadata");
    await harness.writeJsonArtifact(
      "sqlite/screenshot-metadata.json",
      run,
      "sqlite-screenshot-metadata-output",
      { runId },
    );

    assert.ok(run, "Run should exist");
    assert.equal(run.screenshots.length, 1, "Should have one screenshot");
    assert.equal(run.screenshots[0].path, "/path/to/screenshot.png", "Screenshot path should match");
    assert.match(run.screenshots[0].stepId, new RegExp(`^${runId}:step-storage:`));
  });
});
