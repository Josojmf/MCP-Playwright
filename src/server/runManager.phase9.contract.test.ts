import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/server/runManager.ts"), "utf8");

test("phase9 contract (VALID-06): runManager usa dos modelos auditor y guard de igualdad doble", () => {
  assert.match(source, /lowCostAuditorModel\?:\s*string/);
  assert.match(source, /highAccuracyAuditorModel\?:\s*string/);

  assert.match(source, /if \(lowCostAuditorModel === orchestratorModel\)/);
  assert.match(source, /if \(highAccuracyAuditorModel === orchestratorModel\)/);

  assert.doesNotMatch(source, /auditorModel\?:\s*string/);
});

test("phase9 contract (VALID-04\/05\/07): runManager valida sólo pasos passed y pasa ambos tier models", () => {
  assert.match(source, /if \(normalizedStepStatus === "passed" && screenshotPath\)/);
  assert.match(source, /lowCostAuditorModel:\s*session\.config\.lowCostAuditorModel/);
  assert.match(source, /highAccuracyAuditorModel:\s*session\.config\.highAccuracyAuditorModel/);
});
