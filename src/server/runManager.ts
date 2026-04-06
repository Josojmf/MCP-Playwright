import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FastifyBaseLogger } from "fastify";
import { GherkinParserService, ScenarioPlan } from "./parser";
import { BudgetExceededError, TokenBudget } from "../shared/harness/TokenBudget";
import { LoopDetector, LoopError } from "../shared/harness/LoopDetector";
import { TimeoutError } from "../shared/harness/withTimeout";
import { OrchestratorService } from "./orchestrator/OrchestratorService";
import type { RunContext, MCPConfig, StepResult, ToolCallTrace } from "./orchestrator/types";
import { saveRun, saveScreenshot as saveRunScreenshot } from "./storage/sqlite";
import { MCP_REGISTRY } from "../shared/registry";
import { McpProcessManager } from "./mcp/McpProcessManager";
import { preflight } from "./mcp/preflight";
import { saveScreenshot as saveFileScreenshot, resolveScreenshotImagePath } from "./storage/screenshots";
import { validateStepWithVision, type StepValidation } from "./validation/visionValidator";
import { InstrumentedMcpClient } from "./mcp/InstrumentedMcpClient";
import { isStaleRefError, traceStaleRefRecovery } from "./mcp/stalenessRecovery";
import { resolvePricing, estimateCostUsd } from "../shared/pricing/resolver";
import { createProvider } from "../shared/llm/factory";

type ProviderType = "openai" | "claude" | "azure" | "openrouter";

export interface RunEstimateRequest {
  baseUrl: string;
  featureText: string;
  selectedMcpIds: string[];
  tokenCap: number;
  provider?: string;
  orchestratorModel?: string;
  lowCostAuditorModel?: string;
  highAccuracyAuditorModel?: string;
  recordVideo?: boolean;
}

interface NormalizedRunEstimateRequest extends RunEstimateRequest {
  provider: ProviderType;
  orchestratorModel: string;
  lowCostAuditorModel: string;
  highAccuracyAuditorModel: string;
}

export interface RunExecutionConfig {
  provider: ProviderType;
  orchestratorModel: string;
  lowCostAuditorModel: string;
  highAccuracyAuditorModel: string;
}

type TrustState = "auditable" | "degraded";

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
  provider: ProviderType;
  orchestratorModel: string;
  lowCostAuditorModel: string;
  highAccuracyAuditorModel: string;
  recordVideo: boolean;
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

    const pricing = resolvePricing(normalizedInput.provider, normalizedInput.orchestratorModel);
    if (!pricing) {
      throw new Error(
        `Unknown pricing for provider "${normalizedInput.provider}" model "${normalizedInput.orchestratorModel}". ` +
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

    // Filter out MCPs that don't have a spawnCommand (e.g. HTTP-only stubs)
    const unsupported = normalizedInput.selectedMcpIds.filter((id) => {
      const entry = MCP_REGISTRY[id];
      return !entry?.spawnCommand || entry.spawnCommand.length === 0;
    });
    if (unsupported.length > 0) {
      normalizedInput.selectedMcpIds = normalizedInput.selectedMcpIds.filter(
        (id) => !unsupported.includes(id)
      );
      this.logger.warn(
        { unsupported },
        "Filtered out MCP targets without spawnCommand"
      );
    }
    if (normalizedInput.selectedMcpIds.length === 0) {
      throw new RequestValidationError(
        "No quedan MCP targets válidos después de filtrar los no soportados."
      );
    }

    const estimate = this.estimateRun(normalizedInput);

    if (!estimate.withinBudget) {
      throw new BudgetExceededError(
        `El token cap (${normalizedInput.tokenCap}) es menor al estimado (${estimate.estimatedTotalTokens}).`
      );
    }

    const orchestratorModel = normalizedInput.orchestratorModel;
    const lowCostAuditorModel = normalizedInput.lowCostAuditorModel;
    const highAccuracyAuditorModel = normalizedInput.highAccuracyAuditorModel;

    if (lowCostAuditorModel === orchestratorModel) {
      throw new RequestValidationError(
        `Low-cost auditor model and orchestrator model must differ: both are '${orchestratorModel}'.`
      );
    }
    if (highAccuracyAuditorModel === orchestratorModel) {
      throw new RequestValidationError(
        `High-accuracy auditor model and orchestrator model must differ: both are '${orchestratorModel}'.`
      );
    }

    const runId = randomUUID();
    const plan = this.parseFeatureOrThrow(normalizedInput.featureText);

    const session: RunSession = {
      id: runId,
      config: {
        baseUrl: normalizedInput.baseUrl,
        selectedMcpIds: normalizedInput.selectedMcpIds,
        tokenCap: normalizedInput.tokenCap,
        provider: normalizedInput.provider,
        orchestratorModel,
        lowCostAuditorModel,
        highAccuracyAuditorModel,
        recordVideo: Boolean(normalizedInput.recordVideo),
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
      executionConfig: {
        provider: session.config.provider,
        orchestratorModel: session.config.orchestratorModel,
        lowCostAuditorModel: session.config.lowCostAuditorModel,
        highAccuracyAuditorModel: session.config.highAccuracyAuditorModel,
      } satisfies RunExecutionConfig,
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
      const results = await Promise.allSettled(executions);

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.status === "rejected") {
          const mcpId = session.config.selectedMcpIds[i];
          this.logger.error({ runId: session.id, mcpId, err: res.reason }, "MCP execution failed to start or threw unhandled error");
        }
      }

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

      if (session.config.recordVideo) {
        const videoDir = `${SCREENSHOT_DIR}/videos/${session.id}`;
        try {
          const fs = await import("node:fs/promises");
          const files = await fs.readdir(videoDir);
          const videoFile = files.find((f) => f.endsWith(".webm") || f.endsWith(".mp4"));
          if (videoFile) {
            this.emit(session, "video_available", {
              runId: session.id,
              videoUrl: `/api/videos/${encodeURIComponent(session.id)}/${encodeURIComponent(videoFile)}`,
            });
          }
        } catch {
          // No video directory or files — video recording may not have produced output
        }
      }
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
    let processManager: McpProcessManager | null = null;
    let instrumentedClient: InstrumentedMcpClient | null = null;

    try {
      // Validate that the MCP has a spawnCommand before attempting to create a process
      const registryEntry = MCP_REGISTRY[mcpId];
      if (!registryEntry?.spawnCommand || registryEntry.spawnCommand.length === 0) {
        throw new Error(
          `MCP "${mcpId}" no tiene spawnCommand configurado (transport: ${registryEntry?.transportMode ?? 'unknown'}). ` +
          `Solo los MCP con transporte stdio están soportados actualmente.`
        );
      }

      const loopDetector = new LoopDetector(3, 20);
      const orchestrator = new OrchestratorService();

      const mcpEnv: Record<string, string> = {};
      if (session.config.recordVideo) {
        mcpEnv.PLAYWRIGHT_VIDEO_DIR = `${SCREENSHOT_DIR}/videos/${session.id}`;
      }
      processManager = new McpProcessManager(mcpId, mcpEnv);
      const providerConfig = this.resolveProviderConfig(session.config);

      // Real MCP client via McpProcessManager (Phase 8)
      instrumentedClient = new InstrumentedMcpClient(processManager);

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
          baseUrl: session.config.baseUrl,
          scenario,
          mcpConfig,
          conversationHistory: [],
          tokenBudget: budget,
          abortSignal: session.abortController.signal,
          toolClient: instrumentedClient,
          availableTools: processManager.getTools(),
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
                  await this.trackStepResult(
                    session,
                    mcpId,
                    abortedResult,
                    scenario.steps.length,
                    instrumentedClient.consumeTraces(),
                    instrumentedClient
                  );
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
              await this.trackStepResult(
                session,
                mcpId,
                recoveredResult,
                scenario.steps.length,
                instrumentedClient.consumeTraces(),
                instrumentedClient
              );
              continue;
            }
          }

          await this.trackStepResult(
            session,
            mcpId,
            stepResult,
            scenario.steps.length,
            instrumentedClient.consumeTraces(),
            instrumentedClient
          );
        }
      }
    } catch (error) {
      console.error("🔥 ERROR EN executeMcpRun:", error);
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
      if (instrumentedClient) instrumentedClient.clearTraces();
      if (processManager) await processManager.dispose();
    }
  }

  private async trackStepResult(
    session: RunSession,
    mcpId: string,
    stepResult: StepResult,
    stepCountInScenario: number,
    instrumentedTraces: ToolCallTrace[],
    instrumentedClient: InstrumentedMcpClient
  ): Promise<void> {
    const isCloud = MCP_REGISTRY[mcpId]?.transportMode === "http";
    const networkOverheadMs = isCloud ? Math.max(30, Math.round(stepResult.latencyMs * 0.25)) : 0;
    const persistedRunId = this.buildPersistedRunId(session.id, mcpId);
    const { screenshotId, screenshotPath } = await this.captureStepScreenshot(
      persistedRunId,
      stepResult.stepId,
      instrumentedTraces,
      instrumentedClient
    );

    const normalizedStepStatus: "passed" | "failed" | "aborted" =
      stepResult.status === "passed" ? "passed" : stepResult.status === "failed" ? "failed" : "aborted";

    // Wave 2 Task 2: Wire async vision validator with real LLM calls
    let validation: StepValidation;
    
    try {
      // D-05/D-06: Only validate PASSED steps via vision LLM; failed/aborted get deterministic result
      if (normalizedStepStatus === "passed" && screenshotPath) {
        // Build auditorProvider from config using low-cost model for initial construction
        const auditorProvider = await createProvider({
          provider: session.config.provider,
          model: session.config.lowCostAuditorModel,
        });

        // Read screenshot buffer
        let imageBuffer: Buffer | undefined;
        try {
          imageBuffer = await readFile(screenshotPath);
        } catch (err) {
          this.logger.warn({ screenshotPath, err }, "Failed to read screenshot for vision validation");
          // Fall through with undefined buffer - validator will handle it
        }

        // Call async validator with multimodal context and both tier model keys
        validation = await validateStepWithVision({
          imageBuffer,
          provider: auditorProvider,
          stepStatus: normalizedStepStatus,
          stepText: stepResult.stepText,
          orchestratorModel: session.config.orchestratorModel,
          lowCostAuditorModel: session.config.lowCostAuditorModel,
          highAccuracyAuditorModel: session.config.highAccuracyAuditorModel,
        });
      } else {
        // D-06: Failed/aborted steps get deterministic verdict without LLM call
        // Passed steps without screenshot get uncertain verdict
        if (normalizedStepStatus !== "passed") {
          validation = {
            auditorModel: session.config.lowCostAuditorModel,
            tier: "low",
            verdict: "contradicts",
            confidence: 0.95,
            needsReview: false,
            hallucinated: false,
            rationale: "Technical step result indicates failure or abort.",
          };
        } else {
          // Passed step but no screenshot
          validation = {
            auditorModel: session.config.lowCostAuditorModel,
            tier: "low",
            verdict: "uncertain",
            confidence: 0.2,
            needsReview: true,
            hallucinated: false,
            rationale: "No screenshot available for vision validation.",
          };
        }
      }
    } catch (err) {
      // Fallback if validation throws - don't let validator errors break the run
      this.logger.warn({ err, stepId: stepResult.stepId }, "Async validator error - using fallback");
      validation = {
        auditorModel: session.config.lowCostAuditorModel,
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

    const trustReasons = this.deriveStepTrustReasons(stepResult, validation, screenshotId, instrumentedTraces);
    const trustState: TrustState = trustReasons.length > 0 ? "degraded" : "auditable";

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
        screenshotId: screenshotId ?? undefined,
        toolCalls: instrumentedTraces.length > 0 ? instrumentedTraces : stepResult.toolCalls,
        validation,
        networkOverheadMs,
        trustReasons,
      } as StepResult & { validation: StepValidation; networkOverheadMs: number; trustReasons: string[] });
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

    // TRACE-07 / D-07: Emit individual tool call events for real-time streaming
    const allTraces = instrumentedTraces.length > 0 ? instrumentedTraces : stepResult.toolCalls;
    for (let i = 0; i < allTraces.length; i++) {
      const trace = allTraces[i];
      this.emit(session, "tool_call_completed", {
        runId: session.id,
        mcpId,
        stepId: stepResult.stepId,
        stepIndex: stepResult.stepIndex,
        toolCallIndex: i,
        toolName: trace.toolName,
        arguments: trace.arguments,
        status: trace.status,
        latencyMs: trace.latencyMs,
        result: trace.result,
        error: trace.error,
        screenshotId: trace.screenshotId,
        timestamp: trace.captureTimestamp,
      });
    }

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
      trustState,
      trustReasons,
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
      const mcpSteps = session.resultsByMcp.get(mcpId) as Array<
        StepResult & { validation?: StepValidation | null; networkOverheadMs?: number; trustReasons?: string[] }
      > ?? [];
      if (mcpSteps.length === 0) {
        continue;
      }

      const status: "passed" | "failed" | "aborted" = mcpSteps.some((step) => step.status === "failed")
        ? "failed"
        : mcpSteps.some((step) => step.status === "aborted")
        ? "aborted"
        : "passed";

      const persistedRunId = this.buildPersistedRunId(session.id, mcpId);
      const trustReasons = [...new Set(mcpSteps.flatMap((step) => step.trustReasons ?? []))];
      const trustState: TrustState = trustReasons.length > 0 ? "degraded" : "auditable";
      saveRun(persistedRunId, `${scenarioName} [${mcpId}]`, session.plan.length, mcpSteps, status, {
        trustState,
        trustReasons,
        provider: session.config.provider,
        orchestratorModel: session.config.orchestratorModel,
        lowCostAuditorModel: session.config.lowCostAuditorModel,
        highAccuracyAuditorModel: session.config.highAccuracyAuditorModel,
      });
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
    traces: ToolCallTrace[],
    instrumentedClient: InstrumentedMcpClient
  ): Promise<{ screenshotId: string | null; screenshotPath: string | null }> {
    try {
      // 1. Check existing trace screenshots
      const traceWithScreenshot = traces.find((trace) => trace.screenshotId);
      let screenshotBuffer: Buffer | undefined;

      if (traceWithScreenshot?.screenshotId) {
        screenshotBuffer = instrumentedClient.getScreenshot(traceWithScreenshot.screenshotId);
      }

      // 2. If no trace screenshot, attempt a fresh capture via MCP tool (TRACE-01, D-01)
      if (!screenshotBuffer) {
        try {
          const result = await instrumentedClient.callTool("browser_take_screenshot", {});
          if (result && result.type === "success") {
            // Extract base64 image from result content
            const imgContent = result.content?.find(
              (c: { type: string; text?: string }) => c.type === "image" || (c.type === "text" && c.text)
            );
            if (imgContent) {
              const base64Data = (imgContent as { type: string; text?: string; data?: string }).data ?? imgContent.text;
              if (base64Data && typeof base64Data === "string") {
                screenshotBuffer = Buffer.from(base64Data, "base64");
              }
            }
          }
        } catch {
          // MCP may not support screenshot or browser not active -- silently skip
        }
      }

      if (!screenshotBuffer) {
        return { screenshotId: null, screenshotPath: null };
      }

      const screenshotId = await saveFileScreenshot(
        screenshotBuffer,
        runId,
        stepId,
        SCREENSHOT_DIR,
        traceWithScreenshot?.toolId
      );
      const screenshotPath = resolveScreenshotImagePath(runId, stepId, screenshotId, SCREENSHOT_DIR);
      return { screenshotId, screenshotPath };
    } catch (error) {
      this.logger.warn({ err: error, runId, stepId }, "No se pudo guardar screenshot de evidencia");
      return { screenshotId: null, screenshotPath: null };
    }
  }

  private deriveStepTrustReasons(
    stepResult: StepResult,
    validation: StepValidation,
    screenshotId: string | null,
    traces: ToolCallTrace[]
  ): string[] {
    const reasons = new Set<string>();

    if (traces.length === 0) {
      reasons.add("missing_tool_trace");
    }

    if (!screenshotId) {
      reasons.add("missing_step_screenshot");
    }

    if (validation.needsReview || validation.verdict === "uncertain") {
      reasons.add("review_only_validation");
    }

    if (stepResult.message.includes("Unsupported translated assertion pattern")) {
      reasons.add("unsupported_translated_assertion");
    }

    return [...reasons];
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

  private normalizeInput(input: RunEstimateRequest): NormalizedRunEstimateRequest {
    const baseUrl = this.normalizeBaseUrl(input.baseUrl ?? "");
    const featureText = this.normalizeFeatureText(input.featureText ?? "");
    const selectedMcpIds = this.normalizeSelectedMcpIds(input.selectedMcpIds ?? []);
    const provider = this.normalizeProvider(input.provider);
    const orchestratorModel = this.normalizeOrchestratorModel(provider, input.orchestratorModel);
    const lowCostAuditorModel = this.normalizeNamedModel(input.lowCostAuditorModel, "gpt-4.1-mini");
    const highAccuracyAuditorModel = this.normalizeNamedModel(input.highAccuracyAuditorModel, "gpt-4.1");

    return {
      ...input,
      baseUrl,
      featureText,
      selectedMcpIds,
      provider,
      orchestratorModel,
      lowCostAuditorModel,
      highAccuracyAuditorModel,
    };
  }

  private normalizeProvider(provider: string | undefined): ProviderType {
    const normalized = provider?.trim().toLowerCase();
    if (!normalized) {
      return this.detectDefaultProviderFromEnv();
    }

    if (normalized === "openai" || normalized === "claude" || normalized === "azure" || normalized === "openrouter") {
      return normalized;
    }

    throw new RequestValidationError(`Provider no soportado: ${provider}`);
  }

  private normalizeOrchestratorModel(provider: ProviderType, model: string | undefined): string {
    const normalized = model?.trim();
    if (normalized) {
      return normalized;
    }

    const valueFromEnv = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    if (provider === "openai") {
      return valueFromEnv("OPENAI_MODEL") ?? "gpt-4o-mini";
    }

    if (provider === "claude") {
      return valueFromEnv("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-latest";
    }

    if (provider === "azure") {
      return valueFromEnv("AZURE_OPENAI_MODEL", "AZURE_OPENAI_DEPLOYMENT") ?? "gpt-4o";
    }

    return valueFromEnv("OPENROUTER_MODEL", "OPEN_ROUTER_MODEL") ?? "openai/gpt-4o-mini";
  }

  private normalizeNamedModel(model: string | undefined, fallback: string): string {
    const normalized = model?.trim();
    if (normalized) {
      return normalized;
    }

    return fallback;
  }

  private detectDefaultProviderFromEnv(): ProviderType {
    const valueFromEnv = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    if (valueFromEnv("OPENAI_API_KEY")) {
      return "openai";
    }

    if (valueFromEnv("ANTHROPIC_API_KEY")) {
      return "claude";
    }

    if (valueFromEnv("AZURE_OPENAI_API_KEY")) {
      return "azure";
    }

    if (valueFromEnv("OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY")) {
      return "openrouter";
    }

    return "openai";
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

  private resolveProviderConfig(config: RunConfig): MCPConfig["provider"] {
    const valueFromEnv = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    // Auto-detect provider based on available credentials as fallback
    let activeProvider = process.env.DEFAULT_PROVIDER || config.provider;
    
    if (activeProvider === "openai" && !valueFromEnv("OPENAI_API_KEY")) {
      if (valueFromEnv("OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY")) activeProvider = "openrouter";
      else if (valueFromEnv("ANTHROPIC_API_KEY")) activeProvider = "claude";
      else if (valueFromEnv("AZURE_OPENAI_API_KEY") && valueFromEnv("AZURE_OPENAI_ENDPOINT")) activeProvider = "azure";
    }

    if (activeProvider === "openai") {
      const openAiKey = valueFromEnv("OPENAI_API_KEY");
      if (!openAiKey) {
        throw new RequestValidationError("Falta OPENAI_API_KEY para ejecutar con provider openai.");
      }

      return {
        provider: "openai",
        model: config.orchestratorModel,
      };
    }

    if (activeProvider === "openrouter") {
      const openRouterKey = valueFromEnv("OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY");
      if (!openRouterKey) {
        throw new RequestValidationError("Falta OPENROUTER_API_KEY para ejecutar con provider openrouter.");
      }

      return {
        provider: "openrouter",
        model: config.orchestratorModel,
      };
    }

    if (activeProvider === "claude") {
      const claudeKey = valueFromEnv("ANTHROPIC_API_KEY");
      if (!claudeKey) {
        throw new RequestValidationError("Falta ANTHROPIC_API_KEY para ejecutar con provider claude.");
      }

      return {
        provider: "claude",
        model: config.orchestratorModel,
      };
    }

    if (activeProvider === "azure") {
      const azureKey = valueFromEnv("AZURE_OPENAI_API_KEY");
      const azureEndpoint = valueFromEnv("AZURE_OPENAI_ENDPOINT");
      const azureDeployment = valueFromEnv("AZURE_OPENAI_DEPLOYMENT") ?? config.orchestratorModel;
      if (!azureKey || !azureEndpoint) {
        throw new RequestValidationError(
          "Faltan credenciales Azure OpenAI. Define AZURE_OPENAI_API_KEY y AZURE_OPENAI_ENDPOINT."
        );
      }

      return {
        provider: "azure",
        model: config.orchestratorModel,
        azureEndpoint,
        azureDeploymentName: azureDeployment,
        azureApiVersion: valueFromEnv("AZURE_OPENAI_API_VERSION"),
      };
    }

    throw new RequestValidationError(`Provider no soportado: ${activeProvider}`);
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
