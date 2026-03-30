/**
 * Frontend types for history and run data
 */

export interface StepTokens {
  input: number;
  output: number;
  total: number;
}

export interface PersistedStep {
  id: string;
  runId: string;
  mcpId: string;
  index: number;
  text: string;
  canonicalType: "given" | "when" | "then";
  status: "passed" | "failed" | "aborted";
  message: string;
  tokens: StepTokens;
  latencyMs: number;
  networkOverheadMs: number;
  toolCalls?: unknown[];
  validation?: StepValidation | null;
}

export interface StepValidation {
  auditorModel: string;
  tier: "low" | "high";
  verdict: "matches" | "contradicts" | "uncertain";
  confidence: number;
  needsReview: boolean;
  hallucinated: boolean;
  rationale: string;
}

export interface PersistedScreenshot {
  id: string;
  runId: string;
  stepId: string;
  toolCallId?: string;
  path: string;
  timestamp: string;
}

export interface PersistedRun {
  id: string;
  name: string;
  scenarioCount: number;
  totalSteps: number;
  startedAt: string;
  completedAt: string;
  status: "passed" | "failed" | "aborted";
  summary: string;
  totalTokens?: number;
  totalCostUsd?: number;
  hallucinationCount?: number;
  needsReviewCount?: number;
}

export interface RunDetail extends PersistedRun {
  steps: PersistedStep[];
  screenshots: PersistedScreenshot[];
  totalTokens: number;
  estimatedCost: number;
}

export interface RunDetailResponse {
  status: "success" | "error";
  data?: RunDetail;
  message?: string;
  metadata?: {
    totalTokens: number;
    estimatedCost: string;
    failureStats: {
      totalFailed: number;
      totalPassed: number;
      totalAborted: number;
    };
    executionTime: string;
  };
}

export interface HistoryListResponse {
  status: "success" | "error";
  data: PersistedRun[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
