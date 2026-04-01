import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { McpProcessManager } from './McpProcessManager';

// These tests validate pre-spawn guard behavior — no actual MCP process is spawned.
// The real registry has @playwright/mcp with a valid spawnCommand.

describe('McpProcessManager - pre-spawn guards', () => {
  it('constructor throws if mcpId not in registry', () => {
    assert.throws(
      () => new McpProcessManager('nonexistent-mcp-that-does-not-exist'),
      (error: unknown) => {
        return (
          error instanceof Error &&
          error.message.includes('No spawnCommand in registry')
        );
      }
    );
  });

  it('healthCheck returns false before spawn', async () => {
    const pm = new McpProcessManager('@playwright/mcp');
    const healthy = await pm.healthCheck();
    assert.equal(healthy, false);
  });

  it('callTool throws before spawn', async () => {
    const pm = new McpProcessManager('@playwright/mcp');
    await assert.rejects(
      pm.callTool('some-tool', {}),
      (error: unknown) => {
        return (
          error instanceof Error &&
          error.message.includes('MCP client not initialized')
        );
      }
    );
  });

  it('dispose is safe to call before spawn', async () => {
    const pm = new McpProcessManager('@playwright/mcp');
    await assert.doesNotReject(pm.dispose());
    assert.equal(pm.pid, null);
    assert.equal(pm.startedAt, null);
  });

  it('crashed is false on construction', () => {
    const pm = new McpProcessManager('@playwright/mcp');
    assert.equal(pm.crashed, false);
  });

  it('getTools returns empty array before spawn', () => {
    const pm = new McpProcessManager('@playwright/mcp');
    assert.deepEqual(pm.getTools(), []);
  });
});
