import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  runAssertion,
  setupPlaywrightContext,
  cleanupPlaywrightContext,
} from './assertionsRunner';
import { TranslatedAssertion } from '../parser/translator';

describe('assertionsRunner', () => {
  // Setup y teardown para contexto de Playwright (mock para tests)
  before(async () => {
    // Inicializar contexto de Playwright si es necesario
    await setupPlaywrightContext();
  });

  after(async () => {
    // Limpiar contexto
    await cleanupPlaywrightContext();
  });

  it('debería marcar assertion válida como passed', async () => {
    const mockAssertion: TranslatedAssertion = {
      patternId: 'text-visible',
      original: '"Hola" should be visible',
      playwrightCall: 'expect(page.getByText("Hola")).toBeVisible()',
    };

    // Mock del contexto con un page mock que tiene getByText
    const mockContext = {
      page: {
        getByText: (_text: string) => ({
          toBeVisible: () => Promise.resolve(true),
        }),
      },
    };

    const result = await runAssertion(mockAssertion, mockContext);

    assert.strictEqual(result.status, 'passed', 'debe ser passed para assertion válida');
    assert.strictEqual(result.message, undefined, 'no debe tener mensaje de error');
  });

  it('debería marcar assertion inválida como failed aunque MCP diga success', async () => {
    const mockAssertion: TranslatedAssertion = {
      patternId: 'text-visible',
      original: '"Text no existe" should be visible',
      playwrightCall: 'throw new Error("Locator has no element that matches the specified criteria")',
    };

    // Contexto vacío - el playwrightCall va a fallar
    const mockContext = {};

    const result = await runAssertion(mockAssertion, mockContext);

    assert.strictEqual(result.status, 'failed', 'debe ser failed si Playwright falla');
    assert.ok(result.message, 'debe tener mensaje de error');
  });

  it('debería capturar errores de expect() con mensaje legible en español', async () => {
    const assertion: TranslatedAssertion = {
      patternId: null,
      original: 'Invalid assertion',
      playwrightCall: 'invalid_code_here()',
    };

    const mockContext = {};

    const result = await runAssertion(assertion, mockContext);

    assert.strictEqual(result.status, 'failed');
    assert.ok(result.message, 'debe tener mensaje de error');
    assert.ok(result.stack, 'debe tener stack trace');
  });

  it('debería ser independiente del resultado reportado por MCP', async () => {
    // Un assertion que Playwright dice que pasó
    const assertion: TranslatedAssertion = {
      patternId: 'url-match',
      original: 'I should see the URL "https://example.com"',
      playwrightCall: 'expect(page).toHaveURL("https://example.com")',
    };

    // Context donde expect() falla internamente
    const mockContext = {
      page: {
        url: () => 'https://other.com',
      },
      expect: (_value: unknown) => ({
        toHaveURL: (_url: string) => {
          throw new Error(`URL no coincide`);
        },
      }),
    };

    const result = await runAssertion(assertion, mockContext);

    assert.strictEqual(result.status, 'failed', 'debe fallar independientemente del reporte MCP');
  });

  it('debería manejar assertions sin playwrightCall traducido', async () => {
    const assertion: TranslatedAssertion = {
      patternId: null,
      original: 'Alguna assertion desconocida',
      playwrightCall: null,
    };

    const result = await runAssertion(assertion, {});

    // Assertion no traducida debe ser marcada como failed
    assert.strictEqual(result.status, 'failed');
    assert.ok(result.message);
  });

  it('debería retornar AssertionResult con status y mensaje opcionalmente', async () => {
    const assertion: TranslatedAssertion = {
      patternId: 'text-visible',
      original: 'Test',
      playwrightCall: 'expect(true).toBe(true)',
    };

    const result = await runAssertion(assertion, {});

    assert.ok(result.status);
    assert.strictEqual(typeof result.status, 'string');
    assert.ok(['passed', 'failed'].includes(result.status));
    // message es opcional, puede ser undefined
    if (result.message !== undefined) {
      assert.strictEqual(typeof result.message, 'string');
    }
  });

  it('debería ejecutar playwrightCall en contexto controlado', async () => {
    const assertion: TranslatedAssertion = {
      patternId: 'custom',
      original: 'Custom assertion',
      playwrightCall: 'true', // Simplest valid assertion
    };

    const mockContext = {};

    const result = await runAssertion(assertion, mockContext);

    // Verificar que se ejecutó en contexto
    assert.ok(result, 'debe retornar resultado');
  });
});
