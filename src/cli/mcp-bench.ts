#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import { GherkinParserService } from "../server/parser";
import { OrchestratorService } from "../server/orchestrator/OrchestratorService";
import type { MCPConfig, RunContext, StepResult } from "../server/orchestrator/types";
import { TokenBudget } from "../shared/harness/TokenBudget";
import { getLatestRunId, getRun } from "../server/storage/sqlite";
import { createProvider, ProviderConfigError } from "../shared/llm/factory";
import type { ProviderConfig, ProviderName } from "../shared/llm/types";
import type { ScenarioPlan } from "../server/parser";

type CliRunRecord = NonNullable<ReturnType<typeof getRun>>;
type CliOrchestrator = Pick<OrchestratorService, "runScenario">;

interface CliDependencies {
  readFeatureText: (resolvedPath: string) => string;
  createProvider: typeof createProvider;
  parseFeature: (featureText: string) => ScenarioPlan[];
  createOrchestrator: (provider: Awaited<ReturnType<typeof createProvider>>) => CliOrchestrator;
  now: () => number;
  log: (message: string) => void;
  error: (message: string) => void;
  getLatestRunId: () => string | undefined;
  getRun: (runId: string) => CliRunRecord | undefined;
}

function createDefaultOrchestrator(provider: Awaited<ReturnType<typeof createProvider>>): CliOrchestrator {
  const orchestrator = new OrchestratorService(provider);
  return orchestrator;
}

const defaultCliDeps: CliDependencies = {
  readFeatureText: (resolvedPath) => readFileSync(resolve(resolvedPath), "utf-8"),
  createProvider,
  parseFeature: (featureText) => new GherkinParserService().parseFeature(featureText),
  createOrchestrator: createDefaultOrchestrator,
  now: () => Date.now(),
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  getLatestRunId: () => getLatestRunId() ?? undefined,
  getRun: (runId) => getRun(runId) ?? undefined,
};

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

export async function runHeadless(
  args: Record<string, string>,
  deps: CliDependencies = defaultCliDeps
): Promise<number> {
  const baseUrl = args.url;
  const featurePath = args.feature;
  const tokenCap = Number.parseInt(args.tokenCap ?? "12000", 10);
  const selectedMcpIds = (args.mcp ?? "@playwright/mcp")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!baseUrl || !featurePath) {
    deps.error("Uso inválido: faltan --url o --feature");
    return 1;
  }

  const providerFlag = args.provider;
  if (!providerFlag) {
    deps.error(
      'Error: --provider is required.\n' +
      'Supported providers and required env vars:\n' +
      '  openrouter  -> OPENROUTER_API_KEY\n' +
      '  openai      -> OPENAI_API_KEY\n' +
      '  azure       -> AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT\n' +
      '  anthropic   -> ANTHROPIC_API_KEY'
    );
    return 1;
  }

  // D-09/Pitfall 1: CLI flag "anthropic" maps to ProviderName "claude"
  const providerName: ProviderName = providerFlag === 'anthropic'
    ? 'claude'
    : providerFlag as ProviderName;

  const providerConfig: ProviderConfig = {
    provider: providerName,
    model: args.model,  // undefined is fine — provider default applies (D-11)
  };

  let provider;
  try {
    if (deps === defaultCliDeps) {
      provider = await createProvider(providerConfig);
    } else {
      provider = await deps.createProvider(providerConfig);
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      deps.error(`Provider configuration error: ${err.message}`);
      return 1;
    }
    throw err;
  }

  const resolvedFeaturePath = resolve(featurePath);
  const featureText = deps.readFeatureText(resolvedFeaturePath);
  const scenarios = deps.parseFeature(featureText);

  const orchestrator = deps.createOrchestrator(provider);
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
          provider: providerName,
          model: args.model,
        },
      };

      const runContext: RunContext = {
        runId: `cli-${deps.now()}-${mcpId}`,
        baseUrl,
        scenario,
        mcpConfig,
        conversationHistory: [],
        tokenBudget: budget,
        abortSignal: new AbortController().signal,
      };

      const steps: Array<StepResult & { hallucinated: boolean; needsReview: boolean }> = [];
      for await (const step of orchestrator.runScenario(scenario, runContext)) {
        // Note: Vision validation now requires async LLM calls (Phase 09).
        // CLI doesn't have image buffers available, so using defaults.
        // In production, validateStepWithVision is called from runManager with real images.
        const validation = {
          hallucinated: false,
          needsReview: false,
        };

        steps.push({
          ...step,
          ...validation,
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

  if (deps === defaultCliDeps) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    deps.log(JSON.stringify(output, null, 2));
  }

  const hasFailure = results.some((mcp) =>
    mcp.scenarios.some((scenario) =>
      scenario.steps.some((step) => step.status !== "passed" || step.hallucinated)
    )
  );

  return hasFailure ? 1 : 0;
}

export function runDebug(
  args: Record<string, string>,
  deps: CliDependencies = defaultCliDeps
): number {
  const mcpFilter = args.mcp?.trim();
  const runId = args.runId?.trim() || deps.getLatestRunId();

  if (!runId) {
    deps.error("No hay runs persistidos para depurar.");
    return 1;
  }

  const run = deps.getRun(runId);
  if (!run) {
    deps.error(`Run no encontrado: ${runId}`);
    return 1;
  }

  deps.log(`Run: ${run.id}`);
  deps.log(`Nombre: ${run.name}`);
  deps.log(`Estado: ${run.status}`);
  deps.log(`Pasos: ${run.steps.length}`);
  deps.log("---");

  for (const step of run.steps) {
    if (mcpFilter && !step.mcpId.includes(mcpFilter)) {
      continue;
    }

    const validation = step.validation
      ? `vision=${step.validation.verdict} conf=${Math.round(step.validation.confidence * 100)}%`
      : "vision=n/a";

    const isHallucinated = step.validation?.hallucinated === true;
    const isNeedsReview = step.validation?.needsReview === true;
    const validationFlag = isHallucinated
      ? " [HALLUCINATED]"
      : isNeedsReview
        ? " [NEEDS-REVIEW]"
        : "";

    const stepHeader =
      `[${step.mcpId}] #${step.index + 1} ${step.canonicalType.toUpperCase()} ${step.status} ` +
      `lat=${step.latencyMs}ms red=${step.networkOverheadMs}ms tok=${step.tokens.total} ${validation}${validationFlag}`;

    const coloredHeader = isHallucinated
      ? chalk.red(stepHeader)
      : isNeedsReview
        ? chalk.yellow(stepHeader)
        : stepHeader;

    deps.log(coloredHeader);
    deps.log(`  ${step.text}`);
    deps.log(`  ${step.message}`);

    for (const toolCall of step.toolCalls) {
      if (!toolCall || typeof toolCall !== "object") {
        continue;
      }

      const callRecord = toolCall as Record<string, unknown>;
      const { toolName: rawToolName, name, args, result, error, latencyMs } = callRecord;
      const toolName = String(rawToolName ?? name ?? "unknown_tool");

      const argsText = truncateText(stringifyCompact(args), 200);
      const resultLabel = result !== undefined ? "result" : "error";
      const resultValue = result !== undefined
        ? truncateText(String(result), 150)
        : truncateText(String(error), 150);
      const latencyText = typeof latencyMs === "number" ? ` lat=${latencyMs}ms` : "";

      deps.log(`    → ${toolName}  args: ${argsText}  ${resultLabel}: ${resultValue}${latencyText}`);
    }
  }

  return 0;
}

function stringifyCompact(value: unknown): string {
  try {
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

export function parseArgs(rawArgs: string[]): Record<string, string> {
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
  console.log("mcp-bench run --url <url> --feature <file.feature> --provider <name> [--model <model>] [--mcp a,b] [--tokenCap 12000]");
  console.log("  --provider: openrouter | openai | azure | anthropic (required)");
  console.log("  --model: LLM model name (optional, provider default if omitted)");
  console.log("mcp-bench debug [--runId <runId>] [--mcp <filter>]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
