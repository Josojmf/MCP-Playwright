import assert from 'node:assert/strict';
import test from 'node:test';
import { preflight } from './preflight';

test('preflight - bloquea run ante mismatch de versión Playwright', async () => {
  const result = await preflight({
    mcpId: '@playwright/mcp',
    localPlaywrightVersion: '1.40.0',
    targetPlaywrightVersion: '1.39.0', // mismatch
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.reason!, /versión/i);
  assert.ok(result.action);
});

test('preflight - retorna diagnóstico accionable cuando falla', async () => {
  const result = await preflight({
    mcpId: '@playwright/mcp',
    localPlaywrightVersion: '1.40.0',
    targetPlaywrightVersion: '1.39.0',
  });

  assert.equal(result.status, 'blocked');
  assert.ok(result.reason?.length! > 0, 'Debe tener razón');
  assert.ok(result.action?.length! > 0, 'Debe tener acción sugerida');
});

test('preflight - retorna ok cuando todo es válido', async () => {
  const result = await preflight({
    mcpId: '@playwright/mcp',
    localPlaywrightVersion: '1.40.0',
    targetPlaywrightVersion: '1.40.0', // coinciden
  });

  assert.equal(result.status, 'ok');
});

test('preflight - valida capacidades mínimas MCP', async () => {
  const result = await preflight({
    mcpId: '@playwright/mcp',
    localPlaywrightVersion: '1.40.0',
    targetPlaywrightVersion: '1.40.0',
    capabilities: {
      toolNamespace: 'browser_',
    },
  });

  assert.equal(result.status, 'ok');
});

test('preflight - bloquea si MCP no soportado', async () => {
  const result = await preflight({
    mcpId: 'unsupported-mcp',
    localPlaywrightVersion: '1.40.0',
    targetPlaywrightVersion: '1.40.0',
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.reason!, /no soportado|no compatible/i);
});
