import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appSource = readFileSync(resolve(process.cwd(), "src/client/App.tsx"), "utf8");

test("phase1 contract: scenario editor has base URL input, feature textarea, and .feature upload", () => {
  assert.match(appSource, /placeholder="https:\/\/example\.com"/);
  assert.match(appSource, /<textarea[\s\S]*value=\{featureText\}/);
  assert.match(appSource, /type="file"\s+accept="\.feature,\.txt"/);
});

test("phase1 contract: MCP selector defaults to 4 targets and uses checkbox component", () => {
  assert.match(appSource, /const MCP_OPTION_ORDER = \[[\s\S]*"@playwright\/mcp"[\s\S]*"@modelcontextprotocol\/server-puppeteer"[\s\S]*"mcp-playwright"[\s\S]*"@browserbasehq\/mcp"[\s\S]*\] as const/);
  assert.match(appSource, /<Checkbox/);
});

test("phase1 contract: theme toggle and responsive desktop layout exist", () => {
  assert.match(appSource, /setTheme\(\(previous\) => \(previous === "dark" \? "light" : "dark"\)\)/);
  assert.match(appSource, /max-w-\[1400px\]/);
  assert.match(appSource, /w-\[240px\]/);
});

test("phase1 contract: pre-run estimate and confirmation modal workflow exists", () => {
  assert.match(appSource, /fetch\("\/api\/runs\/estimate"/);
  assert.match(appSource, /setIsEstimateModalOpen\(true\)/);
  assert.match(appSource, /Confirmar run/);
  assert.match(appSource, /withinBudget/);
});
