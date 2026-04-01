import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const historyApiSource = readFileSync(resolve(process.cwd(), "src/server/api/history.ts"), "utf8");

test("phase5 contract: history API exposes cumulative cost dashboard endpoint", () => {
  assert.match(historyApiSource, /server\.get\("\/api\/history\/cost\/total"/);
  assert.match(historyApiSource, /totalUsd/);
  assert.match(historyApiSource, /runCount/);
  assert.match(historyApiSource, /Error al calcular costo acumulado/);
});

test("phase5 contract: screenshot delivery endpoint serves image payload by id", () => {
  assert.match(historyApiSource, /server\.get\("\/api\/screenshots\/:id"/);
  assert.match(historyApiSource, /getScreenshot\(/);
  assert.match(historyApiSource, /Content-Type", "image\/png"/);
  assert.match(historyApiSource, /Screenshot no encontrado/);
});
