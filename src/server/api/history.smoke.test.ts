import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import Fastify from "fastify";
import { createRuntimeSmokeHarness } from "../../test/support/runtimeSmokeHarness";
import type { StepResult } from "../orchestrator/types";

let harness: Awaited<ReturnType<typeof createRuntimeSmokeHarness>>;
let registerHistoryRoutes: typeof import("./history").registerHistoryRoutes;
let saveRun: typeof import("../storage/sqlite").saveRun;

function buildStep(stepId: string, stepIndex: number, status: StepResult["status"]): StepResult {
  return {
    stepId,
    stepIndex,
    scenarioId: "scenario-1",
    scenarioName: "Scenario",
    stepText: `Paso ${stepIndex + 1}`,
    canonicalType: stepIndex === 0 ? "given" : "then",
    status,
    tokens: {
      input: status === "failed" ? 50 : 100,
      output: status === "failed" ? 25 : 50,
      total: status === "failed" ? 75 : 150,
    },
    latencyMs: status === "failed" ? 500 : 1000,
    message: status === "failed" ? "Falló" : "Completado",
    toolCalls: [],
    timestamp: new Date().toISOString(),
  };
}

async function createHistoryServer() {
  const server = Fastify();
  await registerHistoryRoutes(server);
  return server;
}

before(async () => {
  harness = await createRuntimeSmokeHarness("history-api-smoke");
  await harness.activate();
  ({ registerHistoryRoutes } = await import("./history.ts"));
  ({ saveRun } = await import("../storage/sqlite.ts"));
});

after(async () => {
  await harness.cleanup();
});

beforeEach(async () => {
  await harness.resetState();
});

describe("History API smoke", { concurrency: 1 }, () => {
  it("returns persisted runs from GET /api/history", async () => {
    const server = await createHistoryServer();

    try {
      saveRun(randomUUID(), "Run 1", 1, [buildStep("step-1", 0, "passed")], "passed");
      saveRun(randomUUID(), "Run 2", 1, [buildStep("step-1", 0, "passed")], "passed");

      const response = await server.inject({
        method: "GET",
        url: "/api/history",
      });

      await harness.writeArtifact(
        "history-api/list-response.json",
        response.body,
        "history-api-list-response",
        { statusCode: response.statusCode },
      );

      assert.equal(response.statusCode, 200, "Should return 200");

      const body = JSON.parse(response.body);
      assert.equal(body.status, "success");
      assert.ok(Array.isArray(body.data), "Data should be an array");
      assert.ok(body.data.length >= 2, "Should have at least 2 runs");
      assert.ok(body.pagination, "Should have pagination info");
    } finally {
      await server.close();
    }
  });

  it("returns run detail metadata from GET /api/history/:id", async () => {
    const server = await createHistoryServer();
    const runId = randomUUID();

    try {
      saveRun(
        runId,
        "Test",
        1,
        [buildStep("step-1", 0, "passed"), buildStep("step-2", 1, "failed")],
        "failed",
        {
          trustState: "degraded",
          trustReasons: ["missing_step_screenshot", "review_only_validation"],
          provider: "openai",
          orchestratorModel: "gpt-4o-mini",
          lowCostAuditorModel: "gpt-4.1-mini",
          highAccuracyAuditorModel: "gpt-4.1",
        },
      );

      const response = await server.inject({
        method: "GET",
        url: `/api/history/${runId}`,
      });

      await harness.writeArtifact(
        "history-api/detail-response.json",
        response.body,
        "history-api-detail-response",
        { runId, statusCode: response.statusCode },
      );

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
      assert.equal(body.data.trustState, "degraded");
      assert.deepEqual(body.data.trustReasons, ["missing_step_screenshot", "review_only_validation"]);
      assert.equal(body.data.provider, "openai");
    } finally {
      await server.close();
    }
  });

  it("exports persisted run JSON with attachment headers", async () => {
    const server = await createHistoryServer();
    const runId = randomUUID();

    try {
      saveRun(runId, "Export JSON", 1, [buildStep("step-1", 0, "passed")], "passed");

      const response = await server.inject({
        method: "GET",
        url: `/api/history/${runId}/export.json`,
      });

      await harness.writeArtifact(
        "history-api/export-run.json",
        response.body,
        "history-api-export-json",
        { runId, statusCode: response.statusCode },
      );

      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"] ?? ""), /application\/json/);
      assert.match(String(response.headers["content-disposition"] ?? ""), /attachment; filename="run-/);

      const body = JSON.parse(response.body);
      assert.equal(body.id, runId);
      assert.equal(body.steps.length, 1);
    } finally {
      await server.close();
    }
  });

  it("exports persisted run CSV with trust metadata", async () => {
    const server = await createHistoryServer();
    const runId = randomUUID();

    try {
      saveRun(
        runId,
        "Export CSV",
        1,
        [buildStep("step-1", 0, "passed"), buildStep("step-2", 1, "failed")],
        "failed",
        {
          trustState: "degraded",
          trustReasons: ["missing_step_screenshot"],
          provider: "openai",
          orchestratorModel: "gpt-4o-mini",
          lowCostAuditorModel: "gpt-4.1-mini",
          highAccuracyAuditorModel: "gpt-4.1",
        },
      );

      const response = await server.inject({
        method: "GET",
        url: `/api/history/${runId}/export.csv`,
      });

      await harness.writeArtifact(
        "history-api/export-run.csv",
        response.body,
        "history-api-export-csv",
        { runId, statusCode: response.statusCode },
      );

      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"] ?? ""), /text\/csv/);
      assert.match(response.body, /trustState/);
      assert.match(response.body, /gpt-4o-mini/);
    } finally {
      await server.close();
    }
  });

  it("returns 404 for unknown runs", async () => {
    const server = await createHistoryServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/history/nonexistent-id",
      });

      await harness.writeArtifact(
        "history-api/not-found.json",
        response.body,
        "history-api-not-found-response",
        { statusCode: response.statusCode },
      );

      assert.equal(response.statusCode, 404, "Should return 404");

      const body = JSON.parse(response.body);
      assert.equal(body.status, "error");
      assert.ok(body.message.includes("no encontrada"));
    } finally {
      await server.close();
    }
  });
});
