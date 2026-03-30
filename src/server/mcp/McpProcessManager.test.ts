import assert from 'node:assert/strict';
import test from 'node:test';
import { McpProcessManager } from './McpProcessManager';

test('McpProcessManager - spawn devuelve PID único y estado healthy', async () => {
  const manager = new McpProcessManager('@playwright/mcp');

  // Simular comando simple que no falla
  const result = await manager.spawn();

  assert.ok(typeof result.pid === 'number');
  assert.ok(result.pid > 0);
  assert.ok(result.startedAt instanceof Date);
  assert.equal(manager.crashed, false);

  // Cleanup
  await manager.dispose();
});

test('McpProcessManager - debe rechazar si proceso ya está corriendo', async () => {
  const manager = new McpProcessManager('@playwright/mcp');

  await manager.spawn();

  await assert.rejects(
    manager.spawn(),
    (error: unknown) => {
      return (
        error instanceof Error &&
        error.message.includes('Proceso MCP ya está en ejecución')
      );
    }
  );

  await manager.dispose();
});

test('McpProcessManager - debe detener proceso gracefully', async () => {
  const manager = new McpProcessManager('@playwright/mcp');

  await manager.spawn();
  await manager.stop();

  // Verificar que el proceso se ha detenido
  assert.ok(manager.crashed || manager.pid === null);

  await manager.dispose();
});

test('McpProcessManager - debe limpiar proceso en dispose', async () => {
  const manager = new McpProcessManager('@playwright/mcp');

  await manager.spawn();

  await manager.dispose();

  assert.equal(manager.pid, null);
  assert.equal(manager.startedAt, null);
});

test('McpProcessManager - debe no lanzar error al disponer sin spawn', async () => {
  const manager = new McpProcessManager('@playwright/mcp');

  // Should not throw
  await manager.dispose();
  assert.equal(manager.pid, null);
});

test('McpProcessManager - healthCheck retorna true si proceso está sano', async () => {
  const manager = new McpProcessManager('@playwright/mcp');

  await manager.spawn();
  const isHealthy = await manager.healthCheck();

  assert.equal(isHealthy, true);

  await manager.dispose();
});
