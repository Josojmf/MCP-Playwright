import { LLMMessage, ProviderConfig } from "../../shared/llm/types";
import { TokenBudget } from "../../shared/harness/TokenBudget";
import { ScenarioPlan } from "../parser";

/**
 * Execution status for a step
 */
export type StepStatus = "running" | "passed" | "failed" | "aborted";

/**
 * Tool call trace for debugging and UI
 */
export interface ToolCallTrace {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: string;
  error?: string;
}

/**
 * Summary of step execution
 */
export interface ExecutionSummary {
  status: StepStatus;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  toolCalls: ToolCallTrace[];
}

/**
 * Result of executing a single step
 */
export interface StepResult {
  stepId: string;
  mcpId?: string;
  stepIndex: number;
  scenarioId: string;
  scenarioName: string;
  stepText: string;
  canonicalType: "given" | "when" | "then";
  status: StepStatus;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  message: string; // Spanish-friendly message for UI
  toolCalls: ToolCallTrace[];
  timestamp: string;
}

/**
 * Orchestrator event for streaming to clients
 */
export interface OrchestratorEvent {
  type: "step_started" | "step_completed" | "run_completed" | "run_aborted" | "step_failed";
  payload: unknown;
  timestamp: string;
}

/**
 * Configuration for an MCP connection
 */
export interface MCPConfig {
  id: string;
  provider: ProviderConfig;
  // Additional MCP-specific configuration
}

/**
 * Context for a single run execution
 */
export interface RunContext {
  runId: string;
  scenario: ScenarioPlan;
  mcpConfig: MCPConfig;
  conversationHistory: LLMMessage[];
  tokenBudget: TokenBudget;
  abortSignal: AbortSignal;
}

/**
 * Plan for orchestrator execution
 */
export interface OrchestratorPlan {
  runId: string;
  scenarios: ScenarioPlan[];
  mcpConfigs: MCPConfig[];
  tokenCap: number;
  baseUrl: string;
}
