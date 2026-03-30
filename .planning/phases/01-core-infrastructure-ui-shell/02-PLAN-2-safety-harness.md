# Plan 2: Safety Harness

**Phase:** 1 (Core Infrastructure & UI Shell)
**Focus:** Implement execution safety mechanisms (timeouts, loop detection, and token budgeting) to prevent runaway costs and infinite loops during MCP evaluation.
**Requirements Covered:** INFRA-03, INFRA-04, INFRA-05, INFRA-06

## 1. File Structure (Decision D-04)
- Place all safety harness code inside `src/shared/harness/` so it is easily accessible by both the Fastify server and the CLI runner (built in Phase 6).

## 2. Timeout Utility (`INFRA-03`)
- Create `src/shared/harness/withTimeout.ts`.
- Implement a `withTimeout<T>(promise: Promise<T>, durationMs: number, abortController?: AbortController)` wrapper.
- Use `Promise.race[]` with a generated timeout rejection.
- Standardize timeout tiers (constants to be exported):
  - Screenshot capture: 5s
  - LLM API call: 15s
  - Playwright action execution: 25s
  - Full Step execution: 30s
  - Full Scenario run: 5 minutes
- If the timeout triggers, the function must invoke `abortController.abort()` to actively cancel the underlying operation, not just reject the promise.

## 3. Loop Detection (`INFRA-04`)
- Create `src/shared/harness/LoopDetector.ts`.
- Implement a class tracking `tool_name` and `arguments` fingerprints over a sliding window for individual runs.
- **Exact Match Threshold:** If the same tool call with exact arguments repeats (e.g., 3 consecutive failed click attempts or 3 identical searches), trigger a loop abort.
- **Budget-Based Match:** Implement a per-tool call-count limit per scenario step (e.g., maximum 20 `browser_click` actions total per step) to catch semantic loops where arguments vary slightly but progress is zero.

## 4. Token Budgeting (`INFRA-05`, `INFRA-06`)
- Create `src/shared/harness/TokenBudget.ts`.
- Track consumed input/output tokens dynamically during a run.
- Accept a user-defined hard cap limit (in tokens or estimated USD).
- **Hard Stop:** Expose a `checkBudget()` method called before every new LLM dispatch. If the budget exceeds the cap, hard-stop the execution and throw a `BudgetExceededError`.
- **Pre-run check:** Expose a method `estimateCost()` (to be fed via OpenRouter APIs/models in Phase 2) that allows the framework to reject a start request if the scenario is too long for the allocated budget.

## 5. Test & Validate
- Write unit tests using Jest or Vitest for `withTimeout` to verify that long operations properly abort within 50ms of the target duration.
- Test `LoopDetector` by feeding it 3 identical mock tool calls and asserting it throws a Loop exception.
- Test `TokenBudget` by accumulating mock tokens and asserting the hard-stop function trips at the threshold.
