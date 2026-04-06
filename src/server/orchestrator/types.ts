import { LLMMessage, ProviderConfig } from "../../shared/llm/types";
import type { ToolDefinition } from "../../shared/registry/types";
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
  status: "success" | "error";
  correlationId: string;
  latencyMs: number;
  captureTimestamp: string;
  screenshotId?: string;
  result?: string;
  error?: string;
  errorMessage?: string;
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
  screenshotId?: string;
  timestamp: string;
}

/**
 * Orchestrator event for streaming to clients
 */
export interface OrchestratorEvent {
  type: "step_started" | "step_completed" | "run_completed" | "run_aborted" | "step_failed" | "tool_call_started" | "tool_call_completed";
  payload: unknown;
  timestamp: string;
}

/**
 * Payload for granular tool-call SSE events (TRACE-07)
 */
export interface ToolCallEvent {
  runId: string;
  mcpId: string;
  stepId: string;
  stepIndex: number;
  toolCallIndex: number;
  toolName: string;
  arguments: Record<string, unknown>;
  status?: "success" | "error";
  latencyMs?: number;
  result?: string;
  error?: string;
  screenshotId?: string;
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

export interface MCPToolResult {
  type: "success" | "error";
  content?: Array<{ type: string; text?: string }>;
  error?: string;
}

export interface MCPToolClient {
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;
}

/**
 * Context for a single run execution
 */
export interface RunContext {
  runId: string;
  baseUrl?: string;
  scenario: ScenarioPlan;
  mcpConfig: MCPConfig;
  conversationHistory: LLMMessage[];
  tokenBudget: TokenBudget;
  abortSignal: AbortSignal;
  toolClient?: MCPToolClient;
  availableTools?: ToolDefinition[];
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
