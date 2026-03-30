# Research: Provider-Agnostic LLM Orchestration & Gherkin BDD Parsing

**Project:** MCP Playwright Test Playground
**Researched:** 2026-03-30
**Research mode:** Ecosystem
**Overall confidence:** MEDIUM (no live web access; training knowledge through ~Aug 2025; flags noted where validation is recommended)

---

## Topic 1: Provider-Agnostic LLM Orchestration in Node.js/TypeScript

### 1.1 The Core Problem

You need one `OrchestratorService` that can send a Gherkin step to an LLM and stream back a browser-action command, regardless of whether the underlying model is OpenRouter, Azure OpenAI, OpenAI, or Anthropic Claude. The constraint is "config-only swap" — no code changes, no conditional branches in business logic.

The correct pattern is **Adapter + Factory**: define a narrow interface, implement one adapter per provider, and select the implementation at startup from config.

---

### 1.2 Recommended Interface Pattern

Define the narrowest interface that satisfies the contract. Do not bleed provider-specific types into it.

```typescript
// src/orchestrator/types.ts

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model: string;           // provider-specific model name; injected from config
  maxTokens?: number;
  temperature?: number;
  stream: boolean;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number; // optional — not all providers return cost inline
}

export interface LLMChunk {
  delta: string;           // incremental text in streaming mode
  done: boolean;
}

export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;           // echoed model name — may differ from requested (fallback)
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | string;
}

// The one interface every provider adapter must satisfy
export interface LLMProvider {
  readonly name: string;   // 'openrouter' | 'azure-openai' | 'openai' | 'claude'
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;
}
```

**Why this interface shape:**
- `stream()` returns `AsyncIterable<LLMChunk>` — works with `for await...of`, trivially composable with SSE/WebSocket emitters
- `usage` is on `LLMResponse` (non-streaming path) — streaming usage is only reliably available in the final chunk from most providers; aggregate it in the adapter
- `estimatedCostUsd` is optional — OpenRouter returns it inline; Azure/OpenAI do not; fill it post-hoc via a pricing table if needed
- No provider SDK types leak out — the calling code never imports `OpenAI`, `AzureOpenAI`, or `Anthropic`

---

### 1.3 OpenRouter Adapter

**Confidence: HIGH** — OpenRouter exposes an OpenAI-compatible REST API. The `openai` npm package works against it directly by overriding `baseURL`.

```typescript
// src/orchestrator/adapters/openrouter.adapter.ts
import OpenAI from 'openai'; // npm i openai
import type { LLMProvider, LLMRequest, LLMResponse, LLMChunk, LLMUsage } from '../types';

export interface OpenRouterConfig {
  apiKey: string;
  defaultModel: string;    // e.g. 'anthropic/claude-3.5-sonnet'
  siteUrl?: string;        // recommended by OpenRouter for rate limit priority
  siteName?: string;
}

export class OpenRouterAdapter implements LLMProvider {
  readonly name = 'openrouter';
  private client: OpenAI;
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': config.siteUrl ?? 'http://localhost',
        'X-Title': config.siteName ?? 'MCP-Playwright-Playground',
      },
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const resp = await this.client.chat.completions.create({
      model: request.model || this.config.defaultModel,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false,
    });

    const choice = resp.choices[0];
    const usage = resp.usage;

    return {
      content: choice.message.content ?? '',
      model: resp.model,
      finishReason: choice.finish_reason ?? 'stop',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        // OpenRouter includes cost in usage extensions (LOW confidence — verify field name)
        estimatedCostUsd: (usage as any)?.['x-openrouter-cost'] ?? undefined,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model || this.config.defaultModel,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      const done = chunk.choices[0]?.finish_reason === 'stop';
      yield { delta, done };
      if (done) break;
    }
  }
}
```

**OpenRouter-specific notes:**
- Model names use `provider/model` format: `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-1.5-pro`
- The `HTTP-Referer` and `X-Title` headers affect rate limit tier — always include them
- Cost data: OpenRouter returns `usage.total_cost` (in USD) in the non-streaming response body. Field name is `total_cost` on the `usage` object — **verify against current docs** as this has changed historically. (LOW confidence on exact field name)
- For streaming, cost is only available in the final `data: [DONE]` metadata chunk — OpenRouter sends a final non-SSE JSON payload with usage after `[DONE]`. The `openai` SDK does not surface this automatically. Fetch it via a follow-up call to `/api/v1/generation?id={id}` using the `id` from the stream response (MEDIUM confidence — verify this endpoint exists in current OpenRouter docs)

---

### 1.4 Azure OpenAI Adapter

**Confidence: HIGH** — `@azure/openai` npm package is the official SDK.

```typescript
// src/orchestrator/adapters/azure-openai.adapter.ts
import { AzureOpenAI } from 'openai'; // openai v4+ exports AzureOpenAI
import type { LLMProvider, LLMRequest, LLMResponse, LLMChunk } from '../types';

export interface AzureOpenAIConfig {
  endpoint: string;         // https://<resource>.openai.azure.com/
  apiKey: string;
  apiVersion: string;       // e.g. '2024-02-01'
  deployment: string;       // deployment name (not model name)
}

export class AzureOpenAIAdapter implements LLMProvider {
  readonly name = 'azure-openai';
  private client: AzureOpenAI;
  private config: AzureOpenAIConfig;

  constructor(config: AzureOpenAIConfig) {
    this.config = config;
    this.client = new AzureOpenAI({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      apiVersion: config.apiVersion,
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const resp = await this.client.chat.completions.create({
      model: this.config.deployment, // Azure ignores 'model', uses deployment
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false,
    });

    const choice = resp.choices[0];
    const usage = resp.usage;
    return {
      content: choice.message.content ?? '',
      model: this.config.deployment,
      finishReason: choice.finish_reason ?? 'stop',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.deployment,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      const done = chunk.choices[0]?.finish_reason === 'stop';
      yield { delta, done };
      if (done) break;
    }
  }
}
```

**Azure-specific notes:**
- The `model` field in the request payload is effectively ignored by Azure; it routes to the deployment instead
- `apiVersion` is mandatory — pin to a specific dated version, not `latest`; the API evolves across versions with breaking changes
- Azure does NOT return cost data inline — you need Azure Cost Management API or a pricing table lookup
- Managed identity (AAD token) is an alternative to `apiKey` — relevant if deploying to Azure infrastructure

---

### 1.5 OpenAI Direct Adapter

**Confidence: HIGH** — Nearly identical to OpenRouter since OpenRouter is wire-compatible.

```typescript
// src/orchestrator/adapters/openai.adapter.ts
import OpenAI from 'openai';
import type { LLMProvider, LLMRequest, LLMResponse, LLMChunk } from '../types';

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  defaultModel: string;   // e.g. 'gpt-4o'
}

export class OpenAIAdapter implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const resp = await this.client.chat.completions.create({
      model: request.model || this.config.defaultModel,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false,
    });

    const choice = resp.choices[0];
    const usage = resp.usage;
    return {
      content: choice.message.content ?? '',
      model: resp.model,
      finishReason: choice.finish_reason ?? 'stop',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model || this.config.defaultModel,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      const done = chunk.choices[0]?.finish_reason === 'stop';
      yield { delta, done };
      if (done) break;
    }
  }
}
```

---

### 1.6 Anthropic Claude Adapter

**Confidence: HIGH** — Anthropic SDK is `@anthropic-ai/sdk`. The API shape differs from OpenAI: no `messages` array with `role: system` at the top level; system prompt is a separate field.

```typescript
// src/orchestrator/adapters/claude.adapter.ts
import Anthropic from '@anthropic-ai/sdk'; // npm i @anthropic-ai/sdk
import type { LLMProvider, LLMRequest, LLMResponse, LLMChunk, LLMMessage } from '../types';

export interface ClaudeConfig {
  apiKey: string;
  defaultModel: string;   // e.g. 'claude-3-5-sonnet-20241022'
}

function splitMessages(messages: LLMMessage[]): {
  system: string | undefined;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  const systemMessages = messages.filter(m => m.role === 'system');
  const system = systemMessages.length > 0
    ? systemMessages.map(m => m.content).join('\n\n')
    : undefined;
  const turns = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, turns };
}

export class ClaudeAdapter implements LLMProvider {
  readonly name = 'claude';
  private client: Anthropic;
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const { system, turns } = splitMessages(request.messages);

    const resp = await this.client.messages.create({
      model: request.model || this.config.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      system,
      messages: turns,
      temperature: request.temperature,
    });

    const textContent = resp.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    return {
      content: textContent,
      model: resp.model,
      finishReason: resp.stop_reason ?? 'stop',
      usage: {
        promptTokens: resp.usage.input_tokens,
        completionTokens: resp.usage.output_tokens,
        totalTokens: resp.usage.input_tokens + resp.usage.output_tokens,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const { system, turns } = splitMessages(request.messages);

    const stream = await this.client.messages.stream({
      model: request.model || this.config.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      system,
      messages: turns,
      temperature: request.temperature,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { delta: event.delta.text, done: false };
      } else if (event.type === 'message_stop') {
        yield { delta: '', done: true };
        break;
      }
    }
  }
}
```

**Claude-specific notes:**
- `max_tokens` is REQUIRED (no default) — omitting it throws
- System messages must be a single string (Anthropic API), not an array entry with `role: system`
- The `turns` array must alternate user/assistant — two consecutive user messages will throw. Your orchestrator must enforce this or merge adjacent same-role messages
- `temperature` is not supported on all Claude models — Claude 3 Opus/Sonnet/Haiku support it; verify for future models
- Anthropic does not return cost inline — derive it from `input_tokens * price_per_input_token + output_tokens * price_per_output_token`

---

### 1.7 Provider Factory

```typescript
// src/orchestrator/provider-factory.ts
import type { LLMProvider } from './types';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { AzureOpenAIAdapter } from './adapters/azure-openai.adapter';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { ClaudeAdapter } from './adapters/claude.adapter';

export type ProviderName = 'openrouter' | 'azure-openai' | 'openai' | 'claude';

export interface ProviderConfig {
  provider: ProviderName;
  openrouter?: { apiKey: string; defaultModel: string; siteUrl?: string; siteName?: string };
  azureOpenai?: { endpoint: string; apiKey: string; apiVersion: string; deployment: string };
  openai?: { apiKey: string; organization?: string; defaultModel: string };
  claude?: { apiKey: string; defaultModel: string };
}

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'openrouter':
      if (!config.openrouter) throw new Error('openrouter config missing');
      return new OpenRouterAdapter(config.openrouter);
    case 'azure-openai':
      if (!config.azureOpenai) throw new Error('azureOpenai config missing');
      return new AzureOpenAIAdapter(config.azureOpenai);
    case 'openai':
      if (!config.openai) throw new Error('openai config missing');
      return new OpenAIAdapter(config.openai);
    case 'claude':
      if (!config.claude) throw new Error('claude config missing');
      return new ClaudeAdapter(config.claude);
    default:
      throw new Error(`Unknown provider: ${(config as any).provider}`);
  }
}
```

Config (e.g., loaded from `config.yaml` or environment variables):
```yaml
provider: openrouter
openrouter:
  apiKey: "${OPENROUTER_API_KEY}"
  defaultModel: "anthropic/claude-3.5-sonnet"
  siteUrl: "http://localhost:3000"
  siteName: "MCP-Playwright-Playground"
```

Swapping to Claude:
```yaml
provider: claude
claude:
  apiKey: "${ANTHROPIC_API_KEY}"
  defaultModel: "claude-3-5-sonnet-20241022"
```

Zero application code changes. This is the correct pattern.

---

### 1.8 Existing Abstraction Libraries — Worth Using?

#### Vercel AI SDK (`ai` package)

**Confidence: HIGH**

- Supports OpenAI, Azure OpenAI, Anthropic, Google, Mistral, Cohere, and more via first-party provider packages
- Provider interface: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/azure`
- Designed for Next.js/React Server Components but works in Node.js
- Core functions: `generateText()`, `streamText()`, `generateObject()` (structured output with Zod schema)
- `streamText()` returns a `ReadableStream` — requires adapter to get back to `AsyncIterable<LLMChunk>`

**Verdict: DO NOT USE for this project.** Reasons:
1. The SDK is heavily optimized for Next.js edge runtime and RSC patterns — this project uses Fastify
2. OpenRouter support is community-maintained (`@openrouter/ai-sdk-provider`) — adds a third-party dependency for the default provider
3. The `generateText`/`streamText` API is high-level and opinionated — harder to intercept raw token counts, model echo, finish reasons precisely
4. You would still need to write a thin wrapper to expose `AsyncIterable` to your SSE layer
5. The adapter pattern described in §1.2 above is simpler, more transparent, and gives exact control over cost tracking

#### LangChain.js

**Confidence: HIGH**

- Supports all four providers via `@langchain/openai`, `@langchain/anthropic`, etc.
- Has `ChatOpenAI`, `ChatAnthropic`, `AzureChatOpenAI` classes with a unified `invoke()` / `.stream()` API
- Much heavier: brings its own chain, memory, retriever, tool-calling abstractions

**Verdict: DO NOT USE.** Reasons:
1. Massive bundle and cognitive overhead for a project that does not need chains, memory, or retrievers
2. Version churn is high — LangChain has broken APIs repeatedly; pins become stale fast
3. Your use case is narrow (one LLM call per Gherkin step) — LangChain's value is in multi-step agentic chains
4. Debugging LangChain internals is painful; the adapter pattern is fully transparent

#### LiteLLM (Python) / `litellm-js`

**Confidence: LOW** — A LiteLLM JS port exists but is not production-grade as of Aug 2025. Avoid.

#### Recommendation: Build thin adapters (§1.2–1.7)

The interface + adapter pattern described above is ~200 lines of total code, has no transitive dependencies beyond the four provider SDKs, and gives precise control. This is the correct call for a benchmarking tool that needs accurate token/cost data.

---

### 1.9 Streaming Step Responses to the Frontend

The orchestrator dispatches one LLM call per Gherkin step. The streaming flow is:

```
Gherkin step text
  → OrchestratorService.executeStep(step, context)
    → LLMProvider.stream(request)           ← AsyncIterable<LLMChunk>
      → collect full response               ← string (MCP action command)
  → MCPClient.execute(action)               ← Playwright action
  → emit StepResult via SSE                 ← frontend receives live update
```

There are two places where streaming matters:

**Option A — Stream LLM tokens to frontend (word-by-word thinking)**
Useful for debugging / developer mode. Not needed for normal run progress display.

**Option B — Stream step results (step-complete events)**
This is what the UI needs for the progress view: each completed step emits an event. Use SSE for this.

```typescript
// Fastify SSE handler sketch
fastify.get('/api/runs/:runId/stream', async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const send = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // OrchestratorService emits via EventEmitter or async generator
  for await (const stepResult of orchestratorService.runScenario(runId)) {
    send('step', stepResult);
  }

  send('done', { runId });
  reply.raw.end();
});
```

**Implementation pattern for OrchestratorService:**

```typescript
export class OrchestratorService {
  constructor(
    private provider: LLMProvider,
    private systemPrompt: string,
  ) {}

  async *runScenario(
    scenario: ParsedScenario,
    mcpClient: MCPClient,
  ): AsyncGenerator<StepResult> {
    const conversationHistory: LLMMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    for (const step of scenario.steps) {
      conversationHistory.push({ role: 'user', content: step.text });

      let fullResponse = '';
      for await (const chunk of this.provider.stream({
        messages: conversationHistory,
        model: this.provider.name,
        stream: true,
      })) {
        fullResponse += chunk.delta;
      }

      conversationHistory.push({ role: 'assistant', content: fullResponse });

      const action = parseAction(fullResponse); // extract MCP command from LLM output
      const result = await mcpClient.execute(action);

      yield {
        stepText: step.text,
        stepType: step.type,    // 'given' | 'when' | 'then'
        action,
        result,
        tokensUsed: 0,          // accumulate from LLMResponse on non-streaming path
      };
    }
  }
}
```

The conversation history growth is important: each step includes all prior assistant turns so the LLM has context about what has already been done on the page. This is stateful orchestration.

---

### 1.10 Cost Tracking Architecture

Since Azure/OpenAI do not return cost inline, build a pricing table:

```typescript
// src/orchestrator/pricing.ts
export interface ModelPricing {
  inputPer1MTokens: number;   // USD
  outputPer1MTokens: number;  // USD
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  'gpt-4o':                       { inputPer1MTokens: 5.00,   outputPer1MTokens: 15.00  },
  'gpt-4o-mini':                  { inputPer1MTokens: 0.15,   outputPer1MTokens: 0.60   },
  'anthropic/claude-3.5-sonnet':  { inputPer1MTokens: 3.00,   outputPer1MTokens: 15.00  },
  'claude-3-5-sonnet-20241022':   { inputPer1MTokens: 3.00,   outputPer1MTokens: 15.00  },
  // ... extend as needed
};

export function estimateCost(model: string, usage: LLMUsage): number {
  const pricing = PRICING_TABLE[model];
  if (!pricing) return 0;
  return (
    (usage.promptTokens / 1_000_000) * pricing.inputPer1MTokens +
    (usage.completionTokens / 1_000_000) * pricing.outputPer1MTokens
  );
}
```

**Pitfall:** Pricing changes. The table will go stale. For production accuracy, fetch from OpenRouter's `/api/v1/models` endpoint (returns pricing per model) and cache it at startup. (MEDIUM confidence — endpoint existed as of Aug 2025; verify it still exists and has the correct shape.)

---

## Topic 2: Gherkin BDD Parsing in Node.js

### 2.1 Library Landscape

**Confidence: HIGH** — These libraries have been stable for years.

| Library | Package | Maintained | TypeScript | Notes |
|---------|---------|------------|------------|-------|
| `@cucumber/gherkin` | `@cucumber/gherkin` | Yes (Cucumber team) | Yes (types included) | **Recommended** — official Cucumber parser |
| `gherkin-parse` | `gherkin-parse` | Uncertain | No | Thin wrapper around older gherkin; avoid |
| `jest-cucumber` | `jest-cucumber` | Yes | Yes | Jest-specific; not a standalone parser |
| `@badeball/cypress-cucumber-preprocessor` | (Cypress) | Yes | Yes | Cypress-specific; not usable standalone |
| `gherkin-io` | `@cucumber/gherkin` re-export | — | — | Alias; same library |

**Use `@cucumber/gherkin` (v28+).** It is the canonical, official Gherkin parser maintained by the Cucumber project itself. No credible alternative exists.

Installation:
```bash
npm install @cucumber/gherkin @cucumber/messages
```

`@cucumber/messages` provides the Protobuf-based message types that `@cucumber/gherkin` produces. Both are required.

---

### 2.2 Parsing a .feature File

**Confidence: HIGH**

```typescript
import * as Gherkin from '@cucumber/gherkin';
import * as Messages from '@cucumber/messages';
import { readFileSync } from 'fs';

export interface ParsedStep {
  type: 'Given' | 'When' | 'Then' | 'And' | 'But' | '*';
  canonicalType: 'given' | 'when' | 'then'; // resolved from last non-And/But
  text: string;                              // step text without keyword
  dataTable?: string[][];                    // inline data table if present
  docString?: string;                        // inline doc string if present
  line: number;
}

export interface ParsedScenario {
  title: string;
  tags: string[];
  steps: ParsedStep[];
  examples?: ExampleTable[];    // populated for Scenario Outlines
}

export interface ExampleTable {
  headers: string[];
  rows: string[][];
}

export interface ParsedFeature {
  title: string;
  description: string;
  tags: string[];
  background?: ParsedStep[];    // Given steps shared across all scenarios
  scenarios: ParsedScenario[];
  uri: string;
}

export function parseFeatureFile(filePath: string): ParsedFeature {
  const source = readFileSync(filePath, 'utf-8');
  return parseFeatureSource(source, filePath);
}

export function parseFeatureSource(source: string, uri = 'inline.feature'): ParsedFeature {
  const uuidFn = Messages.IdGenerator.uuid();
  const builder = new Gherkin.AstBuilder(uuidFn);
  const matcher = new Gherkin.GherkinClassicTokenMatcher(); // handles English
  const parser = new Gherkin.Parser(builder, matcher);

  const gherkinDocument = parser.parse(source);
  const feature = gherkinDocument.feature;

  if (!feature) throw new Error(`No Feature block found in: ${uri}`);

  const background = extractBackground(feature);
  const scenarios = extractScenarios(feature);

  return {
    title: feature.name,
    description: feature.description?.trim() ?? '',
    tags: feature.tags.map(t => t.name),
    background,
    scenarios,
    uri,
  };
}

function extractBackground(feature: Messages.Feature): ParsedStep[] | undefined {
  const bg = feature.children.find(c => c.background)?.background;
  if (!bg) return undefined;
  return resolveStepTypes(bg.steps);
}

function extractScenarios(feature: Messages.Feature): ParsedScenario[] {
  const scenarios: ParsedScenario[] = [];

  for (const child of feature.children) {
    if (child.scenario) {
      const scenario = child.scenario;
      const isOutline = scenario.keyword.trim() === 'Scenario Outline'
        || scenario.keyword.trim() === 'Scenario Template';

      if (isOutline && scenario.examples?.length) {
        // Expand outline into concrete scenarios
        const expanded = expandOutline(scenario);
        scenarios.push(...expanded);
      } else {
        scenarios.push({
          title: scenario.name,
          tags: scenario.tags.map(t => t.name),
          steps: resolveStepTypes(scenario.steps),
        });
      }
    }
  }

  return scenarios;
}
```

---

### 2.3 Resolving `And` / `But` Step Types

**This is the most important Gherkin gotcha.** The keywords `And` and `But` inherit type from the preceding non-And/But step. You must resolve this yourself — the parser gives you the raw keyword.

```typescript
function resolveStepTypes(steps: Messages.Step[]): ParsedStep[] {
  let lastCanonical: 'given' | 'when' | 'then' = 'given';
  const result: ParsedStep[] = [];

  for (const step of steps) {
    const keyword = step.keyword.trim() as ParsedStep['type'];
    let canonicalType: 'given' | 'when' | 'then';

    switch (keyword) {
      case 'Given': canonicalType = 'given'; lastCanonical = 'given'; break;
      case 'When':  canonicalType = 'when';  lastCanonical = 'when';  break;
      case 'Then':  canonicalType = 'then';  lastCanonical = 'then';  break;
      case 'And':
      case 'But':
      case '*':     canonicalType = lastCanonical; break;
      default:      canonicalType = lastCanonical;
    }

    result.push({
      type: keyword,
      canonicalType,
      text: step.text,
      dataTable: extractDataTable(step),
      docString: step.docString?.content,
      line: step.location.line,
    });
  }

  return result;
}

function extractDataTable(step: Messages.Step): string[][] | undefined {
  if (!step.dataTable) return undefined;
  return step.dataTable.rows.map(row =>
    row.cells.map(cell => cell.value)
  );
}
```

---

### 2.4 Scenario Outline Expansion

**Confidence: HIGH** — `@cucumber/gherkin` does NOT automatically expand Scenario Outlines into concrete instances; it gives you the template and the examples table. You must expand them.

```typescript
function expandOutline(scenario: Messages.Scenario): ParsedScenario[] {
  const results: ParsedScenario[] = [];

  for (const exampleTable of (scenario.examples ?? [])) {
    const headers = exampleTable.tableHeader?.cells.map(c => c.value) ?? [];

    for (const row of (exampleTable.tableBody ?? [])) {
      const values = row.cells.map(c => c.value);
      const substitutions = Object.fromEntries(
        headers.map((h, i) => [h, values[i] ?? ''])
      );

      const expandedSteps = resolveStepTypes(scenario.steps).map(step => ({
        ...step,
        text: substituteOutlineVariables(step.text, substitutions),
      }));

      const expandedTitle = substituteOutlineVariables(scenario.name, substitutions);

      results.push({
        title: expandedTitle,
        tags: scenario.tags.map(t => t.name),
        steps: expandedSteps,
        examples: [{
          headers,
          rows: (exampleTable.tableBody ?? []).map(r => r.cells.map(c => c.value)),
        }],
      });
    }
  }

  return results;
}

function substituteOutlineVariables(
  text: string,
  substitutions: Record<string, string>
): string {
  return text.replace(/<([^>]+)>/g, (_, key) => substitutions[key] ?? `<${key}>`);
}
```

---

### 2.5 Translating `Then` Clauses into Playwright `expect()` Calls

This is the most complex part of the feature. There are three layers of increasing sophistication:

#### Layer 1 — Regex Step Pattern Matching (Recommended for v1)

Define a registry of step patterns with corresponding assertion factory functions. This is how Cucumber itself works.

```typescript
// src/validation/assertion-registry.ts
import type { Page } from 'playwright';

export interface StepPattern {
  pattern: RegExp;
  assertion: (page: Page, match: RegExpMatchArray) => Promise<void>;
  description: string;
}

export const THEN_ASSERTION_REGISTRY: StepPattern[] = [
  {
    description: 'URL equals',
    pattern: /^the URL (?:should be|is) "(.+)"$/i,
    assertion: async (page, match) => {
      await expect(page).toHaveURL(match[1]);
    },
  },
  {
    description: 'URL contains',
    pattern: /^the URL (?:should contain|contains) "(.+)"$/i,
    assertion: async (page, match) => {
      await expect(page).toHaveURL(new RegExp(escapeRegex(match[1])));
    },
  },
  {
    description: 'Page title',
    pattern: /^the (?:page )?title (?:should be|is) "(.+)"$/i,
    assertion: async (page, match) => {
      await expect(page).toHaveTitle(match[1]);
    },
  },
  {
    description: 'Element visible',
    pattern: /^(?:I can see|the element|a) "(.+)" (?:is visible|should be visible)$/i,
    assertion: async (page, match) => {
      await expect(page.locator(match[1])).toBeVisible();
    },
  },
  {
    description: 'Element contains text',
    pattern: /^(?:the element )?"(.+)" (?:should contain|contains) text "(.+)"$/i,
    assertion: async (page, match) => {
      await expect(page.locator(match[1])).toContainText(match[2]);
    },
  },
  {
    description: 'Element has text',
    pattern: /^(?:the element )?"(.+)" (?:should have|has) text "(.+)"$/i,
    assertion: async (page, match) => {
      await expect(page.locator(match[1])).toHaveText(match[2]);
    },
  },
  {
    description: 'Element not visible',
    pattern: /^(?:the element )?"(.+)" (?:should not be|is not) visible$/i,
    assertion: async (page, match) => {
      await expect(page.locator(match[1])).not.toBeVisible();
    },
  },
  {
    description: 'Input has value',
    pattern: /^the input "(.+)" (?:should have|has) value "(.+)"$/i,
    assertion: async (page, match) => {
      await expect(page.locator(match[1])).toHaveValue(match[2]);
    },
  },
  {
    description: 'Button enabled',
    pattern: /^the button "(.+)" (?:should be|is) enabled$/i,
    assertion: async (page, match) => {
      await expect(page.locator(`button:has-text("${match[1]}")`)).toBeEnabled();
    },
  },
  {
    description: 'Button disabled',
    pattern: /^the button "(.+)" (?:should be|is) disabled$/i,
    assertion: async (page, match) => {
      await expect(page.locator(`button:has-text("${match[1]}")`)).toBeDisabled();
    },
  },
];

export function matchAssertion(
  stepText: string,
  registry: StepPattern[] = THEN_ASSERTION_REGISTRY,
): { pattern: StepPattern; match: RegExpMatchArray } | null {
  for (const pattern of registry) {
    const match = stepText.match(pattern.pattern);
    if (match) return { pattern, match };
  }
  return null;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

#### Layer 2 — LLM-Assisted Assertion Generation (for unmatched steps)

When the registry has no match, ask the LLM to generate a Playwright assertion:

```typescript
async function llmGenerateAssertion(
  stepText: string,
  provider: LLMProvider,
): Promise<string> {
  const prompt = `
Convert this Gherkin Then step into a single Playwright expect() call.
Output ONLY the TypeScript code, no markdown fences, no explanation.

Step: "${stepText}"

Example outputs:
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('h1')).toHaveText('Welcome');
  await expect(page.locator('[data-testid="error"]')).toBeVisible();
`.trim();

  const response = await provider.complete({
    messages: [{ role: 'user', content: prompt }],
    model: '', // use default
    stream: false,
  });

  return response.content.trim();
}
```

This is the dual-layer validation the project spec describes: registry match first (deterministic), LLM fallback second (flexible but needs human review flagging).

#### Layer 3 — Screenshot LLM Analysis (anti-hallucination)

For each Then step, capture a screenshot and ask the LLM:

```typescript
async function validateWithScreenshot(
  stepText: string,
  screenshotBase64: string,
  provider: LLMProvider,
): Promise<{ passed: boolean; confidence: number; reason: string }> {
  const response = await provider.complete({
    messages: [{
      role: 'user',
      content: `
You are a QA validator. Given a screenshot of a browser and a test assertion,
determine if the assertion is satisfied.

Assertion: "${stepText}"

Screenshot: [base64 image attached]

Respond in JSON: { "passed": boolean, "confidence": 0-100, "reason": "brief explanation" }
      `.trim(),
    }],
    model: '',
    stream: false,
  });

  try {
    return JSON.parse(response.content);
  } catch {
    return { passed: false, confidence: 0, reason: 'LLM response unparseable' };
  }
}
```

Note: This requires a vision-capable model. When using OpenRouter, specify a vision model like `anthropic/claude-3.5-sonnet` or `openai/gpt-4o`. The `LLMMessage.content` type above uses `string` — you'll need to extend it to support the multi-modal content array format when adding image support (LOW confidence on exact shape across providers — verify each provider's vision API format).

---

### 2.6 Gherkin Parsing Gotchas

**Confidence: HIGH** — These are well-documented issues in the Gherkin ecosystem.

#### Gotcha 1: `And` / `But` inherit type — already addressed in §2.3

If you treat `And` as its own type and dispatch it to the wrong handler, your step routing will break. Always resolve to canonical type.

#### Gotcha 2: Background steps must be prepended manually

`@cucumber/gherkin` gives you `feature.children[].background` separately. It does NOT prepend background steps to scenario step lists. You must do this:

```typescript
function withBackground(background: ParsedStep[] | undefined, scenario: ParsedScenario): ParsedScenario {
  if (!background) return scenario;
  return { ...scenario, steps: [...background, ...scenario.steps] };
}
```

#### Gotcha 3: Multi-language Gherkin

Gherkin supports 70+ languages. The `GherkinClassicTokenMatcher` handles English only. For multi-language:

```typescript
import { GherkinInMarkdownTokenMatcher } from '@cucumber/gherkin'; // for markdown
// For other languages, pass a locale string:
const matcher = new Gherkin.GherkinClassicTokenMatcher('fr'); // French
```

Available locale strings mirror ISO 639-1 codes but Gherkin has its own dialect registry. If you expect English-only input (reasonable for v1), `GherkinClassicTokenMatcher()` with no args is correct.

#### Gotcha 4: Tags are `@tag-name` with the `@` prefix in the raw AST

When you call `feature.tags.map(t => t.name)`, the returned values include the `@` prefix: `['@smoke', '@login']`. Strip it if you want bare tag names:

```typescript
tags: feature.tags.map(t => t.name.replace(/^@/, ''))
```

#### Gotcha 5: Scenario Outline keyword varies by dialect

English supports both `Scenario Outline` and `Scenario Template`. Check both:

```typescript
const isOutline = ['Scenario Outline', 'Scenario Template', 'Scenario Templates']
  .includes(scenario.keyword.trim());
```

#### Gotcha 6: DocStrings vs Data Tables — mutually exclusive per step

A step can have either a DocString or a DataTable, not both. DocStrings are used for multi-line literal text (e.g., JSON payloads). Data tables are for tabular inputs. Handle both in your `ParsedStep` type (as done in §2.2).

#### Gotcha 7: Empty feature files and partial parses throw

`parser.parse(source)` throws a `GherkinParserError` on syntax errors. Wrap in try/catch and surface the error with the file path and line number for debugging:

```typescript
try {
  const doc = parser.parse(source);
} catch (e) {
  if (e instanceof Gherkin.GherkinParserError || e instanceof Error) {
    throw new Error(`Gherkin parse error in ${uri}: ${e.message}`);
  }
  throw e;
}
```

#### Gotcha 8: Windows line endings (CRLF) can corrupt token matching

On Windows, `.feature` files saved with CRLF can confuse the tokenizer. Normalize before parsing:

```typescript
const normalizedSource = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
```

This is relevant since this project runs on Windows 11.

#### Gotcha 9: File encoding — always specify UTF-8

`readFileSync(filePath, 'utf-8')` is correct. Do not rely on the default `Buffer` return, which requires `.toString()` and may not handle non-ASCII characters in step text (e.g., step text with em-dashes or Unicode quotes).

---

## Recommendation Table

| Decision | Recommendation | Confidence | Alternatives | Why Not |
|----------|---------------|------------|-------------|---------|
| LLM abstraction strategy | Custom adapter pattern (§1.2) | HIGH | Vercel AI SDK, LangChain | Too heavy, wrong runtime optimizations, leaky abstractions |
| OpenRouter integration | `openai` npm package with `baseURL` override | HIGH | Raw `fetch` against REST | Official SDK handles streaming, retries, type safety |
| Anthropic integration | `@anthropic-ai/sdk` directly | HIGH | Via OpenRouter proxy | Direct = no proxy cost markup; cleaner error messages |
| Streaming transport to frontend | SSE (Server-Sent Events) via Fastify | HIGH | WebSocket | Unidirectional push is sufficient; simpler reconnect semantics |
| Streaming data model | One event per completed step, not per LLM token | HIGH | Token-level streaming to UI | Token stream is debug info; step completion is UX signal |
| Cost tracking | Pricing table + OpenRouter inline cost for OpenRouter runs | MEDIUM | Real-time OpenRouter API | API call per run adds latency; table is fast and good enough |
| Gherkin parser | `@cucumber/gherkin` v28+ | HIGH | `gherkin-parse`, roll your own | Official, maintained, full spec compliance |
| `And`/`But` resolution | Manual canonical type tracking (§2.3) | HIGH | Leave as-is | Dispatching `And` steps to wrong handler breaks orchestration |
| Scenario Outline expansion | Manual expansion at parse time (§2.4) | HIGH | Expand lazily at runtime | Simpler downstream — orchestrator sees flat list of concrete scenarios |
| Then → Playwright assertion | Regex registry + LLM fallback (§2.5) | HIGH | LLM-only, regex-only | Regex is deterministic for common patterns; LLM handles long tail |
| Vision assertion validation | Vision-capable model via same LLMProvider interface | MEDIUM | Playwright-only assertions | LLM screenshot analysis is the anti-hallucination layer per spec |
| CRLF normalization | Normalize before parsing (§2.6 Gotcha 8) | HIGH | Ignore | Project runs on Windows 11; CRLF is a real risk here |

---

## Open Questions / Items to Validate

These require live documentation verification (web access was unavailable during this research session):

1. **OpenRouter cost field name** (LOW confidence): The exact field name on the `usage` object that contains cost (`total_cost`, `x-openrouter-cost`, or similar). Verify at `https://openrouter.ai/docs/api-reference/overview`.

2. **OpenRouter streaming cost endpoint** (MEDIUM confidence): Whether `/api/v1/generation?id={id}` is the correct endpoint for retrieving usage/cost after a streaming call completes. Verify in current OpenRouter docs.

3. **Vercel AI SDK OpenRouter provider** (LOW confidence on current status): `@openrouter/ai-sdk-provider` may have improved since Aug 2025. Re-evaluate if the project wants to standardize on AI SDK for other reasons (e.g., structured output with `generateObject`).

4. **`@cucumber/gherkin` current version** (MEDIUM confidence): v28 was current as of Aug 2025. Verify latest version and any breaking changes: `npm info @cucumber/gherkin version`.

5. **Vision API message format per provider** (LOW confidence): The multimodal `content` array format differs between OpenAI, Anthropic, and Azure. The `LLMMessage.content: string` type above must be extended to `string | ContentPart[]` when adding screenshot validation. Verify the exact format for each provider before implementing.

6. **Azure OpenAI `apiVersion`** (MEDIUM confidence): The `2024-02-01` version is a known stable version but may not be the latest. Check Azure OpenAI release notes for the current recommended stable version.
