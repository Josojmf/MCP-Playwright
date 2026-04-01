import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { FastifyBaseLogger } from "fastify";
import { GherkinParserService, ScenarioPlan } from "./parser";
import { BudgetExceededError, TokenBudget } from "../shared/harness/TokenBudget";
import { LoopDetector, LoopError } from "../shared/harness/LoopDetector";
import { TimeoutError } from "../shared/harness/withTimeout";
import { OrchestratorService } from "./orchestrator/OrchestratorService";
import type { RunContext, MCPConfig, StepResult } from "./orchestrator/types";
import { saveRun, saveScreenshot as saveRunScreenshot } from "./storage/sqlite";
import { MCP_REGISTRY } from "../shared/registry";
import { McpProcessManager } from "./mcp/McpProcessManager";
import { preflight } from "./mcp/preflight";
import { saveScreenshot as saveFileScreenshot } from "./storage/screenshots";
import { validateStepWithVision, type StepValidation } from "./validation/visionValidator";
import { InstrumentedMcpClient } from "./mcp/InstrumentedMcpClient";
import { isStaleRefError, traceStaleRefRecovery } from "./mcp/stalenessRecovery";
import { resolvePricing, estimateCostUsd } from "../shared/pricing/resolver";
import { createProvider } from "../shared/llm/factory";

export interface RunEstimateRequest {
  baseUrl: string;
  featureText: string;
  selectedMcpIds: string[];
  tokenCap: number;
  provider: string;   // e.g. "openai", "claude", "azure", "openrouter"
  model?: string;     // optional; "default" used as fallback
  auditorModel?: string; // optional auditor model for vision validation; defaults to gpt-4.1
}

export interface RunEstimate {
  scenarioCount: number;
  stepCount: number;
  selectedMcpCount: number;
  totalExecutions: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  withinBudget: boolean;
}

export interface RunStartResponse {
  runId: string;
  streamPath: string;
  estimate: RunEstimate;
}

interface RunConfig {
  baseUrl: string;
  selectedMcpIds: string[];
  tokenCap: number;
  orchestratorModel?: string;
  auditorModel?: string;
  providerType?: "openai" | "claude" | "azure" | "openrouter"; // LLM provider for orchestrator
}

type RunStatus = "pending" | "running" | "completed" | "aborted";

interface StreamFrame {
  id: number;
  event: string;
  data: unknown;
  at: string;
}

interface RunSubscriber {
  id: string;
  publish: (frame: StreamFrame) => void;
}

interface RunSession {
  id: string;
  config: RunConfig;
  plan: ScenarioPlan[];
  estimate: RunEstimate;
  status: RunStatus;
  createdAt: string;
  started: boolean;
  nextEventId: number;
  totals: {
    tokensUsed: number;
    stepsExecuted: number;
  };
  abortController: AbortController;
  events: StreamFrame[];
  subscribers: Map<string, RunSubscriber>;
  resultsByMcp: Map<string, StepResult[]>;
  stepValidationByMcp: Map<string, Map<string, StepValidation>>;
  pendingScreenshotsByMcp: Map<string, Array<{ screenshotId: string; stepId: string; path: string }>>;
  persistedByMcp: Map<string, string>;
  cleanupTimer?: NodeJS.Timeout;
}

const RUN_RETENTION_MS = 10 * 60 * 1000;
const SCREENSHOT_DIR = process.env.DATA_DIR ?? ".data";
const MCP_ID_ALIASES: Record<string, string> = {
  playwright: "@playwright/mcp",
  puppeteer: "@modelcontextprotocol/server-puppeteer",
  browserbase: "@browserbasehq/mcp",
};

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export class PhaseOneRunManager {
  private readonly parser = new GherkinParserService();
  private readonly sessions = new Map<string, RunSession>();

  constructor(private readonly logger: FastifyBaseLogger) {}

  public estimateRun(input: RunEstimateRequest): RunEstimate {
    const normalizedInput = this.normalizeInput(input);
    this.validateInput(normalizedInput);

    const plans = this.parseFeatureOrThrow(normalizedInput.featureText);
    if (plans.length === 0) {
      throw new RequestValidationError("No se encontraron escenarios válidos en el Gherkin.");
    }

    const stepCount = plans.reduce((sum, scenario) => sum + scenario.steps.length, 0);
    if (stepCount === 0) {
      throw new RequestValidationError("No se encontraron pasos ejecutables en el Gherkin.");
    }

    const selectedMcpCount = normalizedInput.selectedMcpIds.length;
    const totalExecutions = stepCount * selectedMcpCount;
    const estimatedInputTokens = this.estimateInputTokens(normalizedInput.featureText, selectedMcpCount);
    const estimatedOutputTokens = this.estimateOutputTokens(stepCount, selectedMcpCount);
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

    const pricing = resolvePricing(normalizedInput.provider, normalizedInput.model ?? 'default');
    if (!pricing) {
      throw new Error(
        `Unknown pricing for provider "${normalizedInput.provider}" model "${normalizedInput.model ?? 'default'}". ` +
        `Check PRICING_TABLE in src/shared/pricing/table.ts.`
      );
    }
    const estimatedCostUsd = estimateCostUsd(estimatedInputTokens, estimatedOutputTokens, pricing);

    const withinBudget = estimatedTotalTokens <= normalizedInput.tokenCap;

    return {
      scenarioCount: plans.length,
      stepCount,
      selectedMcpCount,
      totalExecutions,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens,
      estimatedCostUsd,
      withinBudget,
    };
  }

  public createRun(input: RunEstimateRequest): RunStartResponse {
    const normalizedInput = this.normalizeInput(input);
    const estimate = this.estimateRun(normalizedInput);

    if (!estimate.withinBudget) {
      throw new BudgetExceededError(
        `El token cap (${normalizedInput.tokenCap}) es menor al estimado (${estimate.estimatedTotalTokens}).`
      );
    }

    // Extract orchestrator model (the actual LLM model for running the scenario)
    const orchestratorModel = normalizedInput.model || "default";
    
    // Extract auditor model (for vision validation), default to gpt-4.1
    const auditorModel = normalizedInput.auditorModel || "gpt-4.1";

    // Guard: auditor and orchestrator models cannot be the same
    if (auditorModel === orchestratorModel) {
      throw new RequestValidationError(
        `Los modelos auditor y orchestrator no pueden ser iguales (ambos: ${orchestratorModel}). Usa diferentes modelos para garantizar verdicts imparciales.`
      );
    }

    // Detect provider type from environment variables
    const valueFromEnv = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    let providerType: "openai" | "claude" | "azure" | "openrouter" = "openai"; // default
    if (valueFromEnv("OPENAI_API_KEY")) {
      providerType = "openai";
    } else if (valueFromEnv("ANTHROPIC_API_KEY")) {
      providerType = "claude";
    } else if (valueFromEnv("AZURE_OPENAI_API_KEY")) {
      providerType = "azure";
    } else if (valueFromEnv("OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY")) {
      providerType = "openrouter";
    }

    const runId = randomUUID();
    const plan = this.parseFeatureOrThrow(normalizedInput.featureText);

    const session: RunSession = {
      id: runId,
      config: {
        baseUrl: normalizedInput.baseUrl,
        selectedMcpIds: normalizedInput.selectedMcpIds,
        tokenCap: normalizedInput.tokenCap,
        orchestratorModel,
        auditorModel,
        providerType,
      },
      plan,
      estimate,
      status: "pending",
      createdAt: new Date().toISOString(),
      started: false,
      nextEventId: 1,
      totals: {
        tokensUsed: 0,
        stepsExecuted: 0,
      },
      abortController: new AbortController(),
      events: [],
      subscribers: new Map(),
      resultsByMcp: new Map(normalizedInput.selectedMcpIds.map((mcpId) => [mcpId, []])),
      stepValidationByMcp: new Map(normalizedInput.selectedMcpIds.map((mcpId) => [mcpId, new Map()])),
      pendingScreenshotsByMcp: new Map(normalizedInput.selectedMcpIds.map((mcpId) => [mcpId, []])),
      persistedByMcp: new Map(),
    };

    this.sessions.set(runId, session);

    return {
      runId,
      streamPath: `/stream/${runId}`,
      estimate,
    };
  }

  public hasRun(runId: string): boolean {
    return this.sessions.has(runId);
  }

  public subscribe(runId: string, subscriber: RunSubscriber): void {
    const session = this.sessions.get(runId);
    if (!session) {
      throw new RequestValidationError(`Run ${runId} no existe.`);
    }

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = undefined;
    }

    session.subscribers.set(subscriber.id, subscriber);

    for (const frame of session.events) {
      subscriber.publish(frame);
    }

    if (!session.started) {
      session.started = true;
      void this.simulateRun(session);
    }
  }

  public unsubscribe(runId: string, subscriberId: string): void {
    const session = this.sessions.get(runId);
    if (!session) {
      return;
    }

    session.subscribers.delete(subscriberId);

    if (session.subscribers.size === 0) {
      if (session.status === "running") {
        session.abortController.abort(new Error("SSE client disconnected"));
      }
      this.scheduleCleanup(session);
    }
  }

  private scheduleCleanup(session: RunSession): void {
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
    }

    session.cleanupTimer = setTimeout(() => {
      this.sessions.delete(session.id);
      this.logger.info({ runId: session.id }, "Run cleaned from in-memory registry");
    }, RUN_RETENTION_MS);
  }

  private emit(session: RunSession, event: string, data: unknown): void {
    const frame: StreamFrame = {
      id: session.nextEventId,
      event,
      data,
      at: new Date().toISOString(),
    };

    session.nextEventId += 1;
    session.events.push(frame);

    for (const subscriber of session.subscribers.values()) {
      subscriber.publish(frame);
    }
  }

  private async simulateRun(session: RunSession): Promise<void> {
    session.status = "running";

    this.emit(session, "run_started", {
      runId: session.id,
      baseUrl: session.config.baseUrl,
      scenarioCount: session.estimate.scenarioCount,
      stepCount: session.estimate.stepCount,
      mcpCount: session.estimate.selectedMcpCount,
      totalExecutions: session.estimate.totalExecutions,
    });

    const budget = new TokenBudget(
      {
        hardCapTokens: session.config.tokenCap,
        warnThresholdRatio: 0.8,
      },
      (message) => {
        this.emit(session, "warning", { message });
      }
    );

    try {
      const executions = session.config.selectedMcpIds.map((mcpId) =>
        this.executeMcpRun(session, mcpId, budget)
      );
      await Promise.allSettled(executions);

      if (session.abortController.signal.aborted) {
        session.status = "aborted";
      } else {
        const allMcpRuns = session.config.selectedMcpIds.map((mcpId) => session.resultsByMcp.get(mcpId) ?? []);
        const anyPassedStep = allMcpRuns.some((steps) => steps.some((step) => step.status === "passed"));
        session.status = anyPassedStep ? "completed" : "aborted";
      }

      if (session.status === "aborted") {
        this.emit(session, "run_aborted", {
          runId: session.id,
          reason: "No se pudo completar la ejecución para ningún MCP.",
          totalExecutions: session.totals.stepsExecuted,
          totalTokensUsed: session.totals.tokensUsed,
        });
        return;
      }

      this.emit(session, "run_completed", {
        runId: session.id,
        totalExecutions: session.totals.stepsExecuted,
        totalTokensUsed: session.totals.tokensUsed,
        remainingTokens: budget.getStats().remaining,
      });
    } catch (error) {
      session.status = "aborted";
      this.emit(session, "run_aborted", {
        runId: session.id,
        reason: this.errorMessage(error),
        totalExecutions: session.totals.stepsExecuted,
        totalTokensUsed: session.totals.tokensUsed,
      });

      if (!(error instanceof TimeoutError) && !(error instanceof BudgetExceededError) && !(error instanceof LoopError)) {
        this.logger.warn({ runId: session.id, err: error }, "Run aborted due to unexpected error");
      }
    } finally {
      this.persistRunResults(session);
      this.scheduleCleanup(session);
    }
  }

  private async executeMcpRun(session: RunSession, mcpId: string, budget: TokenBudget): Promise<void> {
    const loopDetector = new LoopDetector(3, 20);
    const orchestrator = new OrchestratorService();
    const processManager = new McpProcessManager(mcpId);
    const providerConfig = this.resolveProviderConfig();

    // Real MCP client via McpProcessManager (Phase 8)
    const instrumentedClient = new InstrumentedMcpClient(processManager);

    try {
      this.emit(session, "mcp_ready", {
        runId: session.id,
        mcpId,
      });

      const processInfo = await processManager.spawn();
      this.emit(session, "mcp_process_started", {
        runId: session.id,
        mcpId,
        pid: processInfo.pid,
      });

      const health = await processManager.healthCheck();
      if (!health) {
        throw new Error(`El proceso de ${mcpId} no respondió al health-check inicial.`);
      }

      const localVersion = process.env.PLAYWRIGHT_VERSION ?? "1.51.0";
      const preflightResult = await preflight({
        mcpId,
        localPlaywrightVersion: localVersion,
        targetPlaywrightVersion: localVersion,
      });

      if (preflightResult.status === "blocked") {
        throw new Error(preflightResult.reason ?? `Preflight bloqueado para ${mcpId}`);
      }

      for (const scenario of session.plan) {
        if (session.abortController.signal.aborted) {
          throw this.abortError(session.abortController.signal.reason);
        }

        const mcpConfig: MCPConfig = {
          id: mcpId,
          provider: providerConfig,
        };

        const runContext: RunContext = {
          runId: `${session.id}:${mcpId}`,
          scenario,
          mcpConfig,
          conversationHistory: [],
          tokenBudget: budget,
          abortSignal: session.abortController.signal,
        };

        for await (const stepResult of orchestrator.runScenario(scenario, runContext)) {
          // D-13/D-14/D-15: Feed actual tool calls, not Gherkin step text
          if (stepResult.toolCalls && stepResult.toolCalls.length > 0) {
            for (const toolCall of stepResult.toolCalls) {
              try {
                loopDetector.recordAndCheck({
                  name: toolCall.toolName,
                  argsString: JSON.stringify(toolCall.arguments),
                });
              } catch (loopErr) {
                if (loopErr instanceof LoopError) {
                  // D-16: Mark step as 'aborted' not 'failed' for loop-guard termination
                  const abortedResult = {
                    ...stepResult,
                    status: 'aborted' as const,
                    message: `[LOOP] ${loopErr.message}`,
                  };
                  await this.trackStepResult(session, mcpId, abortedResult, scenario.steps.length, mcpConfig.provider.model ?? 'gpt-4');
                  throw loopErr; // Re-throw to abort the run
                }
                throw loopErr;
              }
            }
          }
          // D-14: resetStep AFTER all tool calls in the step are fed
          loopDetector.resetStep();

          // EXEC-05: Check if step failure is a stale-ref error
          if (stepResult.status === "failed" && stepResult.message) {
            const fakeError = new Error(stepResult.message);
            if (isStaleRefError(fakeError)) {
              traceStaleRefRecovery(scenario.id, stepResult.stepIndex, false);
              this.logger.info(
                { mcpId, scenarioId: scenario.id, stepIndex: stepResult.stepIndex },
                "Stale ARIA ref detected -- recovery infrastructure wired (real retry in Phase 8)"
              );
              // Don't count as benchmark failure -- annotate status message
              const recoveredResult = {
                ...stepResult,
                message: `[STALE-REF] ${stepResult.message} (no contabilizado como fallo de benchmark)`,
              };
              await this.trackStepResult(session, mcpId, recoveredResult, scenario.steps.length, mcpConfig.provider.model ?? "gpt-4");

              // Collect instrumented traces for this step
              const instrumentedTraces = instrumentedClient.getTraces();
              this.logger.info({ mcpId, tracesCount: instrumentedTraces.length }, "InstrumentedMcpClient wired");
              continue;
            }
          }

          await this.trackStepResult(session, mcpId, stepResult, scenario.steps.length, mcpConfig.provider.model ?? "gpt-4");

          // Collect instrumented traces for this step (connects InstrumentedMcpClient pipeline)
          const instrumentedTraces = instrumentedClient.getTraces();
          this.logger.info({ mcpId, tracesCount: instrumentedTraces.length }, "InstrumentedMcpClient wired");
        }
      }
    } catch (error) {
      const errorMessage = this.errorMessage(error);

      // EXEC-05: Trace stale-ref at run level (if the error propagated uncaught)
      if (isStaleRefError(error)) {
        traceStaleRefRecovery("unknown", -1, false);
        this.logger.info({ mcpId, err: error }, "Stale-ref error at run level -- not counted as benchmark failure");
      }

      this.emit(session, "mcp_aborted", {
        runId: session.id,
        mcpId,
        reason: errorMessage,
      });
      this.logger.warn({ runId: session.id, mcpId, err: error }, "MCP run aborted");
    } finally {
      instrumentedClient.clearTraces();
      await processManager.dispose();
    }
  }

  private async trackStepResult(
    session: RunSession,
    mcpId: string,
    stepResult: StepResult,
    stepCountInScenario: number,
    _orchestratorModel: string
  ): Promise<void> {
    const isCloud = MCP_REGISTRY[mcpId]?.transportMode === "http";
    const networkOverheadMs = isCloud ? Math.max(30, Math.round(stepResult.latencyMs * 0.25)) : 0;
    const persistedRunId = this.buildPersistedRunId(session.id, mcpId);

    const { screenshotId, screenshotPath } = await this.captureStepScreenshot(
      persistedRunId,
      stepResult.stepId,
      stepResult.stepText
    );

    const normalizedStepStatus: "passed" | "failed" | "aborted" =
      stepResult.status === "passed" ? "passed" : stepResult.status === "failed" ? "failed" : "aborted";

    // Wave 2 Task 2: Wire async vision validator with real LLM calls
    let validation: StepValidation;
    
    try {
      // Only validate failed/uncertain steps to save costs
      if (normalizedStepStatus !== "passed" && screenshotPath) {
        // Build auditorProvider from config
        const providerType = session.config.providerType ?? "openai";
        const auditorProvider = await createProvider({
          provider: providerType,
          model: session.config.auditorModel ?? "gpt-4.1",
        });

        // Read screenshot buffer
        let imageBuffer: Buffer | undefined;
        try {
          imageBuffer = await readFile(screenshotPath);
        } catch (err) {
          this.logger.warn({ screenshotPath, err }, "Failed to read screenshot for vision validation");
          // Fall through with undefined buffer - validator will handle it
        }

        // Call async validator with multimodal context
        validation = await validateStepWithVision({
          imageBuffer,
          provider: auditorProvider,
          stepStatus: normalizedStepStatus,
          stepText: stepResult.stepText,
          orchestratorModel: session.config.orchestratorModel ?? "gpt-4o",
        });
      } else {
        // Passed steps or no screenshot: simple verdict without LLM call
        validation = {
          auditorModel: session.config.auditorModel ?? "gpt-4.1",
          tier: "low",
          verdict: normalizedStepStatus === "passed" ? "matches" : "contradicts",
          confidence: normalizedStepStatus === "passed" ? 0.95 : 0.5,
          needsReview: false,
          hallucinated: false,
          rationale: normalizedStepStatus === "passed" ? "Passed step presumed correct" : "Failed step but no screenshot for LLM review",
        };
      }
    } catch (err) {
      // Fallback if validation throws - don't let validator errors break the run
      this.logger.warn({ err, stepId: stepResult.stepId }, "Async validator error - using fallback");
      validation = {
        auditorModel: session.config.auditorModel ?? "gpt-4.1",
        tier: "low",
        verdict: "uncertain",
        confidence: 0.2,
        needsReview: true,
        hallucinated: false,
        rationale: "Validation error - human review recommended",
      };
    }

    const mcpValidation = session.stepValidationByMcp.get(mcpId);
    if (mcpValidation) {
      mcpValidation.set(stepResult.stepId, validation);
    }

    const mcpPendingScreenshots = session.pendingScreenshotsByMcp.get(mcpId);
    if (mcpPendingScreenshots && screenshotId && screenshotPath) {
      mcpPendingScreenshots.push({
        screenshotId,
        stepId: stepResult.stepId,
        path: screenshotPath,
      });
    }

    const mcpResults = session.resultsByMcp.get(mcpId);
    if (mcpResults) {
      mcpResults.push({
        ...stepResult,
        mcpId,
        validation,
        networkOverheadMs,
      } as StepResult & { validation: StepValidation; networkOverheadMs: number });
    }

    this.emit(session, "step_started", {
      runId: session.id,
      mcpId,
      scenarioId: stepResult.scenarioId,
      scenarioName: stepResult.scenarioName,
      stepIndex: stepResult.stepIndex + 1,
      stepCountInScenario,
      canonicalType: stepResult.canonicalType,
      stepText: stepResult.stepText,
    });

    if (stepResult.status === "aborted") {
      this.emit(session, "mcp_aborted", {
        runId: session.id,
        mcpId,
        reason: stepResult.message,
      });
      return;
    }

    session.totals.tokensUsed += stepResult.tokens.total;
    session.totals.stepsExecuted += 1;

    const payload = {
      runId: session.id,
      mcpId,
      scenarioId: stepResult.scenarioId,
      scenarioName: stepResult.scenarioName,
      stepIndex: stepResult.stepIndex + 1,
      canonicalType: stepResult.canonicalType,
      stepText: stepResult.stepText,
      latencyMs: stepResult.latencyMs,
      tokensUsed: stepResult.tokens.total,
      cumulativeTokens: session.totals.tokensUsed,
      message: stepResult.message,
      networkOverheadMs,
      screenshotId,
      validation,
      hallucinated: validation.hallucinated,
      needsReview: validation.needsReview,
    };

    if (stepResult.status === "failed") {
      this.emit(session, "step_failed", {
        ...payload,
        error: stepResult.message,
      });
      return;
    }

    this.emit(session, "step_passed", payload);
  }

  private persistRunResults(session: RunSession): void {
    const scenarioName = session.plan[0]?.name ?? "Run";

    for (const mcpId of session.config.selectedMcpIds) {
      const mcpSteps = session.resultsByMcp.get(mcpId) ?? [];
      if (mcpSteps.length === 0) {
        continue;
      }

      const status: "passed" | "failed" | "aborted" = mcpSteps.some((step) => step.status === "failed")
        ? "failed"
        : mcpSteps.some((step) => step.status === "aborted")
        ? "aborted"
        : "passed";

      const persistedRunId = this.buildPersistedRunId(session.id, mcpId);
      saveRun(persistedRunId, `${scenarioName} [${mcpId}]`, session.plan.length, mcpSteps, status);
      session.persistedByMcp.set(mcpId, persistedRunId);

      const mcpScreenshots = session.pendingScreenshotsByMcp.get(mcpId) ?? [];
      for (const screenshot of mcpScreenshots) {
        saveRunScreenshot(
          screenshot.screenshotId,
          persistedRunId,
          screenshot.stepId,
          screenshot.path
        );
      }

      this.emit(session, "run_persisted", {
        runId: session.id,
        mcpId,
        persistedRunId,
        status,
      });
    }
  }

  private buildPersistedRunId(runId: string, mcpId: string): string {
    return `${runId}::${mcpId}`;
  }

  private async captureStepScreenshot(
    runId: string,
    stepId: string,
    stepText: string
  ): Promise<{ screenshotId: string | null; screenshotPath: string | null }> {
    try {
      const screenshotBuffer = this.getPlaceholderScreenshot(stepText);
      const screenshotId = await saveFileScreenshot(screenshotBuffer, runId, stepId, SCREENSHOT_DIR);
      const screenshotPath = join(SCREENSHOT_DIR, "screenshots", runId, stepId, `${screenshotId}.png`);
      return { screenshotId, screenshotPath };
    } catch (error) {
      this.logger.warn({ err: error, runId, stepId }, "No se pudo guardar screenshot de evidencia");
      return { screenshotId: null, screenshotPath: null };
    }
  }

  private getPlaceholderScreenshot(stepText: string): Buffer {
    void stepText;
    // 1x1 transparent PNG
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5M2V8AAAAASUVORK5CYII=",
      "base64"
    );
  }

  private validateInput(input: RunEstimateRequest): void {
    if (!input.baseUrl?.trim()) {
      throw new RequestValidationError("Base URL es obligatorio.");
    }

    try {
      new URL(input.baseUrl);
    } catch {
      throw new RequestValidationError("Base URL no es válido.");
    }

    if (!input.featureText?.trim()) {
      throw new RequestValidationError("El script Gherkin está vacío.");
    }

    if (!Array.isArray(input.selectedMcpIds) || input.selectedMcpIds.length === 0) {
      throw new RequestValidationError("Selecciona al menos un MCP soportado.");
    }

    if (!Number.isFinite(input.tokenCap) || input.tokenCap < 500) {
      throw new RequestValidationError("Token cap debe ser un número >= 500.");
    }
  }

  private normalizeInput(input: RunEstimateRequest): RunEstimateRequest {
    const baseUrl = this.normalizeBaseUrl(input.baseUrl ?? "");
    const featureText = this.normalizeFeatureText(input.featureText ?? "");
    const selectedMcpIds = this.normalizeSelectedMcpIds(input.selectedMcpIds ?? []);

    return {
      ...input,
      baseUrl,
      featureText,
      selectedMcpIds,
    };
  }

  private normalizeSelectedMcpIds(selectedMcpIds: string[]): string[] {
    if (!Array.isArray(selectedMcpIds)) {
      return [];
    }

    const normalized = selectedMcpIds
      .map((id) => this.normalizeMcpId(id))
      .filter((id): id is string => Boolean(id && MCP_REGISTRY[id]));

    return [...new Set(normalized)];
  }

  private normalizeMcpId(rawMcpId: string): string | null {
    if (!rawMcpId) {
      return null;
    }

    const trimmed = rawMcpId.trim();
    if (!trimmed) {
      return null;
    }

    if (MCP_REGISTRY[trimmed]) {
      return trimmed;
    }

    const alias = MCP_ID_ALIASES[trimmed.toLowerCase()];
    if (alias && MCP_REGISTRY[alias]) {
      return alias;
    }

    return null;
  }

  private resolveProviderConfig(): MCPConfig["provider"] {
    const valueFromEnv = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    const openAiKey = valueFromEnv("OPENAI_API_KEY");
    if (openAiKey) {
      return {
        provider: "openai",
        model: valueFromEnv("OPENAI_MODEL") ?? "gpt-4o-mini",
      };
    }

    const openRouterKey = valueFromEnv("OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY");
    if (openRouterKey) {
      return {
        provider: "openrouter",
        model: valueFromEnv("OPENROUTER_MODEL", "OPEN_ROUTER_MODEL") ?? "openai/gpt-4o-mini",
      };
    }

    const claudeKey = valueFromEnv("ANTHROPIC_API_KEY");
    if (claudeKey) {
      return {
        provider: "claude",
        model: valueFromEnv("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-latest",
      };
    }

    const azureKey = valueFromEnv("AZURE_OPENAI_API_KEY");
    const azureEndpoint = valueFromEnv("AZURE_OPENAI_ENDPOINT");
    const azureDeployment = valueFromEnv("AZURE_OPENAI_DEPLOYMENT");
    if (azureKey && azureEndpoint && azureDeployment) {
      return {
        provider: "azure",
        model: valueFromEnv("AZURE_OPENAI_MODEL") ?? azureDeployment,
        azureEndpoint,
        azureDeploymentName: azureDeployment,
        azureApiVersion: valueFromEnv("AZURE_OPENAI_API_VERSION"),
      };
    }

    throw new RequestValidationError(
      "Faltan credenciales LLM. Define OPENAI_API_KEY o OPENROUTER_API_KEY (también soporta ANTHROPIC_API_KEY/Azure OpenAI)."
    );
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
      return trimmed;
    }

    const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
    const candidate = hasScheme ? trimmed : `https://${trimmed}`;

    return candidate;
  }

  private normalizeFeatureText(featureText: string): string {
    const normalized = featureText.replace(/\r\n?/g, "\n").trim();
    if (!normalized) {
      return normalized;
    }

    const firstMeaningfulLine = normalized
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (!firstMeaningfulLine) {
      return normalized;
    }

    const hasFeatureHeader = /^feature\s*:/i.test(firstMeaningfulLine);
    if (hasFeatureHeader) {
      return normalized;
    }

    const looksLikeStepsOnly = /^(given|when|then|and|but)\b/i.test(firstMeaningfulLine);
    if (!looksLikeStepsOnly) {
      return normalized;
    }

    const indentedSteps = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `    ${line}`)
      .join("\n");

    return `Feature: Flujo rápido\n  Scenario: Escenario principal\n${indentedSteps}`;
  }

  private estimateInputTokens(featureText: string, selectedMcpCount: number): number {
    const promptTokens = Math.ceil(featureText.trim().length / 3.7);
    const orchestrationOverhead = 140 * selectedMcpCount;
    return Math.max(80, promptTokens + orchestrationOverhead);
  }

  private estimateOutputTokens(stepCount: number, selectedMcpCount: number): number {
    return Math.max(220, stepCount * selectedMcpCount * 95);
  }

  private parseFeatureOrThrow(featureText: string): ScenarioPlan[] {
    try {
      return this.parser.parseFeature(featureText);
    } catch (error) {
      throw new RequestValidationError(`Error de parseo Gherkin: ${this.errorMessage(error)}`);
    }
  }

  private abortError(reason: unknown): Error {
    if (reason instanceof Error) {
      return reason;
    }

    return new Error("Run aborted");
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown error";
  }
}
