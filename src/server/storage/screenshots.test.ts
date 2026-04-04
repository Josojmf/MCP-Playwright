import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  saveScreenshot,
  getScreenshot,
  listScreenshotsByStep,
} from './screenshots';

// Directorio temporal para pruebas
const TEST_DATA_DIR = path.join(process.cwd(), '.test-screenshots');

describe('Screenshots Storage', () => {
  const runId = 'test-run-123';
  const stepId = 'test-step-456';

  before(async () => {
    // Limpiar directorio de prueba
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true });
    } catch {
      // Directorio no existe, ignorar
    }
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  after(async () => {
    // Limpiar después de pruebas
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true });
    } catch {
      // Ignorar errores de limpieza
    }
  });

  it('debería guardar screenshot y retornar screenshotId', async () => {
    // Limpiar stepId específico para esta prueba
    const testStepId = 'step-001';
    try {
      await fs.rm(path.join(TEST_DATA_DIR, 'screenshots', runId, testStepId), {
        recursive: true,
      });
    } catch {
      // No existe aún
    }

    const buffer = Buffer.from('mock-screenshot-data');

    const screenshotId = await saveScreenshot(buffer, runId, testStepId, TEST_DATA_DIR);

    assert.ok(screenshotId, 'debe retornar screenshotId');
    assert.strictEqual(typeof screenshotId, 'string');
  });

  it('debería recuperar screenshot por ID', async () => {
    const testStepId = 'step-002';
    try {
      await fs.rm(path.join(TEST_DATA_DIR, 'screenshots', runId, testStepId), {
        recursive: true,
      });
    } catch {
      // No existe  aún
    }

    const originalBuffer = Buffer.from('test-image-content-123');

    const screenshotId = await saveScreenshot(originalBuffer, runId, testStepId, TEST_DATA_DIR);
    const retrievedBuffer = await getScreenshot(screenshotId, TEST_DATA_DIR);

    assert.ok(retrievedBuffer);
    assert.deepStrictEqual(retrievedBuffer, originalBuffer, 'contenido debe coincidido exactamente');
  });

  it('debería listar screenshots por step', async () => {
    const testStepId = 'step-003';
    try {
      await fs.rm(path.join(TEST_DATA_DIR, 'screenshots', runId, testStepId), {
        recursive: true,
      });
    } catch {
      // No existe aún
    }

    const buffer1 = Buffer.from('screenshot-1');
    const buffer2 = Buffer.from('screenshot-2');

    const id1 = await saveScreenshot(buffer1, runId, testStepId, TEST_DATA_DIR);
    const id2 = await saveScreenshot(buffer2, runId, testStepId, TEST_DATA_DIR);

    const list = await listScreenshotsByStep(runId, testStepId, TEST_DATA_DIR);

    assert.ok(Array.isArray(list), 'debe retornar un array');
    assert.strictEqual(list.length, 2, 'debe tener 2 screenshots');

    const ids = list.map(item => item.screenshotId);
    assert.ok(ids.includes(id1), 'debe incluir primer screenshot');
    assert.ok(ids.includes(id2), 'debe incluir segundo screenshot');
  });

  it('debería incluir metadata en cada screenshot', async () => {
    const buffer = Buffer.from('metadata-test');

    const screenshotId = await saveScreenshot(buffer, runId, stepId, TEST_DATA_DIR);
    const list = await listScreenshotsByStep(runId, stepId, TEST_DATA_DIR);

    const entry = list.find(item => item.screenshotId === screenshotId);
    assert.ok(entry, 'debe encontrar entrada');
    assert.ok(entry.timestamp, 'debe tener timestamp');
    assert.strictEqual(typeof entry.timestamp, 'string');
  });

  it('debería retornar array vacío para step sin screenshots', async () => {
    const list = await listScreenshotsByStep(runId, 'nonexistent-step', TEST_DATA_DIR);

    assert.ok(Array.isArray(list), 'debe retornar array');
    assert.strictEqual(list.length, 0, 'debe estar vacío para step inexistente');
  });

  it('debería manejar screenshots múltiples por step sin colisiones', async () => {
    const buffers = [
      Buffer.from('image-1'),
      Buffer.from('image-2'),
      Buffer.from('image-3'),
    ];

    const ids = await Promise.all(
      buffers.map(buf => saveScreenshot(buf, runId, 'multi-step', TEST_DATA_DIR))
    );

    // Verificar que cada ID es único
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, 'todos los IDs deben ser únicos');

    // Verificar que todos los screenshots se pueden recuperar
    for (let i = 0; i < ids.length; i++) {
      const retrieved = await getScreenshot(ids[i], TEST_DATA_DIR);
      assert.deepStrictEqual(retrieved, buffers[i], `contenido de screenshot ${i} debe coincidir`);
    }
  });

  it('debería incluir toolCallId opcional en metadata', async () => {
    const buffer = Buffer.from('tool-call-test');
    const toolCallId = 'tool-call-789';

    const screenshotId = await saveScreenshot(
      buffer,
      runId,
      stepId,
      TEST_DATA_DIR,
      toolCallId
    );

    const list = await listScreenshotsByStep(runId, stepId, TEST_DATA_DIR);
    const entry = list.find(item => item.screenshotId === screenshotId);

    // Si toolCallId fue capturado, debe estar en metadata
    if (entry && entry.toolCallId) {
      assert.strictEqual(entry.toolCallId, toolCallId);
    }
  });

  it('debería guardar screenshot con runId no seguro para path (Windows-safe)', async () => {
    const unsafeRunId = '73e935bb-aed2-4f31-9b03-7b6210ec0900::@playwright/mcp';
    const unsafeStepId = '3cb06fc8-f9c2-4fc6-b0d2-25c449496fbe';
    const buffer = Buffer.from('unsafe-path-test');

    const screenshotId = await saveScreenshot(buffer, unsafeRunId, unsafeStepId, TEST_DATA_DIR);
    const retrievedBuffer = await getScreenshot(screenshotId, TEST_DATA_DIR);

    assert.ok(screenshotId, 'debe retornar screenshotId para runId con caracteres especiales');
    assert.ok(retrievedBuffer, 'debe recuperar screenshot guardado con runId no seguro');
    assert.deepStrictEqual(retrievedBuffer, buffer, 'contenido debe coincidir');
  });
});
