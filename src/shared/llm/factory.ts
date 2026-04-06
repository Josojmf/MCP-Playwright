import { AzureOpenAIAdapter } from "./adapters/azure";
import { ClaudeAdapter } from "./adapters/claude";
import { OpenAIAdapter } from "./adapters/openai";
import { OpenRouterAdapter } from "./adapters/openrouter";
import { LLMProvider, ProviderConfig } from "./types";

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

function requireEnv(keys: string[], hint: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  throw new ProviderConfigError(`Missing credential for ${hint}. Expected env var: ${keys.join(" or ")}`);
}

function apiKeyOrEnv(config: ProviderConfig, envKeys: string[], hint: string): string {
  const fromConfig = config.apiKey?.trim();
  if (fromConfig) {
    return fromConfig;
  }
  return requireEnv(envKeys, hint);
}

export async function createProvider(config: ProviderConfig): Promise<LLMProvider> {
  if (config.provider === "openrouter") {
    const apiKey = apiKeyOrEnv(config, ["OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY"], "openrouter");
    return new OpenRouterAdapter(apiKey);
  }

  if (config.provider === "openai") {
    const apiKey = apiKeyOrEnv(config, ["OPENAI_API_KEY"], "openai");
    return new OpenAIAdapter(apiKey);
  }

  if (config.provider === "claude") {
    const apiKey = apiKeyOrEnv(config, ["ANTHROPIC_API_KEY"], "claude");
    return new ClaudeAdapter(apiKey);
  }

  if (config.provider === "azure") {
    const apiKey = apiKeyOrEnv(config, ["AZURE_OPENAI_API_KEY"], "azure");
    const endpoint = config.azureEndpoint ?? process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentName = config.azureDeploymentName ?? process.env.AZURE_OPENAI_DEPLOYMENT;

    if (!endpoint || !endpoint.trim()) {
      throw new ProviderConfigError("Azure provider requires azureEndpoint or AZURE_OPENAI_ENDPOINT");
    }

    if (!deploymentName || !deploymentName.trim()) {
      throw new ProviderConfigError("Azure provider requires azureDeploymentName or AZURE_OPENAI_DEPLOYMENT");
    }

    return new AzureOpenAIAdapter(endpoint.trim(), deploymentName.trim(), apiKey, config.azureApiVersion);
  }

  throw new ProviderConfigError(`Unsupported provider: ${String((config as { provider?: unknown }).provider)}`);
}
