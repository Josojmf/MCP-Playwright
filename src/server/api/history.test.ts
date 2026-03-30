import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { registerHistoryRoutes } from "./history";
import { saveRun, closeDb } from "../storage/sqlite";
import { StepResult } from "../orchestrator/types";

test("History API - GET /api/history returns list of runs", async () => {
  const server = Fastify();
  await registerHistoryRoutes(server);

  // Save test data
  const steps: StepResult[] = [
    {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test",
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

  saveRun(randomUUID(), "Run 1", 1, steps, "passed");
  saveRun(randomUUID(), "Run 2", 1, steps, "passed");

  const response = await server.inject({
    method: "GET",
    url: "/api/history",
  });

  assert.equal(response.statusCode, 200, "Should return 200");

  const body = JSON.parse(response.body);
  assert.equal(body.status, "success");
  assert.ok(Array.isArray(body.data), "Data should be an array");
  assert.ok(body.data.length >= 2, "Should have at least 2 runs");
  assert.ok(body.pagination, "Should have pagination info");

  await server.close();
  closeDb();
});

test("History API - GET /api/history/:id returns run detail with metadata", async () => {
  closeDb();

  const server = Fastify();
  await registerHistoryRoutes(server);

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
      message: "Completado",
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
      message: "Falló",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    },
  ];

  saveRun(runId, "Test", 1, steps, "failed");

  const response = await server.inject({
    method: "GET",
    url: `/api/history/${runId}`,
  });

  assert.equal(response.statusCode, 200, "Should return 200");

  const body = JSON.parse(response.body);
  assert.equal(body.status, "success");
  assert.equal(body.data.id, runId);
  assert.ok(body.data.steps, "Should have steps");
  assert.equal(body.data.steps.length, 2, "Should have 2 steps");
  assert.ok(body.data.metadata, "Should have metadata");
  assert.ok(body.data.metadata.totalTokens > 0, "Should have total tokens");
  assert.ok(body.data.metadata.failureStats, "Should have failure stats");
  assert.equal(body.data.metadata.failureStats.totalFailed, 1, "Should count 1 failed step");
  assert.equal(body.data.metadata.failureStats.totalPassed, 1, "Should count 1 passed step");

  await server.close();
  closeDb();
});

test("History API - GET /api/history/:id returns 404 for missing run", async () => {
  closeDb();

  const server = Fastify();
  await registerHistoryRoutes(server);

  const response = await server.inject({
    method: "GET",
    url: `/api/history/nonexistent-id`,
  });

  assert.equal(response.statusCode, 404, "Should return 404");

  const body = JSON.parse(response.body);
  assert.equal(body.status, "error");
  assert.ok(body.message.includes("no encontrada"));

  await server.close();
  closeDb();
});
