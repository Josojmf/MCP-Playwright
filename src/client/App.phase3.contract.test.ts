import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appSource = readFileSync(resolve(process.cwd(), "src/client/App.tsx"), "utf8");

test("phase3 contract: live execution timeline consumes SSE lifecycle events", () => {
  assert.match(appSource, /new EventSource\(streamPath\)/);
  assert.match(appSource, /addEventListener\("run_started"/);
  assert.match(appSource, /addEventListener\("step_started"/);
  assert.match(appSource, /addEventListener\("step_passed"/);
  assert.match(appSource, /addEventListener\("step_failed"/);
  assert.match(appSource, /addEventListener\("run_completed"/);
  assert.match(appSource, /addEventListener\("run_aborted"/);
  assert.match(appSource, /hallucinated/);
  assert.match(appSource, /needsReview/);
});

test("phase3 contract: history panel and run detail are wired to history API", () => {
  assert.match(appSource, /import \{ RunHistoryList \}/);
  assert.match(appSource, /import \{ RunDetailView \}/);
  assert.match(appSource, /fetch\("\/api\/history\?limit=50"\)/);
  assert.match(appSource, /fetch\(`\/api\/history\/\$\{encodeURIComponent\(runId\)\}`\)/);
  assert.match(appSource, /fetch\("\/api\/history\/cost\/total"\)/);
  assert.match(appSource, /<RunHistoryList/);
  assert.match(appSource, /<RunDetailView/);
});
