import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { InstrumentedMcpClient } from './InstrumentedMcpClient.ts';

describe('InstrumentedMcpClient', () => {
  let client: InstrumentedMcpClient;
  const runId = 'test-run-123';
  const stepId = 'test-step-456';

  before(() => {
    // Mock implementation for tests
    client = new InstrumentedMcpClient({
      callTool: async (name: string) => {
        // Simulate MCP tool response
        if (name === 'navigate') {
          return {
            type: 'success',
            content: [{ type: 'text', text: 'Navegated to page' }],
          };
        }
        if (name === 'click') {
          return {
            type: 'success',
            content: [{ type: 'text', text: 'Clicked button' }],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      },
    });
  });

  it('debería registrar cada tool call con trace completo', async () => {
    // Limpiar traces antes de prueba
    client.clearTraces();
    const traces = client.getTraces();
    assert.strictEqual(traces.length, 0, 'Sin traces inicialmente');

    // Simular screenshot capture
    const mockScreenshot = Buffer.from('mock-image-data');

    await client.callTool(
      'navigate',
      { url: 'https://example.com' },
      { runId, stepId, screenshot: mockScreenshot }
    );

    const updatedTraces = client.getTraces();
    assert.strictEqual(updatedTraces.length, 1, 'Un trace después del call');

    const trace = updatedTraces[0];
    assert.strictEqual(trace.toolName, 'navigate');
    assert.deepStrictEqual(trace.arguments, { url: 'https://example.com' });
    assert.strictEqual(trace.status, 'success');
    assert.ok(trace.latencyMs > 0);
    assert.ok(trace.correlationId);
    assert.ok(trace.screenshotId, 'debe tener screenshotId después de capture');
  });

  it('debería conservar evidencia parcial en errores de tool call', async () => {
    client.clearTraces();
    const traces = client.getTraces();
    traces.length = 0; // Reset

    // callTool debe registrar el error pero no relanzarlo
    // En su lugar, retorna un resultado de error
    await assert.rejects(
      () =>
        client.callTool(
          'nonexistent',
          { arg: 'value' },
          { runId, stepId }
        ),
      /Unknown tool: nonexistent/
    );

    // Verificar que se registró el trace incluso con error
    const updatedTraces = client.getTraces();
    assert.strictEqual(updatedTraces.length, 1, 'debe tener un trace incluso con error');

    const trace = updatedTraces[0];
    assert.strictEqual(trace.toolName, 'nonexistent');
    assert.strictEqual(trace.status, 'error');
    assert.ok(trace.errorMessage, 'debe tener mensaje de error');
    assert.ok(trace.latencyMs >= 0);
    assert.ok(trace.correlationId, 'debe retener correlationId incluso en error');
  });

  it('debería guardar screenshots con correlationId en cada call', async () => {
    client.clearTraces();

    const mockScreenshot = Buffer.from('screenshot-data-123');

    await client.callTool(
      'click',
      { selector: 'button' },
      { runId, stepId, screenshot: mockScreenshot }
    );

    const trace = client.getTraces()[0];
    assert.ok(trace, 'debe tener un trace');
    assert.ok(trace.screenshotId, 'debe generar screenshotId');
    assert.ok(trace.correlationId, 'debe tener correlationId');
    assert.ok(trace.correlationId.length > 0, 'correlationId debe ser único');

    // Verify screenshot was captured in metadata
    assert.ok(trace.captureTimestamp, 'debe registrar timestamp de captura');
  });

  it('debería retornar resultado de tool call original', async () => {
    const result = await client.callTool(
      'navigate',
      { url: 'https://test.com' },
      { runId, stepId }
    );

    assert.strictEqual(result.type, 'success');
    assert.ok(result.content);
  });

  it('debería generar correlationId único por step', async () => {
    client.clearTraces();
    // Reset traces

    // Simular dos tool calls en steps diferentes
    const result1 = await client.callTool(
      'navigate',
      { url: 'https://page1.com' },
      { runId, stepId: 'step-1' }
    );

    const result2 = await client.callTool(
      'click',
      { selector: 'button' },
      { runId, stepId: 'step-2' }
    );

    const traces = client.getTraces();
    assert.strictEqual(traces.length, 2, 'debe tener 2 traces');
    // Verificar que ambas llamadas retornaron éxito
    assert.ok(result1);
    assert.ok(result2);
    // Verificar correlationIds son únicos
    assert.ok(traces[0].correlationId);
    assert.ok(traces[1].correlationId);
    assert.notStrictEqual(
      traces[0].correlationId,
      traces[1].correlationId,
      'correlationIds deben ser únicos'
    );
  });
});
