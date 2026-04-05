import test from "node:test";
import { assertNormalizedFragments, loadSourceContract } from "../test/support/sourceContracts";

const cliSource = loadSourceContract(new URL("./mcp-bench.ts", import.meta.url));

test("phase10 contract (CLI-03): runDebug renderiza tool call trace con prefijo, args/result/error truncados y latencia opcional", () => {
  // D-02: CLI formatting is one of the few places where normalized string checks are the right tool.
  assertNormalizedFragments(cliSource, [
    "for (const toolCall of step.toolCalls)",
    "truncateText(stringifyCompact(args), 200)",
    "truncateText(String(result), 150)",
    "truncateText(String(error), 150)",
    'const latencyText = typeof latencyMs === "number" ? ` lat=${latencyMs}ms` : ""',
    "deps.log(`    → ${toolName}  args: ${argsText}  ${resultLabel}: ${resultValue}${latencyText}`)",
  ], "runDebug trace output");
});

test("phase10 contract (CLI-03): header incluye fallback textual y color para hallucinated/needs-review", () => {
  assertNormalizedFragments(cliSource, [
    'const validationFlag = isHallucinated ? " [HALLUCINATED]" : isNeedsReview ? " [NEEDS-REVIEW]" : ""',
    "const coloredHeader = isHallucinated ? chalk.red(stepHeader) : isNeedsReview ? chalk.yellow(stepHeader) : stepHeader",
  ], "runDebug review flags");
});
