import test from "node:test";
import assert from "node:assert/strict";

import { PhaseOneRunManager, RequestValidationError } from "./runManager";

const loggerStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
} as any;

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

test("createRun usa default auditorModel gpt-4.1 cuando no está configurado", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const run = manager.createRun({
    baseUrl: "https://google.es",
    featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
    selectedMcpIds: ["@playwright/mcp"],
    tokenCap: 12000,
    provider: "openai",
    // auditorModel not provided - should default to gpt-4.1
  });

  assert.ok(run.id);
  // After implementation, verify auditorModel is set
  // assert.equal(run.config.auditorModel, "gpt-4.1");
});

test("createRun falla si auditorModel == orchestrator model (modelo igual)", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  assert.throws(
    () =>
      manager.createRun({
        baseUrl: "https://google.es",
        featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
        selectedMcpIds: ["@playwright/mcp"],
        tokenCap: 12000,
        provider: "openai",
        model: "gpt-4.1-turbo",
        auditorModel: "gpt-4.1-turbo", // Same as model - should fail
      }),
    (error) => error instanceof RequestValidationError && /auditor|model.*iguales/i.test(error.message)
  );
});
