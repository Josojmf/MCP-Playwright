import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_ENV_VAR = "TEST_FAILURE_REGISTRY_PATH";
const CONTEXT_DIR_ENV_VAR = "TEST_FAILURE_CONTEXT_DIR";

export type FailureArtifactKind = "file" | "directory";

export interface FailureArtifactRecord {
  kind: FailureArtifactKind;
  label: string;
  path: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterFailureArtifactOptions {
  kind?: FailureArtifactKind;
  metadata?: Record<string, unknown>;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function sanitizeRelativePath(relativePath: string): string {
  return relativePath
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

async function appendRegistryRecord(record: FailureArtifactRecord): Promise<void> {
  const registryPath = readEnv(REGISTRY_ENV_VAR);
  if (!registryPath) {
    return;
  }

  await mkdir(path.dirname(registryPath), { recursive: true });
  await appendFile(registryPath, `${JSON.stringify(record)}\n`, "utf8");
}

export function getFailureContextDir(): string | undefined {
  return readEnv(CONTEXT_DIR_ENV_VAR);
}

export async function registerFailureArtifact(
  artifactPath: string,
  label: string,
  options: RegisterFailureArtifactOptions = {},
): Promise<void> {
  await appendRegistryRecord({
    kind: options.kind ?? "file",
    label,
    path: path.resolve(artifactPath),
    createdAt: new Date().toISOString(),
    metadata: options.metadata,
  });
}

export async function registerFailureArtifactDir(
  artifactPath: string,
  label: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await registerFailureArtifact(artifactPath, label, {
    kind: "directory",
    metadata,
  });
}

export async function writeFailureArtifact(
  relativePath: string,
  content: string | Buffer,
  label: string,
  metadata?: Record<string, unknown>,
): Promise<string | undefined> {
  const contextDir = getFailureContextDir();
  if (!contextDir) {
    return undefined;
  }

  const safeRelativePath = sanitizeRelativePath(relativePath);
  if (!safeRelativePath) {
    return undefined;
  }

  const artifactPath = path.join(contextDir, safeRelativePath);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, content);
  await registerFailureArtifact(artifactPath, label, { metadata });
  return artifactPath;
}

export async function writeFailureJson(
  relativePath: string,
  value: unknown,
  label: string,
  metadata?: Record<string, unknown>,
): Promise<string | undefined> {
  return writeFailureArtifact(relativePath, JSON.stringify(value, null, 2), label, metadata);
}
