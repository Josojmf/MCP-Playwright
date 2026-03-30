export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface LLMChoice {
  index: number;
  message: LLMMessage;
  finishReason: string | null;
}

export interface LLMResponse {
  id: string;
  model: string;
  choices: LLMChoice[];
  usage: LLMUsage;
}

export interface LLMChunk {
  id?: string;
  model?: string;
  index?: number;
  delta: string;
  finishReason?: string | null;
  usage?: LLMUsage;
}

export type ProviderName = "openrouter" | "azure" | "openai" | "claude";

export interface ProviderConfig {
  provider: ProviderName;
  model?: string;
  azureDeploymentName?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
}

export interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;
  estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number>;
}
