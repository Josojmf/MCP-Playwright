export const smokeInventory = Object.freeze([
  {
    file: "src/server/api/history.test.ts",
    reason: "Fastify injection coverage against persisted run metadata and trust-state output.",
  },
  {
    file: "src/server/storage/sqlite.test.ts",
    reason: "Real SQLite persistence coverage for runs, steps, and screenshot metadata.",
  },
  {
    file: "src/server/storage/screenshots.test.ts",
    reason: "Filesystem-backed screenshot storage smoke coverage.",
  },
]);

export const smokeTestFiles = Object.freeze(smokeInventory.map((entry) => entry.file));

export const testManifest = Object.freeze({
  fast: {
    description: "Routine deterministic lane for local work and the default CI safety check.",
    ownership: {
      policy:
        "Behavioral, contract, and evidence tests stay here unless they cross a real I/O or process seam.",
      includeSuffixes: [".test.ts", ".contract.test.ts", ".evidence.test.ts"],
      excludeFiles: smokeTestFiles,
    },
    diagnostics: {
      failureBundle: false,
    },
  },
  smoke: {
    description: "Smaller real-seam lane for slower persistence and filesystem coverage.",
    ownership: {
      policy:
        "Only tests that exercise real persistence, filesystem, process lifecycle, or similarly expensive seams belong here.",
      files: smokeInventory,
    },
    diagnostics: {
      failureBundle: {
        enabled: true,
        outputDir: ".artifacts/test-failures/smoke",
        retention: "screenshot-first",
      },
    },
  },
});
