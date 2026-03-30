# Research: Available Playwright/Browser MCP Servers

**Project:** MCP Playwright Test Playground
**Researched:** 2026-03-30
**Confidence note:** External web tools (WebSearch, WebFetch, Brave, Firecrawl, Exa) are disabled in this environment. All findings are sourced from training knowledge (cutoff August 2025). Claims are confidence-tagged. Validate HIGH-confidence claims against live npm/GitHub before building the registry.

---

## Quick Comparison Table

| Server | Package | Headless CI | Underlying Engine | Auth Required | Tool Count (approx) | Confidence |
|--------|---------|-------------|-------------------|---------------|---------------------|------------|
| @playwright/mcp | `@playwright/mcp` (Microsoft) | Yes (`--headless`) | Playwright (Chromium/Firefox/WebKit) | No | ~20 tools | HIGH |
| Browserbase MCP | `@browserbasehq/mcp` | Cloud-only (inherently headless) | Chromium via Browserbase cloud | Yes (API key) | ~10 tools | MEDIUM |
| Steel Browser MCP | `steel-browser` / `@steel-dev/mcp` | Cloud-only | Chromium via Steel cloud | Yes (API key) | ~8 tools | MEDIUM |
| Puppeteer MCP | `@modelcontextprotocol/server-puppeteer` | Yes | Puppeteer (Chromium) | No | ~6 tools | HIGH |
| Playwright (community) | `mcp-playwright` (Executeautomation) | Yes | Playwright | No | ~12 tools | MEDIUM |
| AgentQL MCP | `agentql-mcp` | Yes | Playwright + AgentQL | Yes (API key) | ~5 tools | MEDIUM |

---

## 1. @playwright/mcp (Microsoft Official)

**Package:** `@playwright/mcp`
**GitHub:** `https://github.com/microsoft/playwright-mcp`
**Maintained by:** Microsoft (Playwright team)
**Confidence:** HIGH — this is the canonical first-party implementation

### Installation

```bash
npx @playwright/mcp@latest
# or install globally
npm install -g @playwright/mcp
```

Claude Desktop config example:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

### How It Works

The server launches a persistent Playwright browser instance and exposes it as MCP tools. The LLM calls individual tools (navigate, click, type, screenshot, etc.) step by step. Each tool call is synchronous from the LLM's perspective — the LLM sends a tool call, Playwright executes it, returns the result (DOM snapshot or screenshot), and the LLM decides the next action.

There are two distinct operational modes:

**Snapshot mode (default):** Returns ARIA accessibility tree snapshots as structured text. No screenshots. Fast, token-efficient, preferred for most automation. The LLM navigates by element reference IDs from the snapshot.

**Screenshot mode (`--vision`):** Returns base64-encoded PNG screenshots. More token-heavy. Required for visual validation and for sites with heavy canvas/WebGL where ARIA tree is sparse.

### Tool Catalog (HIGH confidence)

The tools exposed follow this naming pattern (`browser_*`):

| Tool Name | Purpose |
|-----------|---------|
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Browser back button |
| `browser_navigate_forward` | Browser forward button |
| `browser_snapshot` | Capture ARIA accessibility snapshot of current page |
| `browser_screenshot` | Capture PNG screenshot (vision mode) |
| `browser_click` | Click element by ref (from snapshot) |
| `browser_type` | Type text into focused element |
| `browser_fill` | Fill form field by ref |
| `browser_select_option` | Select dropdown option |
| `browser_check` | Check/uncheck checkbox |
| `browser_hover` | Hover over element |
| `browser_focus` | Focus an element |
| `browser_press_key` | Press keyboard key (Enter, Tab, Escape, etc.) |
| `browser_wait_for` | Wait for element/condition |
| `browser_scroll` | Scroll page or element |
| `browser_drag` | Drag-and-drop between elements |
| `browser_get_text` | Extract text content from element |
| `browser_evaluate` | Execute JavaScript in page context |
| `browser_close` | Close browser / page |
| `browser_handle_dialog` | Accept or dismiss alert/confirm/prompt dialogs |
| `browser_upload_file` | Upload a file to a file input |
| `browser_pdf_save` | Save page as PDF |
| `browser_console_messages` | Retrieve browser console logs |
| `browser_network_requests` | Retrieve intercepted network requests |

### Configuration Flags

```bash
npx @playwright/mcp@latest \
  --headless \           # Headless mode (no visible window)
  --browser chromium \   # chromium | firefox | webkit
  --viewport 1280x720 \  # Viewport size
  --vision \             # Screenshot mode instead of snapshot mode
  --port 3000            # Run as HTTP server instead of stdio
```

### Transport Modes

- **stdio** (default): The MCP client spawns the process, communicates via stdin/stdout. One browser instance per client connection. Standard for local use.
- **HTTP/SSE server** (`--port`): Runs as a persistent server. Multiple clients can connect. Required for parallel multi-client scenarios like this benchmark platform.

### Headless CI Support

Yes. `--headless` flag enables fully headless Chromium. Works in Docker without Xvfb. Requires Playwright browser binaries installed (`npx playwright install chromium`).

### Known Behavior and Limitations

- **Snapshot mode element refs are ephemeral.** Each `browser_snapshot` call returns a new set of element refs. If the LLM calls `browser_click` with a ref from a stale snapshot, the call fails. LLMs must always re-snapshot after page state changes.
- **Single browser context per server instance.** For parallel execution in the benchmark platform, you need one server instance per parallel MCP run (or use the HTTP server mode with session isolation — verify this capability).
- **No built-in retry.** If a tool call fails (element not found, timeout), the MCP returns an error and the LLM must decide to retry. The orchestrator must implement retry logic externally.
- **Dialog handling is non-automatic.** Unexpected alert() dialogs will block execution unless `browser_handle_dialog` is called proactively.
- **File downloads** are not natively captured in a retrievable way in CI.
- **iframes**: Tools operate on the top-level frame by default. Cross-frame interaction requires explicit frame selection (check current API — this may have changed).

---

## 2. @browserbasehq/mcp (Browserbase)

**Package:** `@browserbasehq/mcp`
**GitHub:** `https://github.com/browserbase/mcp-server-browserbase`
**Maintained by:** Browserbase Inc.
**Confidence:** MEDIUM — package existed and was active as of training cutoff; details may have evolved

### What It Is

Browserbase is a cloud browser infrastructure service. Their MCP server proxies browser automation through their managed cloud environment instead of running a local browser. Every action goes through Browserbase's API.

### Installation

```bash
npm install -g @browserbasehq/mcp
```

Config:
```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": ["@browserbasehq/mcp"],
      "env": {
        "BROWSERBASE_API_KEY": "your-key",
        "BROWSERBASE_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

### Tool Catalog (MEDIUM confidence)

| Tool Name | Purpose |
|-----------|---------|
| `browserbase_create_session` | Start a new cloud browser session |
| `browserbase_navigate` | Navigate to URL |
| `browserbase_screenshot` | Capture screenshot |
| `browserbase_click` | Click element |
| `browserbase_type` | Type text |
| `browserbase_close_session` | Terminate session |
| `browserbase_get_page_content` | Get page HTML/text |
| `browserbase_evaluate` | Run JavaScript |

### Headless CI Support

Yes, inherently headless — the browser runs in Browserbase's cloud, not locally. No browser binaries needed on the CI machine. Requires outbound HTTPS to Browserbase API.

### Limitations and Gotchas

- **Requires paid API key.** Not free for production volume. Cost compounds with benchmark runs.
- **Network latency per tool call.** Each tool call is a round-trip to Browserbase cloud. In a benchmark context, this adds ~100-400ms per step vs. local Playwright.
- **No self-hosted option.** You cannot run Browserbase infrastructure locally.
- **Session-based model.** Sessions must be explicitly created and destroyed. Session leaks are possible if the LLM fails to call `browserbase_close_session`.
- **Different tool naming convention** from @playwright/mcp. The orchestrator adapter must normalize between them.

---

## 3. Steel Browser MCP

**Package:** `@steel-dev/steel-mcp-server` or similar (exact package name — VERIFY on npm)
**GitHub:** `https://github.com/steel-dev/steel-browser` (community/official)
**Maintained by:** Steel Dev
**Confidence:** MEDIUM — Steel was an active project as of August 2025; package name needs verification

### What It Is

Steel is another cloud browser-as-a-service provider, positioned as an open-source alternative to Browserbase. They offer both cloud-hosted and self-hosted options. Their MCP server connects to Steel's browser API.

### Tool Catalog (LOW confidence — extrapolated from Steel's general API)

| Tool Name | Purpose |
|-----------|---------|
| `steel_navigate` | Navigate to URL |
| `steel_screenshot` | Capture screenshot |
| `steel_click` | Click element |
| `steel_type` | Type text |
| `steel_get_content` | Get page content |
| `steel_run_js` | Execute JavaScript |
| `steel_pdf` | Save page as PDF |

### Headless CI Support

Yes, cloud-based (inherently headless). Self-hosted option makes local headless feasible.

### Distinguishing Features

- **Self-hosted option** distinguishes Steel from Browserbase. The benchmark platform could run Steel locally in Docker for cost-free parallel runs.
- **Session recording**: Steel logs session replays, which complements the benchmark platform's step-by-step screenshot approach.
- **Proxy support**: Built-in residential proxy rotation, relevant if testing behind geo-restricted content.

### Limitations

- **Less mature MCP integration** than @playwright/mcp as of training cutoff.
- **API stability uncertain** — Steel was in active development.
- Exact tool names need verification against current Steel MCP documentation.

---

## 4. @modelcontextprotocol/server-puppeteer

**Package:** `@modelcontextprotocol/server-puppeteer`
**GitHub:** `https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer`
**Maintained by:** Anthropic / MCP reference implementations
**Confidence:** HIGH — this is part of the official MCP reference servers repository

### What It Is

The official reference MCP server for browser automation using Puppeteer. Maintained by Anthropic as part of the MCP SDK examples. Less featured than @playwright/mcp but well-documented and stable.

### Installation

```bash
npx @modelcontextprotocol/server-puppeteer
```

### Tool Catalog (HIGH confidence)

| Tool Name | Purpose |
|-----------|---------|
| `puppeteer_navigate` | Navigate to URL |
| `puppeteer_screenshot` | Capture screenshot (always screenshot mode, no snapshot mode) |
| `puppeteer_click` | Click element by CSS selector |
| `puppeteer_fill` | Fill form input by CSS selector |
| `puppeteer_select` | Select dropdown option |
| `puppeteer_hover` | Hover element |
| `puppeteer_evaluate` | Execute JavaScript |

### Key Difference from @playwright/mcp

**CSS selectors instead of ARIA refs.** Puppeteer tools take CSS selectors (e.g., `#submit-button`, `.login-form input[type="email"]`). This means the LLM must generate valid CSS selectors rather than referencing element IDs from a snapshot. This is more fragile — the LLM must guess or infer selectors from page structure, which is a significant source of hallucination.

**No snapshot mode.** Every page read is a screenshot or raw HTML. Token cost is higher.

**Chromium only.** No Firefox or WebKit support (Puppeteer limitation).

### Headless CI Support

Yes. Puppeteer defaults to headless. No additional flag required.

### Limitations

- **Selector-based approach is LLM-hostile.** Generating correct CSS selectors is harder than clicking by ARIA ref. Expect higher failure rates on dynamic/complex UIs.
- **No multi-browser support.**
- **Less active development** than @playwright/mcp — the reference servers repo is demonstration-quality, not production-grade.
- **No built-in dialog handling, file upload, or network interception.**

---

## 5. mcp-playwright (ExecuteAutomation / Community)

**Package:** `mcp-playwright` (npm) or `@executeautomation/playwright-mcp-server`
**GitHub:** `https://github.com/executeautomation/mcp-playwright`
**Maintained by:** ExecuteAutomation (community, not Microsoft)
**Confidence:** MEDIUM — this package existed and was popular on npm as of training cutoff

### What It Is

A community-built Playwright MCP server that predates @playwright/mcp or was developed in parallel. Reasonably popular (thousands of weekly downloads as of mid-2025). Feature set overlaps with @playwright/mcp but with different design choices.

### Tool Catalog (MEDIUM confidence)

| Tool Name | Purpose |
|-----------|---------|
| `playwright_navigate` | Navigate to URL |
| `playwright_screenshot` | Capture screenshot |
| `playwright_click` | Click by selector |
| `playwright_fill` | Fill form field |
| `playwright_select` | Select option |
| `playwright_hover` | Hover element |
| `playwright_evaluate` | Execute JavaScript |
| `playwright_get_visible_text` | Extract visible text |
| `playwright_get_visible_html` | Extract page HTML |
| `playwright_press_key` | Press key |
| `playwright_close` | Close browser |
| `playwright_console_logs` | Get console logs |

### Key Differences from @playwright/mcp

- Uses **CSS/XPath selectors** rather than ARIA snapshot refs (similar fragility concern as Puppeteer MCP).
- **No snapshot mode** — relies on screenshots or HTML extraction.
- Tool naming prefix is `playwright_` rather than `browser_`.
- Less maintained than the official Microsoft package.

### Headless CI Support

Yes, supports headless mode via configuration.

### Limitations

- **Not maintained by Playwright team** — may lag on Playwright API changes.
- **Selector-based** — same LLM-hostile issue as Puppeteer MCP.
- With @playwright/mcp now official, this package is likely to decline in adoption.

---

## 6. AgentQL MCP

**Package:** `agentql-mcp` or `@tinyfish-io/agentql-mcp`
**GitHub:** `https://github.com/tinyfish-io/agentql-mcp`
**Maintained by:** TinyFish (AgentQL team)
**Confidence:** MEDIUM — AgentQL was an active project as of training cutoff; MCP integration details need verification

### What It Is

AgentQL is a query language for AI-driven browser automation. Instead of CSS selectors or ARIA refs, the LLM uses natural-language-ish queries like `{ submit_button, email_field }`. The AgentQL engine resolves these queries to DOM elements using its own ML model.

### Installation

```bash
npm install agentql-mcp
```

Requires `AGENTQL_API_KEY`.

### Tool Catalog (LOW confidence)

| Tool Name | Purpose |
|-----------|---------|
| `agentql_navigate` | Navigate to URL |
| `agentql_query` | Find elements using AgentQL query language |
| `agentql_click` | Click element found by query |
| `agentql_fill` | Fill field found by query |
| `agentql_get_page_info` | Extract structured page data |
| `agentql_screenshot` | Capture screenshot |

### Key Differentiator

**Natural-language element resolution.** The query `{ login_button }` is more resilient to UI changes than `#login-btn` or an ARIA ref. This could produce more consistent results across page redesigns.

### Headless CI Support

Yes, Playwright-based under the hood, supports headless.

### Limitations

- **Double API key requirement**: OpenRouter/LLM key + AgentQL API key. Cost compounds.
- **Additional latency**: AgentQL's ML-based element resolution adds overhead per query.
- **Less transparent failure modes**: When AgentQL misidentifies an element, the error is harder to diagnose than a clear "element not found."
- **Smallest tool surface area** of all servers reviewed — may not cover all required interactions.

---

## 7. Honorable Mentions (LOW confidence, may need verification)

### @anthropic/computer-use (Anthropic Computer Use)

Anthropic's Computer Use API (Claude 3.5 Sonnet) exposes screenshot-and-click interaction at the OS level, not via MCP tools in the traditional sense. It operates differently — Claude sees screenshots and outputs coordinates/actions directly. Not a standard MCP server. **Not directly comparable** to the others for this benchmark platform, but worth noting as a distinct approach.

### Stagehand (Browserbase)

Stagehand is a higher-level framework by Browserbase that wraps Playwright with LLM-powered element resolution. It has MCP integration. Positioned as "Playwright + AI" rather than a raw MCP server. The abstraction layer may obscure the raw MCP tool performance the benchmark is trying to measure. **Potentially useful as a benchmark target but adds a confounding layer.**

### Hyperbrowser MCP

Another cloud browser service with an MCP server. Less established than Browserbase/Steel as of training cutoff. Tool schema unknown — needs research.

### Playwright-plus-python MCP

Python-based Playwright MCP implementations exist (e.g., `playwright-mcp-server` on PyPI). Less relevant for a Node.js-first platform but exist in the ecosystem.

---

## Architectural Implications for the Benchmark Platform

### Tool Name Normalization

Each MCP server uses different tool naming prefixes:
- `browser_*` — @playwright/mcp (Microsoft)
- `puppeteer_*` — @modelcontextprotocol/server-puppeteer
- `playwright_*` — mcp-playwright (ExecuteAutomation)
- `browserbase_*` — Browserbase MCP
- `agentql_*` — AgentQL MCP

The pluggable MCP registry must **not assume uniform tool names.** Each adapter in the registry needs to declare its tool namespace. The LLM orchestrator prompt must be dynamically constructed per MCP to reference the correct tool names for that server.

### Snapshot vs. Screenshot Mode

Two fundamentally different interaction paradigms exist in the wild:

| Paradigm | Servers | Token Cost | LLM Reliability |
|----------|---------|------------|-----------------|
| ARIA snapshot + refs | @playwright/mcp | Low (text only) | High (unambiguous element refs) |
| Screenshot + coordinates | @anthropic/computer-use | Very high (images) | Medium (visual reasoning) |
| CSS/XPath selector generation | Puppeteer MCP, mcp-playwright | Medium | Low (hallucinated selectors) |
| Natural-language query | AgentQL | Medium + API cost | Medium-High |
| Cloud proxy | Browserbase, Steel | Medium | Depends on underlying engine |

The benchmark platform's per-step screenshot capture for validation is independent of which mode the MCP uses — validation screenshots are taken by the platform's own Playwright instance (ground-truth layer), not by the MCP under test.

### Parallelism Model

For parallel execution across MCPs, the recommended approach per MCP type:

- **@playwright/mcp**: Spawn one process per parallel run with `--port` flag for HTTP/SSE mode, or one stdio process per run. Browser isolation is guaranteed per process.
- **Browserbase/Steel**: Cloud-based; inherently parallel via separate session IDs. No local process management needed.
- **Puppeteer MCP / mcp-playwright**: Spawn one process per run. These are single-browser-context servers.
- **AgentQL**: One process per run; underlying Playwright instance is per-process.

### Session Lifecycle Management

The benchmark platform must manage session lifecycle per MCP:

```
[Platform] → spawn/connect MCP server → create browser session
            → run scenario step by step
            → capture screenshots at each step (platform's own Playwright)
            → close/disconnect MCP server → cleanup
```

Cloud-based MCPs (Browserbase, Steel) require explicit session termination to avoid leaked paid sessions. Implement a finally-block cleanup guarantee in the orchestrator.

---

## Gotchas and Known Issues

### Gotcha 1: ARIA Ref Staleness (@playwright/mcp)

**What happens:** The LLM calls `browser_snapshot`, gets a list of element refs (e.g., `ref: e45`), then calls `browser_click { ref: "e45" }`. If any DOM mutation occurred between the two calls (animation, lazy load, SPA route change), the ref is stale and the call fails with an opaque error.

**Consequence for the benchmark:** False failures that look like MCP failures but are timing issues. The orchestrator must detect this error class and retry with a fresh snapshot.

**Mitigation:** Always re-snapshot before acting. Configure a minimum delay between snapshot and action in the orchestrator.

### Gotcha 2: LLM Hallucinated Success

**What happens:** The MCP server returns an error (e.g., element not found). The LLM, in its next reasoning step, decides to proceed as if the action succeeded — either because its instruction was to "complete the task" or because it misread the error. It reports the Gherkin step as passed.

**Consequence for the benchmark:** This is the #1 validity threat. It is the core "hallucination" the dual-layer validation is designed to catch.

**Mitigation:** Treat any MCP tool call that returns an error as a step failure at the orchestrator level, regardless of LLM self-assessment. The LLM does not have veto power over tool error results.

### Gotcha 3: CSS Selector Hallucination (Puppeteer MCP, mcp-playwright)

**What happens:** The LLM generates a CSS selector like `button.submit-login` that does not exist on the page. The tool returns "element not found." The LLM tries a different selector, then another, burning tokens in a loop.

**Consequence for the benchmark:** Loop detection (N identical actions) must also cover "N failed selector attempts on the same step" as a distinct loop pattern.

**Mitigation:** The loop detector should track failed tool call patterns per step, not just repeated identical calls.

### Gotcha 4: Dialog Blocking (@playwright/mcp)

**What happens:** An unexpected `window.alert()` or `window.confirm()` fires. Browser execution halts waiting for the dialog. No MCP tool calls succeed until the dialog is handled.

**Consequence for the benchmark:** Looks like a timeout / hung step, not a dialog issue. Very hard to diagnose from logs alone.

**Mitigation:** The orchestrator should send `browser_handle_dialog` (accept) as a recovery action if a step times out and the last screenshot shows a dialog overlay.

### Gotcha 5: Cloud MCP Latency Inflation

**What happens:** Browserbase and Steel add 100-500ms of network round-trip latency per tool call. A 20-step scenario with 20 tool calls adds 2-10 seconds of latency overhead that is pure network, not automation quality.

**Consequence for the benchmark:** Naively comparing wall-clock time between local @playwright/mcp and cloud Browserbase is misleading. The benchmark scorecard should report **MCP execution time** separately from **network overhead time** where detectable.

**Mitigation:** Record timestamps at the orchestrator layer for: tool call sent, tool result received. The delta is latency. Expose this in the scorecard as a separate column.

### Gotcha 6: Vision Mode Token Explosion

**What happens:** @playwright/mcp in `--vision` mode (screenshot mode) returns base64-encoded PNG images. A 1280x720 screenshot encodes to ~100-300KB of base64 text. If the LLM is running on a 128K context model, a scenario with 20 steps can exhaust the context window from screenshots alone.

**Consequence for the benchmark:** Vision mode runs need a lower step count limit or aggressive screenshot compression before passing images to the LLM.

**Mitigation:** In vision mode, resize/compress screenshots before injecting into LLM context. Expose a `vision_mode_screenshot_quality` config option in the benchmark platform.

### Gotcha 7: Single-Context Browser State

**What happens:** @playwright/mcp (stdio mode) uses a single browser context for the entire session. Cookies, localStorage, and session state persist across scenarios in the same server process.

**Consequence for the benchmark:** If two parallel runs share a server process (they should not, but misconfiguration can cause this), state bleeds between runs producing false results.

**Mitigation:** Strict one-process-per-run isolation. The registry must enforce this. Health-check that each MCP process PID is unique before starting a parallel run.

### Gotcha 8: Playwright Binary Version Mismatch

**What happens:** `@playwright/mcp` requires Playwright browser binaries installed for the matching version. If the system has Playwright 1.44 binaries but @playwright/mcp expects 1.46, `browser_navigate` fails with a cryptic binary version error.

**Consequence for the benchmark:** A setup issue that looks like an MCP failure. Must be caught in a pre-flight health check, not during a benchmarked run.

**Mitigation:** Pre-flight check: verify `npx playwright --version` matches the version expected by @playwright/mcp's `package.json`. Run `npx playwright install` as part of the setup step.

### Gotcha 9: MCP Protocol Version Compatibility

**What happens:** The MCP protocol itself has versions. A client built against MCP SDK 1.x may have capability negotiation issues with a server built against 0.x. This is unlikely with actively maintained packages but possible with community servers.

**Consequence for the benchmark:** Silent capability mismatches — tools are listed but not callable, or parameters are rejected.

**Mitigation:** Log the capability negotiation handshake during server startup. Surface `serverInfo.version` in the MCP registry metadata.

### Gotcha 10: Iframe and Shadow DOM Blindness

**What happens:** Many modern web apps use iframes (payment widgets, embedded content) and Shadow DOM (web components). @playwright/mcp's ARIA snapshot may not traverse into shadow roots by default. Tool calls targeting elements inside shadow DOM will fail.

**Consequence for the benchmark:** Scenarios involving Stripe checkout, embedded widgets, or web-component-heavy UIs will produce high failure rates that are MCP limitations, not scenario errors.

**Mitigation:** Flag Gherkin scenarios that involve known iframe/shadow DOM interactions in the scenario metadata. Include this as a test-case category in the benchmark to specifically measure this capability gap.

---

## Recommended Priority Order for the MCP Registry

Based on this research, the suggested order for initial registry implementation:

1. **@playwright/mcp** — First-party, most capable, ARIA snapshot mode is the best paradigm for reliable LLM-driven automation. The benchmark's reference implementation.
2. **@modelcontextprotocol/server-puppeteer** — Official reference server, easy to integrate, useful as a "baseline" comparison against @playwright/mcp's more sophisticated approach.
3. **mcp-playwright (ExecuteAutomation)** — Popular community package, represents the "naive selector approach" that many users will have tried. Valuable benchmark target.
4. **@browserbasehq/mcp** — Cloud provider with real-world usage. Tests the cloud-vs-local performance gap. Requires API key — document this as optional/paid in the registry.
5. **Steel Browser MCP** — Lower confidence on exact tooling. Add after verifying current package name and API.
6. **AgentQL MCP** — Distinct paradigm (natural language queries) worth benchmarking. Add after verifying current package name.

---

## Open Questions (Needs Live Verification)

- [ ] Does @playwright/mcp HTTP/SSE server mode support isolated browser contexts per session, or does it share state across connections? This is critical for parallel execution design.
- [ ] Exact current npm package name for Steel's MCP server (may have changed since training cutoff).
- [ ] Does @playwright/mcp expose `browser_network_requests` and `browser_console_messages` as standard tools, or are these behind a flag?
- [ ] What version of the MCP protocol does each server implement? (Check `serverInfo` in capability response.)
- [ ] Does Browserbase MCP support stdio transport or only HTTP? (Affects how the platform spawns it.)
- [ ] Has AgentQL's MCP integration been updated to MCP SDK 1.x?
- [ ] Are there any MCP servers built on Firefox DevTools Protocol (not Chromium-based)?

---

## Sources

- Training knowledge (August 2025 cutoff) — all claims confidence-tagged above
- Microsoft Playwright GitHub: `https://github.com/microsoft/playwright-mcp`
- MCP Reference Servers: `https://github.com/modelcontextprotocol/servers`
- Browserbase MCP: `https://github.com/browserbase/mcp-server-browserbase`
- Steel Browser: `https://github.com/steel-dev/steel-browser`
- AgentQL MCP: `https://github.com/tinyfish-io/agentql-mcp`
- ExecuteAutomation mcp-playwright: `https://github.com/executeautomation/mcp-playwright`

**IMPORTANT:** Verify all package names and tool schemas against live npm and GitHub before hardcoding them in the MCP registry. The "Open Questions" section above lists the highest-priority items to confirm.
