import test from "node:test";
import assert from "node:assert/strict";

import { PhaseOneRunManager, RequestValidationError } from "./runManager";
import {
  buildEstimateRequest,
  loggerStub,
  withEnv,
} from "../test/support/runtimeFixtures";

test("estimateRun acepta baseUrl sin esquema y la normaliza implícitamente", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const estimate = manager.estimateRun({
    baseUrl: "google.es",
    featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page\n    When User search for "Cucumber BDD"\n    Then User should see results related to "Cucumber BDD"`,
    selectedMcpIds: ["@playwright/mcp"],
    tokenCap: 12000,
    provider: "openai",
  });

  assert.equal(estimate.scenarioCount, 1);
  assert.equal(estimate.stepCount, 3);
  assert.equal(estimate.selectedMcpCount, 1);
});

test("estimateRun acepta Gherkin shorthand Given/When/Then sin Feature:", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const estimate = manager.estimateRun({
    baseUrl: "https://google.es",
    featureText: `Given User is on google page\nWhen User search for "Cucumber BDD"\nThen User should see results related to "Cucumber BDD"`,
    selectedMcpIds: ["@playwright/mcp"],
    tokenCap: 12000,
    provider: "openai",
  });

  assert.equal(estimate.scenarioCount, 1);
  assert.equal(estimate.stepCount, 3);
  assert.equal(estimate.totalExecutions, 3);
});

test("estimateRun mantiene error para URL claramente inválida", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  assert.throws(
    () =>
      manager.estimateRun({
        baseUrl: "http://",
        featureText: `Feature: Demo\n  Scenario: x\n    Given paso`,
        selectedMcpIds: ["@playwright/mcp"],
        tokenCap: 12000,
        provider: "openai",
      }),
    (error) => error instanceof RequestValidationError && /Base URL no es válido/i.test(error.message)
  );
});

test("estimateRun normaliza aliases de MCP y elimina duplicados/no soportados", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const estimate = manager.estimateRun({
    baseUrl: "https://google.es",
    featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page\n    When User search for "Cucumber BDD"\n    Then User should see results related to "Cucumber BDD"`,
    selectedMcpIds: ["puppeteer", "@modelcontextprotocol/server-puppeteer", "browserbase", "no-existe"],
    tokenCap: 12000,
    provider: "openai",
  });

  assert.equal(estimate.selectedMcpCount, 2);
  assert.equal(estimate.totalExecutions, 6);
});

test("estimateRun falla si no queda ningún MCP soportado tras normalizar", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  assert.throws(
    () =>
      manager.estimateRun({
        baseUrl: "https://google.es",
        featureText: `Feature: Demo\n  Scenario: x\n    Given paso`,
        selectedMcpIds: ["inexistente-1", "inexistente-2"],
        tokenCap: 12000,
        provider: "openai",
      }),
    (error) => error instanceof RequestValidationError && /mcp soportado/i.test(error.message)
  );
});

test("createRun usa lowCostAuditorModel gpt-4.1-mini y highAccuracyAuditorModel gpt-4.1 por defecto", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const run = manager.createRun(
    buildEstimateRequest({
      featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
      provider: "openai",
      orchestratorModel: "gpt-4o",
    })
  );

  assert.ok(run.runId);
});

test("createRun falla si lowCostAuditorModel == orchestratorModel", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  assert.throws(
    () =>
      manager.createRun({
        baseUrl: "https://google.es",
        featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
        selectedMcpIds: ["@playwright/mcp"],
        tokenCap: 12000,
        provider: "openai",
        orchestratorModel: "gpt-4o",
        lowCostAuditorModel: "gpt-4o",
        highAccuracyAuditorModel: "gpt-4.1",
      }),
    (error) => error instanceof RequestValidationError && /low-cost auditor/i.test(error.message)
  );
});

test("createRun falla si highAccuracyAuditorModel == orchestratorModel", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  assert.throws(
    () =>
      manager.createRun({
        baseUrl: "https://google.es",
        featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
        selectedMcpIds: ["@playwright/mcp"],
        tokenCap: 12000,
        provider: "openai",
        orchestratorModel: "gpt-4o",
        lowCostAuditorModel: "gpt-4.1-mini",
        highAccuracyAuditorModel: "gpt-4o",
      }),
    (error) => error instanceof RequestValidationError && /high-accuracy auditor/i.test(error.message)
  );
});

test("createRun persiste execution config por defecto sin contaminar process.env global", async () => {
  await withEnv(
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: undefined,
      ANTHROPIC_API_KEY: undefined,
      AZURE_OPENAI_API_KEY: undefined,
      AZURE_OPENAI_ENDPOINT: undefined,
      OPENROUTER_API_KEY: undefined,
      OPEN_ROUTER_API_KEY: undefined,
    },
    () => {
      const manager = new PhaseOneRunManager(loggerStub);
      const run = manager.createRun(
        buildEstimateRequest({
          provider: undefined,
          orchestratorModel: undefined,
          lowCostAuditorModel: undefined,
          highAccuracyAuditorModel: undefined,
        })
      );

      const session = (manager as any).sessions.get(run.runId);
      assert.ok(session, "expected in-memory session to exist after createRun");
      assert.equal(session.config.provider, "openai");
      assert.equal(session.config.orchestratorModel, "gpt-4o-mini");
      assert.equal(session.config.lowCostAuditorModel, "gpt-4.1-mini");
      assert.equal(session.config.highAccuracyAuditorModel, "gpt-4.1");
      assert.deepEqual(session.config.selectedMcpIds, ["@playwright/mcp"]);
      assert.equal(session.started, false);
    }
  );
});

test("createRun conserva MCPs normalizados y estimate coherente para ejecucion determinista", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const run = manager.createRun(
    buildEstimateRequest({
      baseUrl: "example.com",
      featureText: `Given I open the homepage\nWhen I submit credentials\nThen I should see the dashboard`,
      selectedMcpIds: [" browserbase ", "puppeteer", "@browserbasehq/mcp", "desconocido"],
      provider: "openai",
      orchestratorModel: "gpt-4o",
    })
  );

  const session = (manager as any).sessions.get(run.runId);
  assert.deepEqual(session.config.selectedMcpIds, ["@browserbasehq/mcp", "@modelcontextprotocol/server-puppeteer"]);
  assert.equal(session.plan.length, 1);
  assert.equal(session.plan[0].steps.length, 3);
  assert.equal(run.estimate.totalExecutions, 6);
  assert.equal(run.estimate.withinBudget, true);
});
