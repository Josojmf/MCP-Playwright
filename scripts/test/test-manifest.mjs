export const smokeTestFiles = Object.freeze([
  "src/server/api/history.test.ts",
  "src/server/storage/sqlite.test.ts",
  "src/server/storage/screenshots.test.ts",
]);

export const testManifest = Object.freeze({
  fast: {
    description: "Routine deterministic lane for local work and the default CI safety check.",
    ownership: {
      policy:
        "Behavioral, contract, and evidence tests stay here unless they cross a real I/O or process seam.",
      includeSuffixes: [".test.ts", ".contract.test.ts", ".evidence.test.ts"],
      excludeFiles: smokeTestFiles,
    },
  },
  smoke: {
    description: "Smaller real-seam lane for slower persistence and filesystem coverage.",
    ownership: {
      policy:
        "Only tests that exercise real persistence, filesystem, process lifecycle, or similarly expensive seams belong here.",
      files: smokeTestFiles,
    },
  },
});
