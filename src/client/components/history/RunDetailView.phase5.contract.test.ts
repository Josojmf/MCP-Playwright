import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const runDetailViewSource = readFileSync(
  resolve(process.cwd(), "src/client/components/history/RunDetailView.tsx"),
  "utf8"
);

const appSource = readFileSync(resolve(process.cwd(), "src/client/App.tsx"), "utf8");

test("phase5 contract: scorecard detail renders hallucination and needs-review metrics/flags", () => {
  assert.match(runDetailViewSource, /Hallucinations/);
  assert.match(runDetailViewSource, /Needs Review/);
  assert.match(runDetailViewSource, /NEEDS_REVIEW/);
  assert.match(runDetailViewSource, /HALLUCINATED/);
  assert.match(runDetailViewSource, /step\.validation\.verdict/);
  assert.match(runDetailViewSource, /step\.validation\.confidence/);
});

test("phase5 contract: UI provides screenshot access and cumulative cost dashboard", () => {
  assert.match(runDetailViewSource, /\/api\/screenshots\/\$\{encodeURIComponent/);
  assert.match(runDetailViewSource, /Ver screenshot/);
  assert.match(appSource, /fetch\("\/api\/history\/cost\/total"\)/);
  assert.match(appSource, /Costo acumulado/);
});
