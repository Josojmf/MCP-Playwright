#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const entrypoint = path.join(projectRoot, "src", "cli", "mcp-bench.ts");

const result = spawnSync(process.execPath, [tsxCli, entrypoint, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
