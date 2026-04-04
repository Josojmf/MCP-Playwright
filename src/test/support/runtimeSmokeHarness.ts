import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getFailureContextDir,
  registerFailureArtifact,
  registerFailureArtifactDir,
  writeFailureArtifact,
  writeFailureJson,
} from "./failureBundle";

type CleanupFn = () => Promise<void> | void;

export interface RuntimeSmokeHarness {
  readonly scopeName: string;
  readonly tempRoot: string;
  readonly workingDir: string;
  readonly dataDir: string;
  activate(): Promise<void>;
  resetState(): Promise<void>;
  cleanup(): Promise<void>;
  registerCleanup(fn: CleanupFn): void;
  registerArtifactPath(
    artifactPath: string,
    label: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  registerArtifactDir(
    artifactPath: string,
    label: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  writeArtifact(
    relativePath: string,
    content: string | Buffer,
    label: string,
    metadata?: Record<string, unknown>,
  ): Promise<string | undefined>;
  writeJsonArtifact(
    relativePath: string,
    value: unknown,
    label: string,
    metadata?: Record<string, unknown>,
  ): Promise<string | undefined>;
}

function sanitizeName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized || "smoke";
}

async function maybeCloseDb(): Promise<void> {
  try {
    const sqlite = await import("../../server/storage/sqlite.ts");
    sqlite.closeDb();
  } catch {
    // The sqlite module is optional for a given smoke file.
  }
}

export async function createRuntimeSmokeHarness(scopeName: string): Promise<RuntimeSmokeHarness> {
  const originalCwd = process.cwd();
  const originalDataDir = process.env.DATA_DIR;
  const tempBaseDir =
    getFailureContextDir() ?? path.join(os.tmpdir(), "mcp-playwright-runtime-smoke");
  await mkdir(tempBaseDir, { recursive: true });
  const tempRoot = await mkdtemp(path.join(tempBaseDir, `${sanitizeName(scopeName)}-`));
  const workingDir = path.join(tempRoot, "workspace");
  const dataDir = path.join(workingDir, ".data");
  const cleanupFns: CleanupFn[] = [];
  let activated = false;
  let restored = false;

  async function activate(): Promise<void> {
    if (activated) {
      return;
    }

    await mkdir(dataDir, { recursive: true });
    process.env.DATA_DIR = dataDir;
    process.chdir(workingDir);
    await registerFailureArtifactDir(tempRoot, `${scopeName}-runtime-root`, {
      scopeName,
      kind: "runtime-root",
    });
    await registerFailureArtifactDir(dataDir, `${scopeName}-data-dir`, {
      scopeName,
      kind: "data-dir",
    });
    await writeFailureJson(
      "runtime/manifest.json",
      {
        scopeName,
        tempRoot,
        workingDir,
        dataDir,
      },
      `${scopeName}-runtime-manifest`,
    );
    activated = true;
  }

  async function resetState(): Promise<void> {
    await maybeCloseDb();
    await rm(dataDir, { recursive: true, force: true });
    await mkdir(dataDir, { recursive: true });
  }

  async function cleanup(): Promise<void> {
    if (restored) {
      return;
    }

    await maybeCloseDb();
    for (const cleanupFn of cleanupFns.slice().reverse()) {
      await cleanupFn();
    }

    process.chdir(originalCwd);
    if (originalDataDir) {
      process.env.DATA_DIR = originalDataDir;
    } else {
      delete process.env.DATA_DIR;
    }

    restored = true;
  }

  return {
    scopeName,
    tempRoot,
    workingDir,
    dataDir,
    activate,
    resetState,
    cleanup,
    registerCleanup(fn: CleanupFn) {
      cleanupFns.push(fn);
    },
    async registerArtifactPath(
      artifactPath: string,
      label: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> {
      await registerFailureArtifact(artifactPath, label, {
        metadata,
      });
    },
    async registerArtifactDir(
      artifactPath: string,
      label: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> {
      await registerFailureArtifactDir(artifactPath, label, metadata);
    },
    async writeArtifact(
      relativePath: string,
      content: string | Buffer,
      label: string,
      metadata?: Record<string, unknown>,
    ): Promise<string | undefined> {
      return writeFailureArtifact(relativePath, content, label, metadata);
    },
    async writeJsonArtifact(
      relativePath: string,
      value: unknown,
      label: string,
      metadata?: Record<string, unknown>,
    ): Promise<string | undefined> {
      return writeFailureJson(relativePath, value, label, metadata);
    },
  };
}
