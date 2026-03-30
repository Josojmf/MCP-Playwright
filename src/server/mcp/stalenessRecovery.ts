/**
 * Recovery helper for ARIA stale references.
 * Detects stale-ref errors and retries with fresh snapshot (once).
 * Per EXEC-05: stale-ref errors are traced but don't degrade benchmark results.
 */

export interface SnapshotProvider {
  ariaSnapshot: string;
}

/**
 * Detect if error is a stale-ref error from @playwright/mcp
 */
export function isStaleRefError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('stale') &&
    (error.message.includes('element reference') ||
      error.message.includes('@playwright/mcp'))
  );
}

/**
 * Retry operation with a fresh snapshot if stale-ref detected.
 * Only retries once to avoid infinite loops.
 * Errors are traced but don't count against benchmark.
 */
export async function retryWithNewSnapshot<T>(
  operation: () => Promise<T>,
  snapshotProvider: () => Promise<SnapshotProvider>
): Promise<T> {
  let lastError: Error | null = null;

  try {
    return await operation();
  } catch (error) {
    if (!isStaleRefError(error)) {
      throw error;
    }

    lastError = error as Error;
  }

  // Stale ref detected - get fresh snapshot and retry once
  await snapshotProvider();

  try {
    return await operation();
  } catch (retryError) {
    // If retry also fails, throw original stale-ref error
    throw lastError;
  }
}

/**
 * Helper to trace stale-ref recoveries without degrading results.
 * Used by InstrumentedMcpClient (Plan-03).
 */
export function traceStaleRefRecovery(
  scenarioId: string,
  stepIndex: number,
  recoverySuccess: boolean
): void {
  const status = recoverySuccess ? '✓ RECUPERADO' : '✗ PERMANENTE';
  console.debug(
    `[STALE-REF] Escenario: ${scenarioId}, Paso: ${stepIndex}, ${status}`
  );
}
