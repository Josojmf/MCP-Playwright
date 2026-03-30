import assert from 'node:assert/strict';
import test from 'node:test';
import { isStaleRefError, retryWithNewSnapshot } from './stalenessRecovery';

test('stalenessRecovery - clasifica error stale-ref correctamente', () => {
  const staleRefError = new Error(
    'Error interacting with element: stale element reference (@playwright/mcp)'
  );

  const isStale = isStaleRefError(staleRefError);
  assert.equal(isStale, true);
});

test('stalenessRecovery - ignora errores que no son stale-ref', () => {
  const normalError = new Error('Some other error');
  const isStale = isStaleRefError(normalError);
  assert.equal(isStale, false);
});

test('stalenessRecovery - retry con snapshot nuevo retorna resultado', async () => {
  let callCount = 0;

  const operation = async () => {
    callCount++;
    if (callCount === 1) {
      throw new Error('stale element reference');
    }
    return { success: true };
  };

  const snapshotProvider = async () => {
    return { ariaSnapshot: 'new-snapshot' };
  };

  const result = await retryWithNewSnapshot(
    operation,
    snapshotProvider
  );

  assert.deepEqual(result, { success: true });
  assert.equal(callCount, 2, 'Debe haber reintentado una sola vez');
});

test('stalenessRecovery - falla si retry no resuelve stale-ref', async () => {
  const operation = async () => {
    throw new Error('stale element reference');
  };

  const snapshotProvider = async () => {
    return { ariaSnapshot: 'new-snapshot' };
  };

  await assert.rejects(
    retryWithNewSnapshot(operation, snapshotProvider),
    (error: unknown) => {
      return (
        error instanceof Error &&
        error.message.includes('stale element reference')
      );
    }
  );
});
