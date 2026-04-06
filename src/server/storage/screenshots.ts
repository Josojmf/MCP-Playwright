import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Resolves relative DATA_DIR against cwd so save/load stay consistent across processes. */
export function resolveDataDir(dataDir: string): string {
  if (path.isAbsolute(dataDir)) {
    return path.normalize(dataDir);
  }
  return path.resolve(process.cwd(), dataDir);
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "empty";
  }

  return trimmed
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_");
}

function resolveRunStepDir(dataDir: string, runId: string, stepId: string): string {
  const base = resolveDataDir(dataDir);
  return path.join(base, "screenshots", sanitizePathSegment(runId), sanitizePathSegment(stepId));
}

export function resolveScreenshotImagePath(
  runId: string,
  stepId: string,
  screenshotId: string,
  dataDir: string = process.env.DATA_DIR || ".data"
): string {
  return path.join(resolveRunStepDir(dataDir, runId, stepId), `${screenshotId}.png`);
}

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
  dataDir: string = process.env.DATA_DIR || ".data",
  toolCallId?: string
): Promise<string> {
  const screenshotId = randomUUID();
  const timestamp = new Date().toISOString();

  // Crear directorio: ${dataDir}/screenshots/{runId}/{stepId}/
  const screenshotDir = resolveRunStepDir(dataDir, runId, stepId);
  await fs.mkdir(screenshotDir, { recursive: true });

  // Guardar imagen binaria
  const imagePath = path.join(screenshotDir, `${screenshotId}.png`);
  await fs.writeFile(imagePath, buffer);

  // Copia plana por id (GET /api/screenshots/:id acierta siempre sin recorrer árbol)
  const base = resolveDataDir(dataDir);
  const byIdDir = path.join(base, "screenshots", "_byId");
  await fs.mkdir(byIdDir, { recursive: true });
  await fs.writeFile(path.join(byIdDir, `${screenshotId}.png`), buffer);

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
  dataDir: string = process.env.DATA_DIR || ".data"
): Promise<Buffer | undefined> {
  const base = resolveDataDir(dataDir);
  const flatPath = path.join(base, "screenshots", "_byId", `${screenshotId}.png`);
  try {
    return await fs.readFile(flatPath);
  } catch {
    // capturas antiguas o sin índice plano
  }

  // Buscar en todas las carpetas de steps (estructura: screenshots/{runId}/{stepId}/{screenshotId}.png)
  try {
    const screenshotsBaseDir = path.join(base, "screenshots");
    await fs.access(screenshotsBaseDir);

    const runs = await fs.readdir(screenshotsBaseDir);
    for (const runDir of runs) {
      if (runDir === "_byId") {
        continue;
      }
      const stepsDir = path.join(screenshotsBaseDir, runDir);
      const stats = await fs.stat(stepsDir);

      if (!stats.isDirectory()) continue;

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
  dataDir: string = process.env.DATA_DIR || ".data"
): Promise<ScreenshotMetadata[]> {
  const stepDir = resolveRunStepDir(dataDir, runId, stepId);

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
  dataDir: string = process.env.DATA_DIR || ".data"
): Promise<
  Array<ScreenshotMetadata & { runId: string; stepId: string }>
> {
  const base = resolveDataDir(dataDir);
  const runDir = path.join(base, "screenshots", sanitizePathSegment(runId));

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
