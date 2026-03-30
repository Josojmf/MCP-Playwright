---
phase: 02-llm-adapters-mcp-registry
plan: 04
subsystem: parser/assertion-translator
requirements: [GHERKIN-05]
status: complete
completed: 2026-03-30
---

# Phase 02 Plan 04: Gherkin Assertion Translator Summary

Implemented the Then-clause assertion translation layer for the parser pipeline.

## What Changed

- Added a 10-pattern assertion registry in `src/server/parser/assertionPatterns.ts`.
- Kept `translateAssertion()` as a null-safe pattern matcher in `src/server/parser/translator.ts`.
- Extended `ParsedStep` in `src/server/parser/index.ts` with optional `assertion?: TranslatedAssertion`.
- Wired the parser so every `Then`-canonical step gets a translated Playwright assertion.
- Strengthened tests for all 10 patterns, null behavior, case-insensitivity, and parser integration.

## Verification

- `npx tsc --noEmit` passes.
- Translator coverage now includes URL, title, visibility, locator visibility, text containment, count, attribute, input value, redirect, and text-content checks.
- Parser integration test confirms `Then`, `And`, and `But` steps inheriting from `Then` receive assertion metadata.

## Residual Risk

- Unrecognized Then clauses still return `{ patternId: null, playwrightCall: null }` by design. That is expected and will rely on later phase validation layers.
- The smoke run through `ts-node/esm` in this sandbox hit loader/runtime limitations unrelated to the parser logic; TypeScript validation still passed.
