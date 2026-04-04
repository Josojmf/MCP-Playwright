import { readdirSync, statSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { testManifest } from "./test-manifest.mjs";

const projectRoot = process.cwd();
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const failureArtifactsRoot = path.join(projectRoot, ".artifacts", "test-failures");

function sanitizeFileComponent(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact";
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function walkFiles(rootDir) {
  const absoluteRoot = path.join(projectRoot, rootDir);
  const results = [];
  const queue = [absoluteRoot];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = readdirSync(currentDir, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        results.push(toPosixPath(path.relative(projectRoot, absolutePath)));
      }
    }
  }

  return results.sort();
}

function ensureFilesExist(files) {
  for (const file of files) {
    const absolutePath = path.join(projectRoot, file);
    if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Manifest file does not exist: ${file}`);
    }
  }
}

function resolveFastLaneFiles() {
  const { includeSuffixes, excludeFiles } = testManifest.fast.ownership;
  const excluded = new Set(excludeFiles);

  ensureFilesExist(excludeFiles);

  return walkFiles("src").filter((file) => {
    if (excluded.has(file)) {
      return false;
    }

    return includeSuffixes.some((suffix) => file.endsWith(suffix));
  });
}

function resolveSmokeLaneFiles() {
  const files = testManifest.smoke.ownership.files.map((entry) => entry.file).sort();
  ensureFilesExist(files);
  return files;
}

function resolveLaneFiles(laneName) {
  if (laneName === "fast") {
    return resolveFastLaneFiles();
  }

  if (laneName === "smoke") {
    return resolveSmokeLaneFiles();
  }

  throw new Error(`Unknown lane: ${laneName}`);
}

function getFailureBundleConfig(laneName) {
  return testManifest[laneName]?.diagnostics?.failureBundle ?? false;
}

function printLaneList(laneName, files) {
  console.log(`Lane: ${laneName}`);
  for (const file of files) {
    console.log(file);
  }
}

async function createFailureBundleSession(laneName, files) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(failureArtifactsRoot, ".tmp", `${laneName}-${timestamp}`);
  const registryPath = path.join(sessionDir, "registry.jsonl");
  const contextDir = path.join(sessionDir, "context");

  await mkdir(contextDir, { recursive: true });

  return {
    laneName,
    files,
    startedAt: new Date().toISOString(),
    sessionDir,
    registryPath,
    contextDir,
  };
}

async function readFailureRegistry(registryPath) {
  try {
    const content = await readFile(registryPath, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function copyArtifactIntoBundle(entry, bundleArtifactsDir, seenTargets) {
  const labelPrefix = sanitizeFileComponent(entry.label);
  const targetName = `${String(seenTargets.size).padStart(2, "0")}-${labelPrefix}`;
  const destinationPath = path.join(bundleArtifactsDir, targetName);
  seenTargets.add(targetName);
  await cp(entry.path, destinationPath, {
    recursive: entry.kind === "directory",
    force: true,
  });
  return path.relative(projectRoot, destinationPath).split(path.sep).join("/");
}

async function finalizeFailureBundle(session, result) {
  const failureConfig = getFailureBundleConfig(session.laneName);
  if (!failureConfig || !failureConfig.enabled) {
    return undefined;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundleDir = path.join(projectRoot, failureConfig.outputDir, timestamp);
  const bundleArtifactsDir = path.join(bundleDir, "artifacts");
  const registryEntries = await readFailureRegistry(session.registryPath);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const suspectedFailingFiles = session.files.filter((file) => combinedOutput.includes(file));
  const copiedArtifacts = [];
  const seenTargets = new Set();

  await mkdir(bundleArtifactsDir, { recursive: true });
  await writeFile(path.join(bundleDir, "stdout.log"), result.stdout, "utf8");
  await writeFile(path.join(bundleDir, "stderr.log"), result.stderr, "utf8");

  if (statSync(session.contextDir, { throwIfNoEntry: false })?.isDirectory()) {
    await cp(session.contextDir, path.join(bundleDir, "context"), {
      recursive: true,
      force: true,
    });
  }

  for (const entry of registryEntries) {
    const sourceStats = statSync(entry.path, { throwIfNoEntry: false });
    if (!sourceStats) {
      copiedArtifacts.push({
        ...entry,
        copiedTo: null,
        missing: true,
      });
      continue;
    }

    const copiedTo = await copyArtifactIntoBundle(entry, bundleArtifactsDir, seenTargets);
    copiedArtifacts.push({
      ...entry,
      copiedTo,
      missing: false,
    });
  }

  const manifest = {
    lane: session.laneName,
    startedAt: session.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    command: `node ${path.relative(projectRoot, tsxCli)} --test ${session.files.join(" ")}`,
    executedFiles: session.files,
    suspectedFailingFiles,
    env: {
      CI: process.env.CI ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
      DATA_DIR: process.env.DATA_DIR ?? null,
    },
    diagnostics: {
      retention: failureConfig.retention ?? null,
      stdoutLog: "stdout.log",
      stderrLog: "stderr.log",
      copiedArtifacts,
    },
  };

  await writeFile(path.join(bundleDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await rm(session.sessionDir, { recursive: true, force: true });
  return bundleDir;
}

async function cleanupFailureBundleSession(session) {
  if (!session) {
    return;
  }

  await rm(session.sessionDir, { recursive: true, force: true });
}

function runTsxTests(files, laneName) {
  return new Promise((resolve, reject) => {
    (async () => {
      const shouldCollectFailureBundle = Boolean(getFailureBundleConfig(laneName)?.enabled);
      const startEpochMs = Date.now();
      const session = shouldCollectFailureBundle ? await createFailureBundleSession(laneName, files) : null;
      const stdoutChunks = [];
      const stderrChunks = [];
      const env = { ...process.env };

      if (session) {
        env.TEST_FAILURE_REGISTRY_PATH = session.registryPath;
        env.TEST_FAILURE_CONTEXT_DIR = session.contextDir;
        env.TEST_FAILURE_LANE = laneName;
      }

      const child = spawn(process.execPath, [tsxCli, "--test", ...files], {
        cwd: projectRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(chunk.toString());
        process.stdout.write(chunk);
      });

      child.stderr.on("data", (chunk) => {
        stderrChunks.push(chunk.toString());
        process.stderr.write(chunk);
      });

      child.on("error", reject);
      child.on("exit", async (code, signal) => {
        if (signal) {
          reject(new Error(`Test lane exited from signal ${signal}`));
          return;
        }

        const exitCode = code ?? 1;
        const result = {
          exitCode,
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          durationMs: Date.now() - startEpochMs,
          finishedAt: new Date().toISOString(),
        };

        try {
          const failureBundlePath =
            exitCode !== 0 && session ? await finalizeFailureBundle(session, result) : undefined;
          if (exitCode === 0) {
            await cleanupFailureBundleSession(session);
          }

          resolve({
            exitCode,
            failureBundlePath,
          });
        } catch (error) {
          reject(error);
        }
      });
    })().catch(reject);
  });
}

async function runLane(laneName, { listOnly }) {
  const files = resolveLaneFiles(laneName);

  if (files.length === 0) {
    throw new Error(`Lane "${laneName}" resolved to zero files.`);
  }

  if (listOnly) {
    printLaneList(laneName, files);
    return 0;
  }

  console.log(`Running ${laneName} lane with ${files.length} files.`);
  const result = await runTsxTests(files, laneName);
  if (result.failureBundlePath) {
    console.error(`Failure bundle: ${path.relative(projectRoot, result.failureBundlePath)}`);
  }
  return result.exitCode;
}

async function main() {
  const [laneName, ...args] = process.argv.slice(2);
  const listOnly = args.includes("--list");

  if (!laneName) {
    throw new Error("Usage: node scripts/test/run-lane.mjs <fast|smoke|ci> [--list]");
  }

  if (laneName === "ci") {
    const fastExitCode = await runLane("fast", { listOnly });
    if (fastExitCode !== 0) {
      process.exit(fastExitCode);
    }

    const smokeExitCode = await runLane("smoke", { listOnly });
    process.exit(smokeExitCode);
  }

  const exitCode = await runLane(laneName, { listOnly });
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
