import assert from "node:assert";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { createRuntimeSmokeHarness } from "../../test/support/runtimeSmokeHarness";

let harness: Awaited<ReturnType<typeof createRuntimeSmokeHarness>>;
let saveScreenshot: typeof import("./screenshots").saveScreenshot;
let getScreenshot: typeof import("./screenshots").getScreenshot;
let listScreenshotsByStep: typeof import("./screenshots").listScreenshotsByStep;
let resolveScreenshotImagePath: typeof import("./screenshots").resolveScreenshotImagePath;

const runId = "test-run-123";
const stepId = "test-step-456";

async function registerScreenshotArtifacts(currentRunId: string, currentStepId: string, screenshotId?: string) {
  const referenceImagePath = resolveScreenshotImagePath(
    currentRunId,
    currentStepId,
    screenshotId ?? "placeholder",
    harness.dataDir,
  );
  const stepDir = path.dirname(referenceImagePath);
  await harness.registerArtifactDir(stepDir, "screenshots-step-dir", {
    runId: currentRunId,
    stepId: currentStepId,
  });

  if (screenshotId) {
    await harness.registerArtifactPath(
      resolveScreenshotImagePath(currentRunId, currentStepId, screenshotId, harness.dataDir),
      "screenshots-image",
      { runId: currentRunId, stepId: currentStepId, screenshotId },
    );
  }
}

before(async () => {
  harness = await createRuntimeSmokeHarness("screenshots-storage-smoke");
  await harness.activate();
  ({
    saveScreenshot,
    getScreenshot,
    listScreenshotsByStep,
    resolveScreenshotImagePath,
  } = await import("./screenshots.ts"));
});

after(async () => {
  await harness.cleanup();
});

beforeEach(async () => {
  await harness.resetState();
});

describe("Screenshots Storage smoke", { concurrency: 1 }, () => {
  it("stores a screenshot and returns an id", async () => {
    const buffer = Buffer.from("mock-screenshot-data");
    const screenshotId = await saveScreenshot(buffer, runId, "step-001", harness.dataDir);

    await registerScreenshotArtifacts(runId, "step-001", screenshotId);
    assert.ok(screenshotId, "debe retornar screenshotId");
    assert.strictEqual(typeof screenshotId, "string");
  });

  it("retrieves a screenshot by id", async () => {
    const originalBuffer = Buffer.from("test-image-content-123");
    const screenshotId = await saveScreenshot(originalBuffer, runId, "step-002", harness.dataDir);
    const retrievedBuffer = await getScreenshot(screenshotId, harness.dataDir);

    await registerScreenshotArtifacts(runId, "step-002", screenshotId);
    assert.ok(retrievedBuffer);
    assert.deepStrictEqual(retrievedBuffer, originalBuffer, "contenido debe coincidido exactamente");
  });

  it("lists screenshots by step", async () => {
    const buffer1 = Buffer.from("screenshot-1");
    const buffer2 = Buffer.from("screenshot-2");

    const id1 = await saveScreenshot(buffer1, runId, "step-003", harness.dataDir);
    const id2 = await saveScreenshot(buffer2, runId, "step-003", harness.dataDir);
    const list = await listScreenshotsByStep(runId, "step-003", harness.dataDir);

    await registerScreenshotArtifacts(runId, "step-003", id1);
    await registerScreenshotArtifacts(runId, "step-003", id2);
    await harness.writeJsonArtifact("screenshots/list-by-step.json", list, "screenshots-list-output");

    assert.ok(Array.isArray(list), "debe retornar un array");
    assert.strictEqual(list.length, 2, "debe tener 2 screenshots");

    const ids = list.map((item) => item.screenshotId);
    assert.ok(ids.includes(id1), "debe incluir primer screenshot");
    assert.ok(ids.includes(id2), "debe incluir segundo screenshot");
  });

  it("includes metadata in every screenshot entry", async () => {
    const buffer = Buffer.from("metadata-test");
    const screenshotId = await saveScreenshot(buffer, runId, stepId, harness.dataDir);
    const list = await listScreenshotsByStep(runId, stepId, harness.dataDir);

    await registerScreenshotArtifacts(runId, stepId, screenshotId);
    await harness.writeJsonArtifact("screenshots/metadata.json", list, "screenshots-metadata-output");

    const entry = list.find((item) => item.screenshotId === screenshotId);
    assert.ok(entry, "debe encontrar entrada");
    assert.ok(entry.timestamp, "debe tener timestamp");
    assert.strictEqual(typeof entry.timestamp, "string");
  });

  it("returns an empty array for steps without screenshots", async () => {
    const list = await listScreenshotsByStep(runId, "nonexistent-step", harness.dataDir);

    await harness.writeJsonArtifact(
      "screenshots/nonexistent-step.json",
      list,
      "screenshots-empty-step-output",
    );

    assert.ok(Array.isArray(list), "debe retornar array");
    assert.strictEqual(list.length, 0, "debe estar vacío para step inexistente");
  });

  it("handles multiple screenshots for one step without collisions", async () => {
    const buffers = [Buffer.from("image-1"), Buffer.from("image-2"), Buffer.from("image-3")];
    const ids = await Promise.all(
      buffers.map((buffer) => saveScreenshot(buffer, runId, "multi-step", harness.dataDir)),
    );

    await Promise.all(ids.map((screenshotId) => registerScreenshotArtifacts(runId, "multi-step", screenshotId)));

    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, "todos los IDs deben ser únicos");

    for (let index = 0; index < ids.length; index += 1) {
      const retrieved = await getScreenshot(ids[index], harness.dataDir);
      assert.deepStrictEqual(retrieved, buffers[index], `contenido de screenshot ${index} debe coincidir`);
    }
  });

  it("persists the optional toolCallId in metadata", async () => {
    const buffer = Buffer.from("tool-call-test");
    const toolCallId = "tool-call-789";

    const screenshotId = await saveScreenshot(buffer, runId, stepId, harness.dataDir, toolCallId);
    const list = await listScreenshotsByStep(runId, stepId, harness.dataDir);

    await registerScreenshotArtifacts(runId, stepId, screenshotId);
    await harness.writeJsonArtifact("screenshots/tool-call-metadata.json", list, "screenshots-tool-call-output");

    const entry = list.find((item) => item.screenshotId === screenshotId);
    assert.ok(entry, "debe encontrar entrada con toolCallId");
    assert.strictEqual(entry.toolCallId, toolCallId);
  });

  it("stores screenshots safely for Windows-unsafe run ids", async () => {
    const unsafeRunId = "73e935bb-aed2-4f31-9b03-7b6210ec0900::@playwright/mcp";
    const unsafeStepId = "3cb06fc8-f9c2-4fc6-b0d2-25c449496fbe";
    const buffer = Buffer.from("unsafe-path-test");

    const screenshotId = await saveScreenshot(buffer, unsafeRunId, unsafeStepId, harness.dataDir);
    const retrievedBuffer = await getScreenshot(screenshotId, harness.dataDir);

    await registerScreenshotArtifacts(unsafeRunId, unsafeStepId, screenshotId);
    assert.ok(screenshotId, "debe retornar screenshotId para runId con caracteres especiales");
    assert.ok(retrievedBuffer, "debe recuperar screenshot guardado con runId no seguro");
    assert.deepStrictEqual(retrievedBuffer, buffer, "contenido debe coincidir");
  });
});
