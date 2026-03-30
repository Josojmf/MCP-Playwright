import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { saveRun, listRuns, getRun, saveScreenshot, closeDb } from "./sqlite";
import { StepResult } from "../orchestrator/types";

test("SQLite Repository - save and retrieve run", async () => {
  const runId = randomUUID();
  const steps: StepResult[] = [
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

  const result = saveRun(runId, "Test Scenario", 1, steps, "passed");

  assert.equal(result, runId, "Should return run ID");

  const run = getRun(runId);
  assert.ok(run, "Run should be retrievable");
  assert.equal(run.id, runId, "Run ID should match");
  assert.equal(run.totalSteps, 2, "Total steps should match");
  assert.equal(run.steps.length, 2, "Steps should be persisted");
  assert.ok(run.summary.includes("2 pasados"), "Summary should reflect passed steps");

  closeDb();
});

test("SQLite Repository - list runs in descending order", async () => {
  closeDb(); // reset

  const runId1 = randomUUID();
  const runId2 = randomUUID();
  const runId3 = randomUUID();

  const steps: StepResult[] = [
    {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Scenario",
      stepText: "Step 1",
      canonicalType: "given",
      status: "passed",
      tokens: { input: 10, output: 5, total: 15 },
      latencyMs: 100,
      message: "OK",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
  ];

  // Save runs with small delays to ensure ordering
  saveRun(runId1, "Run 1", 1, steps, "passed");
  await new Promise((r) => setTimeout(r, 10));
  saveRun(runId2, "Run 2", 1, steps, "passed");
  await new Promise((r) => setTimeout(r, 10));
  saveRun(runId3, "Run 3", 1, steps, "passed");

  const runs = listRuns(10, 0);

  // Should be in descending order (most recent first)
  assert.ok(runs.length >= 3, "Should have at least 3 runs");
  const lastThree = runs.slice(0, 3);
  assert.equal(lastThree[0].id, runId3, "Most recent run should be first");

  closeDb();
});

test("SQLite Repository - get run with metrics", async () => {
  closeDb(); // reset

  const runId = randomUUID();
  const steps: StepResult[] = [
    {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Scenario",
      stepText: "Paso 1",
      canonicalType: "given",
      status: "passed",
      tokens: { input: 100, output: 50, total: 150 },
      latencyMs: 1000,
      message: "OK",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
    {
      stepId: "step-2",
      stepIndex: 1,
      scenarioId: "scenario-1",
      scenarioName: "Scenario",
      stepText: "Paso 2",
      canonicalType: "then",
      status: "failed",
      tokens: { input: 50, output: 25, total: 75 },
      latencyMs: 500,
      message: "Assertion failed",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
  ];

  saveRun(runId, "Test Run", 1, steps, "failed");
  const run = getRun(runId);

  assert.ok(run, "Run should exist");
  assert.equal(run.totalTokens, 225, "Total tokens should be sum of all steps");
  assert.ok(run.estimatedCost > 0, "Should have estimated cost");
  assert.ok(run.steps[0].tokens.total === 150, "Step tokens should be parsed correctly");

  closeDb();
});

test("SQLite Repository - save screenshot", async () => {
  closeDb(); // reset

  const runId = randomUUID();
  const stepId = randomUUID();
  const screenshotId = randomUUID();

  const steps: StepResult[] = [
    {
      stepId,
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Scenario",
      stepText: "Step",
      canonicalType: "given",
      status: "passed",
      tokens: { input: 10, output: 5, total: 15 },
      latencyMs: 100,
      message: "OK",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
  ];

  saveRun(runId, "Run", 1, steps, "passed");
  saveScreenshot(screenshotId, runId, stepId, "/path/to/screenshot.png");

  const run = getRun(runId);
  assert.ok(run, "Run should exist");
  assert.equal(run.screenshots.length, 1, "Should have one screenshot");
  assert.equal(run.screenshots[0].path, "/path/to/screenshot.png", "Screenshot path should match");

  closeDb();
});
