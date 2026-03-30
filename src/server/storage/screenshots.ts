import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Metadata para un screenshot capturado
 */
export interface ScreenshotMetadata {
  screenshotId: string;
  timestamp: string;
  toolCallId?: string;
  tool?: string;
  status?: 'success' | 'error';
}

/**
 * Guarda un screenshot en el almacenamiento
 * @param buffer contenido binario de la imagen
 * @param runId identificador del run
 * @param stepId identificador del step
 * @param dataDir directorio base para almacenamiento (por defecto usará DATA_DIR)
 * @param toolCallId opcional: identificador del tool call para correlación
 * @returns screenshotId generado
 */
export async function saveScreenshot(
  buffer: Buffer,
  runId: string,
  stepId: string,
  dataDir: string = process.env.DATA_DIR || './data',
  toolCallId?: string
): Promise<string> {
  const screenshotId = randomUUID();
  const timestamp = new Date().toISOString();

  // Crear directorio: ${dataDir}/screenshots/{runId}/{stepId}/
  const screenshotDir = path.join(dataDir, 'screenshots', runId, stepId);
  await fs.mkdir(screenshotDir, { recursive: true });

  // Guardar imagen binaria
  const imagePath = path.join(screenshotDir, `${screenshotId}.png`);
  await fs.writeFile(imagePath, buffer);

  // Guardar metadata JSON mínima
  const metadata: ScreenshotMetadata = {
    screenshotId,
    timestamp,
  };

  if (toolCallId) {
    metadata.toolCallId = toolCallId;
  }

  const metadataPath = path.join(screenshotDir, `${screenshotId}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

  return screenshotId;
}

/**
 * Recupera un screenshot por su ID
 * @param screenshotId identificador del screenshot
 * @param dataDir directorio base para almacenamiento
 * @returns Buffer con contenido de la imagen o undefined si no existe
 */
export async function getScreenshot(
  screenshotId: string,
  dataDir: string = process.env.DATA_DIR || './data'
): Promise<Buffer | undefined> {
  // Buscar en todas las carpetas de steps (estructura: screenshots/{runId}/{stepId}/{screenshotId}.png)
  try {
    const screenshotsBaseDir = path.join(dataDir, 'screenshots');
    await fs.access(screenshotsBaseDir);

    // Iterar sobre runs
    const runs = await fs.readdir(screenshotsBaseDir);
    for (const runDir of runs) {
      const stepsDir = path.join(screenshotsBaseDir, runDir);
      const stats = await fs.stat(stepsDir);

      if (!stats.isDirectory()) continue;

      // Iterar sobre steps
      const steps = await fs.readdir(stepsDir);
      for (const stepDir of steps) {
        const imagePath = path.join(stepsDir, stepDir, `${screenshotId}.png`);
        try {
          const buffer = await fs.readFile(imagePath);
          return buffer;
        } catch {
          // Archivo no existe en este step, continuar
        }
      }
    }
  } catch {
    // Directorio no existe o error de acceso
  }

  return undefined;
}

/**
 * Lista todos los screenshots de un step específico
 * @param runId identificador del run
 * @param stepId identificador del step
 * @param dataDir directorio base para almacenamiento
 * @returns Array de metadata de screenshots
 */
export async function listScreenshotsByStep(
  runId: string,
  stepId: string,
  dataDir: string = process.env.DATA_DIR || './data'
): Promise<ScreenshotMetadata[]> {
  const stepDir = path.join(dataDir, 'screenshots', runId, stepId);

  try {
    const files = await fs.readdir(stepDir);
    const screenshots: ScreenshotMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const metadataPath = path.join(stepDir, file);
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent) as ScreenshotMetadata;
        screenshots.push(metadata);
      }
    }

    // Ordenar por timestamp
    screenshots.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return screenshots;
  } catch {
    // Directorio no existe o error de lectura
    return [];
  }
}

/**
 * Lista todos los screenshots de un run
 * @param runId identificador del run
 * @param dataDir directorio base para almacenamiento
 * @returns Array de screenshots con runId y stepId
 */
export async function listScreenshotsByRun(
  runId: string,
  dataDir: string = process.env.DATA_DIR || './data'
): Promise<
  Array<ScreenshotMetadata & { runId: string; stepId: string }>
> {
  const runDir = path.join(dataDir, 'screenshots', runId);

  try {
    const steps = await fs.readdir(runDir);
    const allScreenshots: Array<ScreenshotMetadata & { runId: string; stepId: string }> = [];

    for (const stepId of steps) {
      const stepScreenshots = await listScreenshotsByStep(runId, stepId, dataDir);
      allScreenshots.push(
        ...stepScreenshots.map(ss => ({
          ...ss,
          runId,
          stepId,
        }))
      );
    }

    return allScreenshots;
  } catch {
    // Directorio no existe o error de lectura
    return [];
  }
}
