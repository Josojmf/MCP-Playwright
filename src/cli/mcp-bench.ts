#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GherkinParserService } from "../server/parser";
import { OrchestratorService } from "../server/orchestrator/OrchestratorService";
import type { MCPConfig, RunContext, StepResult } from "../server/orchestrator/types";
import { TokenBudget } from "../shared/harness/TokenBudget";
import { validateStepWithVision } from "../server/validation/visionValidator";
import { getLatestRunId, getRun } from "../server/storage/sqlite";
import type { LLMProvider, LLMRequest, LLMResponse } from "../shared/llm/types";

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);

  if (!command || command === "--help" || command === "help") {
    printHelp();
    process.exit(0);
  }

  const args = parseArgs(rawArgs);

  if (command === "run") {
    const exitCode = await runHeadless(args);
    process.exit(exitCode);
  }

  if (command === "debug") {
    const exitCode = runDebug(args);
    process.exit(exitCode);
  }

  console.error(`Comando no soportado: ${command}`);
  printHelp();
  process.exit(1);
}

async function runHeadless(args: Record<string, string>): Promise<number> {
  const baseUrl = args.url;
  const featurePath = args.feature;
  const tokenCap = Number.parseInt(args.tokenCap ?? "12000", 10);
  const selectedMcpIds = (args.mcp ?? "@playwright/mcp")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!baseUrl || !featurePath) {
    console.error("Uso inválido: faltan --url o --feature");
    return 1;
  }

  const featureText = readFileSync(resolve(featurePath), "utf-8");
  const parser = new GherkinParserService();
  const scenarios = parser.parseFeature(featureText);

  const orchestrator = new OrchestratorService(createCliProvider());
  const budget = new TokenBudget({
    hardCapTokens: Number.isFinite(tokenCap) ? tokenCap : 12000,
    warnThresholdRatio: 0.8,
  });

  const results: Array<{
    mcpId: string;
    scenarios: Array<{
      id: string;
      name: string;
      steps: Array<StepResult & { hallucinated: boolean; needsReview: boolean }>;
    }>;
  }> = [];

  for (const mcpId of selectedMcpIds) {
    const mcpResult = {
      mcpId,
      scenarios: [] as Array<{
        id: string;
        name: string;
        steps: Array<StepResult & { hallucinated: boolean; needsReview: boolean }>;
      }>,
    };

    for (const scenario of scenarios) {
      const mcpConfig: MCPConfig = {
        id: mcpId,
        provider: {
          provider: "openai",
          model: "gpt-4",
        },
      };

      const runContext: RunContext = {
        runId: `cli-${Date.now()}-${mcpId}`,
        scenario,
        mcpConfig,
        conversationHistory: [],
        tokenBudget: budget,
        abortSignal: new AbortController().signal,
      };

      const steps: Array<StepResult & { hallucinated: boolean; needsReview: boolean }> = [];
      for await (const step of orchestrator.runScenario(scenario, runContext)) {
        const validation = validateStepWithVision({
          stepStatus: step.status === "passed" ? "passed" : step.status === "failed" ? "failed" : "aborted",
          stepText: step.stepText,
          screenshotAvailable: true,
          orchestratorModel: mcpConfig.provider.model ?? "gpt-4",
        });

        steps.push({
          ...step,
          hallucinated: validation.hallucinated,
          needsReview: validation.needsReview,
        });
      }

      mcpResult.scenarios.push({
        id: scenario.id,
        name: scenario.name,
        steps,
      });
    }

    results.push(mcpResult);
  }

  const output = {
    mode: "run",
    baseUrl,
    featurePath: resolve(featurePath),
    selectedMcpIds,
    generatedAt: new Date().toISOString(),
    results,
  };

  console.log(JSON.stringify(output, null, 2));

  const hasFailure = results.some((mcp) =>
    mcp.scenarios.some((scenario) =>
      scenario.steps.some((step) => step.status !== "passed" || step.hallucinated)
    )
  );

  return hasFailure ? 1 : 0;
}

function runDebug(args: Record<string, string>): number {
  const mcpFilter = args.mcp?.trim();
  const runId = args.runId?.trim() || getLatestRunId();

  if (!runId) {
    console.error("No hay runs persistidos para depurar.");
    return 1;
  }

  const run = getRun(runId);
  if (!run) {
    console.error(`Run no encontrado: ${runId}`);
    return 1;
  }

  console.log(`Run: ${run.id}`);
  console.log(`Nombre: ${run.name}`);
  console.log(`Estado: ${run.status}`);
  console.log(`Pasos: ${run.steps.length}`);
  console.log("---");

  for (const step of run.steps) {
    if (mcpFilter && !step.mcpId.includes(mcpFilter)) {
      continue;
    }

    const validation = step.validation
      ? `vision=${step.validation.verdict} conf=${Math.round(step.validation.confidence * 100)}%`
      : "vision=n/a";

    console.log(
      `[${step.mcpId}] #${step.index + 1} ${step.canonicalType.toUpperCase()} ${step.status} ` +
        `lat=${step.latencyMs}ms red=${step.networkOverheadMs}ms tok=${step.tokens.total} ${validation}`
    );
    console.log(`  ${step.text}`);
    console.log(`  ${step.message}`);
  }

  return 0;
}

function parseArgs(rawArgs: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let i = 0; i < rawArgs.length; i += 1) {
    const current = rawArgs[i];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = rawArgs[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = next;
    i += 1;
  }

  return parsed;
}

function printHelp() {
  console.log("mcp-bench run --url <url> --feature <file.feature> [--mcp a,b] [--tokenCap 12000]");
  console.log("mcp-bench debug [--runId <runId>] [--mcp <filter>]");
}

function createCliProvider(): LLMProvider {
  return {
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const lastMessage = request.messages[request.messages.length - 1];
      const syntheticText = `CLI mock ejecutado: ${lastMessage?.content ?? "step"}`;
      const promptTokens = Math.max(1, Math.ceil(JSON.stringify(request.messages).length / 8));
      const completionTokens = Math.max(1, Math.ceil(syntheticText.length / 8));
      return {
        id: `cli-${Date.now()}`,
        model: request.model,
        choices: [
          {
            index: 0,
            finishReason: "stop",
            message: {
              role: "assistant",
              content: syntheticText,
            },
          },
        ],
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    },
    async *stream(_request: LLMRequest) {
      yield {
        delta: "cli-mock",
      };
    },
    async estimateCost(inputTokens: number, outputTokens: number, _model: string) {
      return (inputTokens + outputTokens) * 0.000005;
    },
  };
}

void main();
