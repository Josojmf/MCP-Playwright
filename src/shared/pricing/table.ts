export interface PricingRecord {
  inputPer1MTokens: number;
  outputPer1MTokens: number;
}

export const PRICING_TABLE: Record<string, PricingRecord> = {
  "openai:default": { inputPer1MTokens: 5, outputPer1MTokens: 15 },
  "openai:gpt-4o": { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
  "openai:gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  "openai:gpt-4.1": { inputPer1MTokens: 2, outputPer1MTokens: 8 },
  "openai:gpt-4.1-mini": { inputPer1MTokens: 0.4, outputPer1MTokens: 1.6 },

  "azure:default": { inputPer1MTokens: 5, outputPer1MTokens: 15 },
  "azure:gpt-4o": { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
  "azure:gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },

  "claude:default": { inputPer1MTokens: 3, outputPer1MTokens: 15 },
  "claude:claude-3-5-sonnet-latest": { inputPer1MTokens: 3, outputPer1MTokens: 15 },
  "claude:claude-3-5-haiku-latest": { inputPer1MTokens: 0.8, outputPer1MTokens: 4 },

  "openrouter:default": { inputPer1MTokens: 8, outputPer1MTokens: 24 },
};
