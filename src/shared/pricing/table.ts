export interface PricingRecord {
  inputPer1MTokens: number;
  outputPer1MTokens: number;
}

export const PRICING_TABLE: Record<string, PricingRecord> = {
  "openai:default": { inputPer1MTokens: 5, outputPer1MTokens: 15 },
  "openai:gpt-4-turbo": { inputPer1MTokens: 10, outputPer1MTokens: 30 },
  "openai:gpt-4o": { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
  "openai:gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  "openai:gpt-4.1": { inputPer1MTokens: 2, outputPer1MTokens: 8 },
  "openai:gpt-4.1-mini": { inputPer1MTokens: 0.4, outputPer1MTokens: 1.6 },
  "openai:gpt-3.5-turbo": { inputPer1MTokens: 0.5, outputPer1MTokens: 1.5 },

  "azure:default": { inputPer1MTokens: 5, outputPer1MTokens: 15 },
  "azure:gpt-4": { inputPer1MTokens: 30, outputPer1MTokens: 60 },
  "azure:gpt-4-turbo": { inputPer1MTokens: 10, outputPer1MTokens: 30 },
  "azure:gpt-4o": { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
  "azure:gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  "azure:gpt-4.1": { inputPer1MTokens: 2, outputPer1MTokens: 8 },
  "azure:gpt-4.1-mini": { inputPer1MTokens: 0.4, outputPer1MTokens: 1.6 },
  "azure:gpt-35-turbo": { inputPer1MTokens: 0.5, outputPer1MTokens: 1.5 },

  "claude:default": { inputPer1MTokens: 3, outputPer1MTokens: 15 },
  "claude:claude-3-opus-20240229": { inputPer1MTokens: 15, outputPer1MTokens: 75 },
  "claude:claude-3-5-sonnet-20241022": { inputPer1MTokens: 3, outputPer1MTokens: 15 },
  "claude:claude-3-5-sonnet-latest": { inputPer1MTokens: 3, outputPer1MTokens: 15 },
  "claude:claude-3-haiku-20240307": { inputPer1MTokens: 0.25, outputPer1MTokens: 1.25 },
  "claude:claude-3-5-haiku-20241022": { inputPer1MTokens: 1, outputPer1MTokens: 5 },
  "claude:claude-3-5-haiku-latest": { inputPer1MTokens: 0.8, outputPer1MTokens: 4 },

  "openrouter:default": { inputPer1MTokens: 8, outputPer1MTokens: 24 },
  "openrouter:openrouter/auto": { inputPer1MTokens: 10, outputPer1MTokens: 30 },
  /** OpenRouter IDs are usually `provider/model`; short names like `gpt-4o-mini` are also listed for estimates. */
  "openrouter:gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  "openrouter:openai/gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  "openrouter:openai/gpt-4o": { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
  "openrouter:openai/gpt-4.1": { inputPer1MTokens: 2, outputPer1MTokens: 8 },
  "openrouter:openai/gpt-4.1-mini": { inputPer1MTokens: 0.4, outputPer1MTokens: 1.6 },
  /** OpenRouter free tier (pricing shown as $0/M on the model page). */
  "openrouter:qwen/qwen3.6-plus:free": { inputPer1MTokens: 0, outputPer1MTokens: 0 },
};
