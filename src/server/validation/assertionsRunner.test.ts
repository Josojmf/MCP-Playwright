import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cleanupPlaywrightContext,
  runAssertion,
  setupPlaywrightContext,
} from "./assertionsRunner";
import { TranslatedAssertion } from "../parser/translator";

test.before(async () => {
  await setupPlaywrightContext();
});

test.after(async () => {
  await cleanupPlaywrightContext();
});

test("runs allowlisted URL assertions through the explicit runner table", async () => {
  const assertion: TranslatedAssertion = {
    patternId: "url-match",
    original: 'I should see the URL "https://example.com"',
    playwrightCall: 'expect(page).toHaveURL("https://example.com")',
  };

  const result = await runAssertion(assertion, {
    page: {
      url: () => "https://example.com",
    },
  });

  assert.deepEqual(result, { status: "passed" });
});

test("translates allowlisted failures into Spanish when Playwright semantics fail", async () => {
  const assertion: TranslatedAssertion = {
    patternId: "text-visible",
    original: '"Hola" should be visible',
    playwrightCall: 'expect(page.getByText("Hola")).toBeVisible()',
  };

  const result = await runAssertion(assertion, {
    page: {
      getByText: () => ({
        visible: false,
      }),
    },
  });

  assert.equal(result.status, "failed");
  assert.match(result.message ?? "", /El elemento no coincide con los criterios especificados/);
});

test("fails explicitly when the translator cannot produce a supported pattern id", async () => {
  const assertion: TranslatedAssertion = {
    patternId: null,
    original: "Alguna assertion desconocida",
    playwrightCall: null,
  };

  const result = await runAssertion(assertion, {});

  assert.equal(result.status, "failed");
  assert.equal(result.message, "Unsupported translated assertion pattern: untranslatable");
});

test("rejects synthetic unsupported pattern ids without executing user-provided strings", async () => {
  const assertion: TranslatedAssertion = {
    patternId: "custom-eval",
    original: "custom assertion",
    playwrightCall: 'throw new Error("should not execute")',
  };

  const result = await runAssertion(assertion, {
    expect: () => {
      throw new Error("expect should never be called");
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.message, "Unsupported translated assertion pattern: custom-eval");
});

test("assertionsRunner source does not reintroduce dynamic execution", () => {
  const source = readFileSync(new URL("./assertionsRunner.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new Function\s*\(/);
});
