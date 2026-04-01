import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const historyApiSource = readFileSync(resolve(process.cwd(), "src/server/api/history.ts"), "utf8");

test("phase6 contract: history API exposes per-run JSON and CSV export endpoints", () => {
  assert.match(historyApiSource, /server\.get\("\/api\/history\/:id\/export\.json"/);
  assert.match(historyApiSource, /server\.get\("\/api\/history\/:id\/export\.csv"/);
  assert.match(historyApiSource, /buildRunCsv\(/);
  assert.match(historyApiSource, /Content-Disposition", `attachment; filename="run-\$\{sanitizeFileName\(run\.id\)\}\.json"`/);
});

test("phase6 contract: history API exposes batch CSV export route", () => {
  assert.match(historyApiSource, /server\.get\("\/api\/history\/export\.csv"/);
  assert.match(historyApiSource, /buildSummaryCsv\(/);
  assert.match(historyApiSource, /attachment; filename=\\"runs-summary\.csv\\"/);
});
