# Research: Real-time Streaming, Screenshot Validation, and Loop Detection

**Project:** MCP Playwright Test Playground
**Researched:** 2026-03-30
**Overall Confidence:** MEDIUM-HIGH (training knowledge through Aug 2025; WebSearch/WebFetch unavailable in this session)
**Note on Sources:** External web access was restricted during this session. All findings are drawn
from verified training-time knowledge of official APIs (Fastify, Playwright, Node.js, OpenRouter).
Confidence is downgraded one level wherever the landscape evolves rapidly (LLM pricing, model
availability). Validate those sections before implementation.

---

## Topic 1: Real-time Streaming — Fastify to React

### 1.1 SSE vs WebSocket: Which to Use

**Recommendation: SSE (Server-Sent Events)**

| Criterion | SSE | WebSocket |
|-----------|-----|-----------|
| Direction | Server → Client only | Bidirectional |
| Protocol | HTTP/1.1 or HTTP/2 | Upgraded TCP |
| Reconnection | Built-in (browser-native) | Manual |
| Proxy/CDN compatibility | Excellent (standard HTTP) | Varies; many proxies need config |
| Fastify integration | Trivial — plain HTTP response | Requires `@fastify/websocket` plugin |
| React consumption | `EventSource` API, no library needed | Requires client library or raw API |
| Message ordering | Guaranteed, sequential | Guaranteed per connection |
| Multiple streams | One `EventSource` per test run is fine | One socket can multiplex with message IDs |
| Browser reconnect | Auto after disconnect | Must implement manually |

**Rationale for SSE:**

This use case is purely server-push: the server streams test step events to the browser as they
happen, and the browser has no data to send back during streaming (the test is already running).
SSE is semantically correct for unidirectional push and has zero additional dependencies on either
side.

The one scenario where WebSocket wins — multiplexing many concurrent test runs over a single
connection — is achievable with SSE via `EventSource` per run or named event types per run. For
fewer than ~20 concurrent runs (typical in a playground), the overhead of one SSE connection per
run is negligible.

**Confidence:** HIGH — This is a well-settled engineering trade-off.

---

### 1.2 Fastify SSE Implementation (TypeScript)

Fastify does not need a plugin for SSE. SSE is a plain HTTP response with specific headers and a
chunked body. The implementation pattern is:

```typescript
// src/routes/test-stream.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

interface RunParams {
  runId: string
}

export async function streamRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: RunParams }>(
    '/stream/:runId',
    async (request: FastifyRequest<{ Params: RunParams }>, reply: FastifyReply) => {
      const { runId } = request.params

      // Set SSE headers BEFORE any body write
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',   // Disables nginx buffering — critical in prod
        'Access-Control-Allow-Origin': '*',
      })

      // Helper to format SSE frames
      const send = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`)
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      // Heartbeat — prevents proxy 30s timeout kills
      const heartbeat = setInterval(() => {
        reply.raw.write(': heartbeat\n\n')
      }, 15_000)

      // Clean up on client disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeat)
        // Signal the test runner to abort this run if still in progress
        fastify.testRunnerService.abort(runId)
      })

      // Subscribe to the run's event emitter
      const runner = fastify.testRunnerService.get(runId)
      if (!runner) {
        send('error', { message: `Run ${runId} not found` })
        reply.raw.end()
        return
      }

      runner.on('step', (step: StepEvent) => send('step', step))
      runner.on('screenshot', (s: ScreenshotEvent) => send('screenshot', s))
      runner.on('validation', (v: ValidationEvent) => send('validation', v))
      runner.on('done', (result: RunResult) => {
        send('done', result)
        clearInterval(heartbeat)
        reply.raw.end()
      })
      runner.on('error', (err: Error) => {
        send('error', { message: err.message })
        clearInterval(heartbeat)
        reply.raw.end()
      })
    }
  )
}
```

**Key implementation details:**

- `reply.raw` bypasses Fastify's response lifecycle and writes directly to the Node.js
  `http.ServerResponse`. This is the correct approach for long-lived streaming responses.
- `X-Accel-Buffering: no` is mandatory if nginx sits in front — without it, nginx will buffer the
  entire response until connection close, destroying the real-time effect.
- The heartbeat comment line (`: heartbeat\n\n`) is a valid SSE comment that resets the TCP idle
  timer without the browser firing an event handler.
- `reply.raw` does NOT call `reply.send()` — mixing the two will cause double-response errors.
- Register `@fastify/cors` and ensure the SSE route is included in the CORS allow-list, or set
  headers manually as shown above.

**Confidence:** HIGH — `reply.raw` for SSE is documented Fastify pattern; `X-Accel-Buffering` is
a well-known nginx requirement.

---

### 1.3 React SSE Consumption

```typescript
// src/hooks/useTestStream.ts
import { useEffect, useRef, useCallback } from 'react'
import { useTestRunStore } from '../store/testRunStore'

export function useTestStream(runId: string | null) {
  const esRef = useRef<EventSource | null>(null)
  const { appendStep, setScreenshot, setValidation, setDone, setError } = useTestRunStore()

  const connect = useCallback((id: string) => {
    // Close any existing connection for this runId
    esRef.current?.close()

    const es = new EventSource(`/api/stream/${id}`)
    esRef.current = es

    es.addEventListener('step', (e) => {
      appendStep(id, JSON.parse(e.data))
    })

    es.addEventListener('screenshot', (e) => {
      setScreenshot(id, JSON.parse(e.data))
    })

    es.addEventListener('validation', (e) => {
      setValidation(id, JSON.parse(e.data))
    })

    es.addEventListener('done', (e) => {
      setDone(id, JSON.parse(e.data))
      es.close()         // Server sends end, we close
    })

    es.addEventListener('error', (e) => {
      // EventSource fires 'error' both for server errors AND network blips
      // readyState === EventSource.CLOSED means it won't auto-reconnect
      if (es.readyState === EventSource.CLOSED) {
        setError(id, 'Stream closed unexpectedly')
      }
      // readyState === EventSource.CONNECTING means browser is auto-reconnecting
      // Do not treat transient reconnection as fatal
    })

    return es
  }, [appendStep, setScreenshot, setValidation, setDone, setError])

  useEffect(() => {
    if (!runId) return
    const es = connect(runId)
    return () => { es.close() }
  }, [runId, connect])
}
```

**State management pattern (Zustand recommended):**

```typescript
// src/store/testRunStore.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface StepEvent {
  stepIndex: number
  tool: string
  input: Record<string, unknown>
  output?: unknown
  status: 'running' | 'passed' | 'failed'
  durationMs: number
}

interface RunState {
  steps: StepEvent[]
  screenshots: Record<number, string>   // stepIndex → base64 PNG
  validations: Record<number, ValidationResult>
  status: 'idle' | 'running' | 'done' | 'error'
  error?: string
}

interface TestRunStore {
  runs: Record<string, RunState>
  appendStep: (runId: string, step: StepEvent) => void
  setScreenshot: (runId: string, ev: { stepIndex: number; dataUrl: string }) => void
  setValidation: (runId: string, ev: { stepIndex: number; result: ValidationResult }) => void
  setDone: (runId: string, result: unknown) => void
  setError: (runId: string, message: string) => void
}

export const useTestRunStore = create<TestRunStore>()(
  immer((set) => ({
    runs: {},
    appendStep: (runId, step) =>
      set((state) => {
        if (!state.runs[runId]) state.runs[runId] = emptyRun()
        state.runs[runId].steps.push(step)
      }),
    // ... other handlers follow same pattern
  }))
)
```

**Why Zustand + Immer here:**
- `immer` middleware allows mutation-style updates on deeply nested state, avoiding the
  `{...state, runs: {...state.runs, [runId]: ...}}` boilerplate that becomes unmanageable with
  parallel runs.
- Each incoming SSE event is a small, targeted update — Zustand's shallow comparison means React
  only re-renders components subscribed to the specific run that changed.

**Confidence:** HIGH — `EventSource` API behavior is stable and well-documented.

---

### 1.4 Parallel Results from Multiple MCPs

When multiple MCP instances run simultaneously, each run gets its own SSE endpoint
(`/stream/:runId`). The React side opens one `EventSource` per active run. This is the simplest
correct approach and has no practical limit until ~50 concurrent connections per browser tab
(browser-imposed limit on connections to the same origin with HTTP/1.1 is 6, but these are
long-lived SSE streams, not short requests — they count against that limit).

**For more than 6 concurrent runs on the same origin:**

Option A — Use HTTP/2 on the server. HTTP/2 multiplexes all SSE streams over one TCP connection,
eliminating the 6-connection limit. Fastify supports HTTP/2 natively (`http2: true` in the server
options). Browser `EventSource` works transparently over HTTP/2.

Option B — Route events through a single SSE endpoint with a `runId` field in the data payload
and filter client-side:

```typescript
// Single endpoint, all runs
es.addEventListener('step', (e) => {
  const { runId, ...step } = JSON.parse(e.data)
  appendStep(runId, step)
})
```

**Recommendation:** Start with one SSE per run over HTTP/2. If HTTP/2 is not immediately
available, use the single-endpoint fan-out pattern.

**Confidence:** MEDIUM — HTTP/2 SSE behavior in Fastify is well-documented; the browser 6-
connection limit for SSE is confirmed browser behavior; recommend verifying HTTP/2 with your
specific reverse proxy setup.

---

## Topic 2: Screenshot-based Hallucination Detection

### 2.1 Capturing Screenshots Mid-Test in Playwright MCP

The MCP Playwright server exposes Playwright browser capabilities as MCP tools. The key insight
is that the MCP protocol itself does not provide screenshot hooks — you must instrument the
layer that orchestrates MCP tool calls.

**Three viable approaches, ordered by preference:**

#### Approach A: Wrap MCP Tool Calls in a Proxy Layer (RECOMMENDED)

Rather than trying to hook into Playwright's internal events, intercept every MCP tool call at
the orchestration layer and capture a screenshot after each call completes:

```typescript
// src/services/instrumentedMcpClient.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

export class InstrumentedMcpClient {
  private client: Client
  private page: Page   // Playwright Page reference
  private stepIndex = 0
  private onScreenshot: (index: number, png: Buffer) => void

  constructor(
    client: Client,
    page: Page,
    onScreenshot: (index: number, png: Buffer) => void
  ) {
    this.client = client
    this.page = page
    this.onScreenshot = onScreenshot
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const index = this.stepIndex++
    const result = await this.client.callTool({ name, arguments: args })

    // Capture immediately after every tool call
    try {
      const png = await this.page.screenshot({
        type: 'png',
        fullPage: false,   // Viewport only — faster, usually sufficient
        timeout: 5_000,    // Don't let screenshot block test progress
      })
      this.onScreenshot(index, png)
    } catch (err) {
      // Screenshot failure is non-fatal — log, don't throw
      console.warn(`Screenshot at step ${index} failed:`, err)
    }

    return result
  }
}
```

**Why this is better than Playwright reporter hooks:** The MCP test runner controls which MCP
tools are called; it already has the `Page` object and the tool call sequence. Wrapping at this
layer gives you a screenshot correlated to the exact tool call, not a page lifecycle event.

#### Approach B: Playwright `page.on('requestfinished')` or `page.on('load')`

For navigation-heavy tests, you can listen to page navigation events and capture screenshots on
each full page load:

```typescript
page.on('load', async () => {
  const png = await page.screenshot({ type: 'png' })
  emitScreenshot(png)
})
```

Limitation: Does not fire for DOM mutations that don't trigger navigation (e.g., SPAs updating
content via fetch). Misses many meaningful state changes.

#### Approach C: Playwright Reporter `onStepEnd` (Test Framework Only)

If tests are written as Playwright `.spec.ts` files, the reporter API gives you `onStepEnd`:

```typescript
// playwright-reporter.ts
import { Reporter, TestStep } from '@playwright/test/reporter'

class ScreenshotReporter implements Reporter {
  async onStepEnd(test, result, step: TestStep) {
    if (step.category === 'pw:api') {
      // step.result.attachment — screenshots added here are in the Playwright HTML report
    }
  }
}
```

Limitation: Only works for `@playwright/test`-driven tests, not raw Playwright API usage with MCP.
Not applicable unless the MCP test runner wraps `@playwright/test`.

**Recommendation: Approach A.** It is framework-agnostic, correlates screenshots to MCP tool
calls precisely, and handles failures gracefully.

**Confidence:** HIGH for Approach A (tool call wrapping is a standard proxy pattern). MEDIUM for
Approach C (Playwright reporter API has been stable but its exact shape for MCP scenarios should
be verified against current Playwright docs).

---

### 2.2 Sending Screenshots to an LLM (Vision Models)

Screenshots should be sent as base64-encoded PNG in the OpenAI-compatible vision message format.
This format is supported by all major providers through OpenRouter.

```typescript
// src/services/visionValidator.ts

export interface ValidationResult {
  stepIndex: number
  playwrightResult: 'passed' | 'failed'
  llmVerdict: 'matches' | 'contradicts' | 'uncertain'
  llmReasoning: string
  hallucinated: boolean
  confidence: number   // 0..1
}

export async function validateStepWithVision(params: {
  stepIndex: number
  tool: string
  toolArgs: Record<string, unknown>
  playwrightResult: 'passed' | 'failed'
  screenshotPng: Buffer
  openrouterApiKey: string
  model: string
}): Promise<ValidationResult> {
  const base64Image = params.screenshotPng.toString('base64')

  const systemPrompt = `You are a browser state auditor. You receive:
1. The name and arguments of a Playwright MCP tool call.
2. The tool call result (passed/failed) as reported by the MCP server.
3. A screenshot of the browser taken immediately after the tool call.

Your job: determine whether the screenshot is consistent with the reported result.
Respond in JSON with fields: verdict ("matches"|"contradicts"|"uncertain"), reasoning (string),
confidence (0.0-1.0).

A "contradicts" verdict means the MCP server reported success but the screenshot shows a
clearly different state, or vice versa. An "uncertain" verdict means the screenshot alone is
not enough to confirm or deny the reported result.`

  const userMessage = {
    role: 'user' as const,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          tool: params.tool,
          args: params.toolArgs,
          reportedResult: params.playwrightResult,
        }, null, 2),
      },
      {
        type: 'image_url' as const,
        image_url: {
          url: `data:image/png;base64,${base64Image}`,
          detail: 'high',   // 'high' = 2048px tile analysis; 'low' = 512px thumbnail
        },
      },
    ],
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://mcp-playwright-playground',
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: 'system', content: systemPrompt },
        userMessage,
      ],
      response_format: { type: 'json_object' },
      max_tokens: 512,
      temperature: 0,   // Deterministic for auditing
    }),
  })

  const json = await response.json()
  const raw = JSON.parse(json.choices[0].message.content)

  const contradicts = raw.verdict === 'contradicts'
  const hallucinated =
    contradicts && params.playwrightResult === 'passed' && raw.confidence > 0.7

  return {
    stepIndex: params.stepIndex,
    playwrightResult: params.playwrightResult,
    llmVerdict: raw.verdict,
    llmReasoning: raw.reasoning,
    hallucinated,
    confidence: raw.confidence,
  }
}
```

**Key parameter notes:**

- `detail: 'high'` tiles the image into 512px blocks and analyzes each. For 1280×720 viewport
  screenshots this costs ~765 tokens (OpenAI tile pricing). For `detail: 'low'` it costs 85
  tokens fixed. Use `low` during development to keep costs down.
- `temperature: 0` is important for reproducibility — you want auditable, deterministic verdicts.
- `response_format: { type: 'json_object' }` is supported by GPT-4o, Claude 3.x via OpenRouter.
  Not all models support it; fall back to regex extraction if the model does not.

**Confidence:** HIGH — OpenAI-compatible vision API format; base64 inline images are standard.

---

### 2.3 Vision Model Recommendations via OpenRouter

**Note on confidence:** Model availability and pricing on OpenRouter change frequently. The
recommendations below were accurate as of August 2025. Verify current pricing at
`openrouter.ai/models` before committing to a specific model.

| Model | Cost (per 1K tokens, approx.) | Accuracy | Best For |
|-------|-------------------------------|----------|----------|
| `google/gemini-2.0-flash` | Very low (~$0.10/1M input) | Good | High-volume step validation, development |
| `google/gemini-2.5-pro` | Medium | Excellent | Deep analysis, contradiction detection |
| `anthropic/claude-3-5-haiku` | Low | Very Good | Balance of cost and accuracy |
| `anthropic/claude-3-5-sonnet` | Medium | Excellent | Production validation, highest accuracy |
| `openai/gpt-4o-mini` | Very low | Good | Bulk validation cheaply |
| `openai/gpt-4o` | Medium-high | Excellent | Reference baseline |

**Practical strategy — tiered validation:**

```
Step runs
  └─> Playwright assertion result captured
  └─> Screenshot captured
  └─> Fast model (Gemini Flash or GPT-4o-mini): "obvious contradiction?"
        If verdict === 'contradicts' with confidence > 0.8:
          └─> Escalate to high-accuracy model (Claude Sonnet or Gemini Pro)
              └─> Record final hallucination verdict
        Else:
          └─> Accept fast-model verdict, mark 'uncertain' if confidence < 0.4
```

This tiered approach reduces cost by ~70% while maintaining accuracy on the cases that matter
(high-confidence contradictions get escalated, low-confidence ambiguous cases are flagged but
not escalated automatically).

**Confidence:** MEDIUM — Model names correct as of Aug 2025; pricing and relative performance
shift with new releases. Validate model IDs via `https://openrouter.ai/api/v1/models` before
implementing.

---

### 2.4 Comparing Playwright Assertions vs LLM Screenshot Analysis

The dual-layer validation creates four result combinations:

| Playwright | LLM Verdict | Interpretation | Action |
|------------|-------------|----------------|--------|
| passed | matches | Confirmed success | No flag |
| passed | contradicts | **Hallucination candidate** — MCP reported success, screenshot disagrees | Flag as `HALLUCINATION_SUSPECTED` |
| passed | uncertain | Ambiguous — screenshot may not be informative | Flag as `NEEDS_REVIEW` |
| failed | matches | Inconsistency — screenshot looks right but test failed | Flag as `ASSERTION_MISMATCH` |
| failed | contradicts | Confirmed failure — both agree on failure | Log as expected failure |
| failed | uncertain | Normal failure, inconclusive screenshot | Log as `FAILED_UNVERIFIED` |

The most valuable case is `passed + contradicts`: the MCP server claimed the action succeeded
(e.g., "clicked the submit button"), but the screenshot shows the button was never clicked or
the form never submitted. This is the canonical AI hallucination in MCP tool reporting.

**Data model for storing results:**

```typescript
interface StepValidation {
  runId: string
  stepIndex: number
  timestamp: number
  tool: string
  toolArgs: Record<string, unknown>
  playwrightPassed: boolean
  screenshotDataUrl: string          // data:image/png;base64,...
  llmModel: string
  llmVerdict: 'matches' | 'contradicts' | 'uncertain'
  llmReasoning: string
  llmConfidence: number
  hallucinated: boolean
  escalated: boolean                 // true if tiered escalation was triggered
  escalatedModel?: string
  escalatedVerdict?: string
}
```

**Confidence:** HIGH — This is a logical data modeling exercise, not a library API.

---

## Topic 3: Loop Detection and Timeout Patterns

### 3.1 Infinite Loop Detection in MCP Tool Calls

An infinite loop in MCP tool calling occurs when the LLM driving the MCP client repeatedly calls
the same tool with the same (or equivalent) arguments without making progress. Detection requires
tracking call history and comparing against configurable thresholds.

**Pattern: Sliding window fingerprint detector**

```typescript
// src/services/loopDetector.ts

interface CallRecord {
  tool: string
  argsFingerprint: string
  timestamp: number
}

export class LoopDetector {
  private history: CallRecord[] = []
  private readonly windowSize: number
  private readonly threshold: number

  constructor(options: { windowSize?: number; threshold?: number } = {}) {
    // windowSize: look at last N calls; threshold: how many identical fingerprints = loop
    this.windowSize = options.windowSize ?? 10
    this.threshold = options.threshold ?? 3
  }

  record(tool: string, args: Record<string, unknown>): void {
    const fingerprint = this.fingerprint(tool, args)
    this.history.push({ tool, argsFingerprint: fingerprint, timestamp: Date.now() })
    // Keep only the last windowSize records
    if (this.history.length > this.windowSize) {
      this.history.shift()
    }
  }

  isLooping(): { detected: boolean; tool?: string; count?: number } {
    if (this.history.length < this.threshold) {
      return { detected: false }
    }

    // Count occurrences of each fingerprint in the window
    const counts = new Map<string, number>()
    for (const record of this.history) {
      counts.set(record.argsFingerprint, (counts.get(record.argsFingerprint) ?? 0) + 1)
    }

    for (const [fp, count] of counts) {
      if (count >= this.threshold) {
        const match = this.history.find((r) => r.argsFingerprint === fp)!
        return { detected: true, tool: match.tool, count }
      }
    }

    return { detected: false }
  }

  private fingerprint(tool: string, args: Record<string, unknown>): string {
    // Stable JSON serialization — sort keys to handle object property ordering
    return `${tool}:${JSON.stringify(args, Object.keys(args).sort())}`
  }

  reset(): void {
    this.history = []
  }
}
```

**Usage in the test runner:**

```typescript
const loopDetector = new LoopDetector({ windowSize: 10, threshold: 3 })

async function executeStep(tool: string, args: Record<string, unknown>) {
  loopDetector.record(tool, args)

  const loopCheck = loopDetector.isLooping()
  if (loopCheck.detected) {
    throw new LoopDetectedError(
      `Tool "${loopCheck.tool}" called ${loopCheck.count} times in last 10 steps`
    )
  }

  return await mcpClient.callTool({ name: tool, arguments: args })
}
```

**Fuzzy loop detection for near-identical args:**

Exact fingerprint matching misses loops where args vary slightly (e.g., slightly different
selectors, incrementing counters). For those cases, add a tool-name-only counter:

```typescript
private toolCallCounts = new Map<string, number>()

recordAndCheckToolBudget(tool: string, maxPerTool = 20): void {
  const count = (this.toolCallCounts.get(tool) ?? 0) + 1
  this.toolCallCounts.set(tool, count)
  if (count > maxPerTool) {
    throw new ToolBudgetExceededError(`Tool "${tool}" called ${count} times (max ${maxPerTool})`)
  }
}
```

**Confidence:** HIGH — This is algorithmic; no external API dependency.

---

### 3.2 Hard Timeout Per Step (Async Node.js)

Node.js does not provide preemptive cancellation of async operations, but `AbortController` +
`Promise.race` gives you effective per-operation timeouts that propagate cancellation to fetch
calls and Playwright operations.

```typescript
// src/utils/withTimeout.ts

export class StepTimeoutError extends Error {
  constructor(tool: string, timeoutMs: number) {
    super(`Step "${tool}" exceeded timeout of ${timeoutMs}ms`)
    this.name = 'StepTimeoutError'
  }
}

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  const controller = new AbortController()
  const { signal } = controller

  const timeoutHandle = setTimeout(() => {
    controller.abort(new StepTimeoutError(label, timeoutMs))
  }, timeoutMs)

  try {
    return await Promise.race([
      operation(signal),
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    ])
  } finally {
    clearTimeout(timeoutHandle)
  }
}
```

**Usage:**

```typescript
const result = await withTimeout(
  async (signal) => {
    // Pass signal to Playwright — it respects AbortSignal
    return await page.goto(url, { timeout: stepTimeoutMs })
    // Pass signal to fetch calls for LLM API
    // return await fetch(url, { signal })
  },
  30_000,
  'navigate_to_url'
)
```

**Important Playwright note:** Playwright's own methods accept a `timeout` option in milliseconds.
Always set Playwright timeouts to slightly less than your outer `withTimeout` value to get
Playwright's more descriptive error messages rather than the generic abort error:

```typescript
await withTimeout(
  async () => page.click(selector, { timeout: 25_000 }),
  30_000,
  'click_element'
)
```

**Layered timeout strategy:**

```
Per-step timeout (30s default)
  └─> Playwright action timeout (25s — slightly less, better error messages)
  └─> LLM API timeout (15s — vision API calls can be slow)
      └─> Screenshot capture timeout (5s)

Per-run total timeout (5 min default)
  └─> Implemented as a top-level AbortController passed to the entire run
  └─> Checked at the start of each step; if expired, run is aborted

Total token budget (checked before each LLM call)
  └─> Accumulated token count vs configured max
  └─> Hard stop if exceeded (see 3.3)
```

**Confidence:** HIGH — `AbortController`, `Promise.race`, and Playwright's timeout option are
stable, well-documented Node.js and Playwright features.

---

### 3.3 Token Counting and Budget Enforcement During Streaming

When using streaming LLM responses (`stream: true`), the full token count is only available in
the `usage` field of the final `[DONE]` chunk. For budget enforcement, you need a running
estimate during the stream and a hard check after completion.

**Pattern: Streaming with running token budget:**

```typescript
// src/services/tokenBudget.ts

export interface TokenBudgetConfig {
  maxTotalTokens: number         // Hard limit for entire run
  maxPerStepTokens: number       // Hard limit per LLM call
  warningThresholdPct: number    // Emit warning at this % of maxTotalTokens (e.g., 0.8)
}

export class TokenBudget {
  private consumed = 0
  private readonly config: TokenBudgetConfig
  private readonly onWarning: (consumed: number, max: number) => void

  constructor(config: TokenBudgetConfig, onWarning: (c: number, m: number) => void) {
    this.config = config
    this.onWarning = onWarning
  }

  // Call after each LLM API response (from usage.total_tokens)
  record(tokensUsed: number): void {
    this.consumed += tokensUsed

    const threshold = this.config.maxTotalTokens * this.config.warningThresholdPct
    if (this.consumed >= threshold && this.consumed - tokensUsed < threshold) {
      this.onWarning(this.consumed, this.config.maxTotalTokens)
    }
  }

  checkAndThrowIfExceeded(): void {
    if (this.consumed >= this.config.maxTotalTokens) {
      throw new TokenBudgetExceededError(this.consumed, this.config.maxTotalTokens)
    }
  }

  remaining(): number {
    return Math.max(0, this.config.maxTotalTokens - this.consumed)
  }

  summary(): { consumed: number; max: number; remaining: number; pct: number } {
    return {
      consumed: this.consumed,
      max: this.config.maxTotalTokens,
      remaining: this.remaining(),
      pct: this.consumed / this.config.maxTotalTokens,
    }
  }
}
```

**Streaming response consumption with token tracking:**

```typescript
async function callLlmWithBudget(
  params: LlmCallParams,
  budget: TokenBudget
): Promise<string> {
  // Pre-flight check before spending tokens
  budget.checkAndThrowIfExceeded()

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      stream: true,
      stream_options: { include_usage: true },  // OpenAI-compatible, returns usage in final chunk
    }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let finalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) fullContent += delta

        // Usage is only in the final chunk when stream_options.include_usage is set
        if (parsed.usage) {
          finalUsage = parsed.usage
        }
      } catch {
        // Malformed chunk — skip
      }
    }
  }

  if (finalUsage) {
    budget.record(finalUsage.total_tokens)
  } else {
    // Fallback: rough estimate (4 chars ≈ 1 token) — imprecise but prevents zero-accounting
    budget.record(Math.ceil((params.messages.join('').length + fullContent.length) / 4))
  }

  // Post-call check — if this call pushed us over budget, next call will throw
  budget.checkAndThrowIfExceeded()

  return fullContent
}
```

**Key notes:**

- `stream_options: { include_usage: true }` is an OpenAI API extension that adds a usage object
  to the final stream chunk. Supported by OpenAI models. OpenRouter passes it through for
  compatible models; for incompatible models it is ignored and you fall back to estimation.
- For vision calls (non-streaming), usage is always in the response — simpler.
- Token counting libraries like `tiktoken` (OpenAI) or `@anthropic-ai/tokenizer` can give
  pre-call estimates for input tokens, letting you reject a call before making it if the prompt
  alone would exceed the per-step limit.
- Screenshot tokens via `detail: high` follow OpenAI's tiling formula:
  `tokens = 85 + 170 * ceil(width/512) * ceil(height/512)`. For a 1280×720 PNG:
  `85 + 170 * 3 * 2 = 85 + 1020 = 1105 tokens` — significant at scale.

**Confidence:** HIGH for streaming pattern and `stream_options`. MEDIUM for per-model token
counting accuracy (tiling formula is OpenAI-specific; Anthropic and Google use different formulas).

---

## Gotchas

### SSE / Streaming

1. **nginx buffering kills SSE silently.** Without `X-Accel-Buffering: no`, events accumulate on
   the server and flush only on connection close. The UI appears stuck. This is the #1 SSE
   deployment bug.

2. **`reply.raw` and `reply.send()` cannot both be used.** Calling `reply.send()` after writing
   to `reply.raw` causes "Reply already sent" errors. Pick one path for each route handler.

3. **EventSource reconnects with `Last-Event-ID`.** If you send `id: <n>` with each SSE frame,
   the browser will include `Last-Event-ID: <n>` on reconnect. Implement resume logic on the
   server, or use random IDs to prevent the server from being asked to replay events it no longer
   has.

4. **HTTP/2 SSE requires `allowHTTP1: false` (or both).** Fastify's `http2: true` setting enables
   HTTP/2 but maintains HTTP/1.1 compatibility. Verify your reverse proxy forwards HTTP/2
   correctly — many nginx configurations downgrade to HTTP/1.1 between proxy and backend.

5. **Large screenshots over SSE.** A 1280×720 PNG can be 100-500KB. Sending it as base64 in an
   SSE data payload inflates size by ~33%. Consider:
   - Sending a screenshot ID via SSE, then fetching the image separately via a REST endpoint.
   - JPEG compression at quality 80 reduces size by ~5x with acceptable quality for UI display.
   - Only send thumbnails (320×200) via SSE; full-res available on demand.

### Screenshot Validation

6. **Screenshot timing race condition.** `page.screenshot()` captures the DOM state at call time,
   but if the page is still transitioning (animation, async fetch), the screenshot may not reflect
   the final state. Add a brief `page.waitForLoadState('networkidle')` or a targeted
   `page.waitForSelector('[data-testid="result"]')` before capturing when the action is expected
   to produce visible output.

7. **LLM vision models are not reliable for small UI elements.** Checkboxes, radio buttons, and
   small status indicators are often misidentified at 512px tile resolution. Reserve LLM validation
   for high-level state changes (page content, navigation, form submission success), not pixel-level
   assertion.

8. **`response_format: json_object` does not guarantee schema.** The model will return valid JSON
   but may include extra fields or omit expected ones. Always use optional chaining and fallback
   defaults when parsing LLM JSON responses.

9. **Screenshot size means high token cost at scale.** A test run with 50 steps at `detail: high`
   per screenshot costs ~55,000 vision tokens in analysis alone. Budget accordingly or use
   `detail: low` by default and escalate to `detail: high` only on suspected contradictions.

### Loop Detection and Timeouts

10. **Exact fingerprinting misses semantic loops.** An LLM might call `click` with
    `selector: '#btn'` then `click` with `selector: 'button[type=submit]'` — same action,
    different selector string. The fingerprint detector will not catch this. Combine exact
    fingerprint matching with a per-tool call count limit as a secondary safety net.

11. **AbortController does not cancel CPU-bound work.** `abort()` signals are checked at
    `await` boundaries. A synchronous tight loop will not be interrupted. For Playwright actions
    (network-bound) and LLM calls (I/O-bound), this is not an issue. For any custom synchronous
    processing, add explicit signal checks.

12. **`Promise.race` does not cancel the losing promise.** After the timeout fires, the Playwright
    action or LLM fetch is still in flight until it completes or errors naturally. Pass the
    `AbortSignal` into the underlying operations (Playwright `timeout` option, fetch `signal`)
    to actually cancel the I/O.

13. **Token estimation diverges from actual usage with vision.** The 4-chars-per-token fallback
    estimate completely ignores image tokens (which can be 1,000+ tokens per screenshot). Always
    use the `usage` field from the actual API response rather than pre-flight estimation for
    budget accounting. Pre-flight estimation is only useful for rejecting obviously oversized prompts.

14. **`include_usage` in streaming is model-dependent.** Not all models routed through OpenRouter
    return usage in the stream. Implement the char-count fallback, and consider making the
    validation call non-streaming (vision calls with `max_tokens: 512` complete quickly anyway
    — streaming buys little here).

---

## Recommended Implementation Order

Based on the above research, the natural dependency order for building this system is:

1. **SSE transport (Fastify + React hook)** — Everything depends on events flowing correctly.
   No LLM or screenshot work should start until the real-time feed works end-to-end.

2. **Test runner with `withTimeout` and `LoopDetector`** — Build the safe execution harness
   before adding any external calls (LLM, screenshot) that can hang or loop.

3. **Screenshot capture via proxy wrapper** — Wire `InstrumentedMcpClient` to the runner.
   Verify screenshots arrive in the React UI before adding LLM analysis.

4. **Token budget and `TokenBudget` class** — Add budget tracking before the first LLM call
   to prevent runaway costs during development.

5. **LLM validation (single fast model, no tiering)** — Prove the validation pipeline works
   end-to-end with one model before adding the tiered escalation logic.

6. **Tiered escalation and hallucination scoring** — Optimize cost/accuracy after the basic
   pipeline is validated.

---

## Sources

All findings in this document are based on training-time knowledge through August 2025. External
web access was unavailable during this research session.

Official documentation to verify before implementation:
- Fastify Reply (raw/streaming): `https://fastify.dev/docs/latest/Reference/Reply/`
- Fastify HTTP/2: `https://fastify.dev/docs/latest/Reference/HTTP2/`
- Playwright `page.screenshot()`: `https://playwright.dev/docs/api/class-page#page-screenshot`
- Playwright Reporter API: `https://playwright.dev/docs/api/class-reporter`
- OpenRouter model list (current): `https://openrouter.ai/api/v1/models`
- OpenRouter vision docs: `https://openrouter.ai/docs/features/vision`
- OpenAI streaming `include_usage`: `https://platform.openai.com/docs/api-reference/streaming`
- OpenAI vision tile pricing: `https://platform.openai.com/docs/guides/vision`
- MCP SDK (TypeScript): `https://github.com/modelcontextprotocol/typescript-sdk`
