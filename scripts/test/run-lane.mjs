import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { testManifest } from "./test-manifest.mjs";

const projectRoot = process.cwd();
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

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
  const files = [...testManifest.smoke.ownership.files].sort();
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

function printLaneList(laneName, files) {
  console.log(`Lane: ${laneName}`);
  for (const file of files) {
    console.log(file);
  }
}

function runTsxTests(files) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "--test", ...files], {
      cwd: projectRoot,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Test lane exited from signal ${signal}`));
        return;
      }

      resolve(code ?? 1);
    });
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
  return runTsxTests(files);
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
