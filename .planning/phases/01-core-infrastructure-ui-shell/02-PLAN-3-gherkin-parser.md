# Plan 3: Gherkin Parser Service

**Phase:** 1 (Core Infrastructure & UI Shell)
**Focus:** Translate standard `.feature` BDD files into a strict programmatic AST that the downstream execution engine will orchestrate.
**Requirements Covered:** GHERKIN-01, GHERKIN-02, GHERKIN-03, GHERKIN-04

## 1. Setup
- Install `@cucumber/gherkin` and `@cucumber/messages`.
- Create `src/server/parser/index.ts` containing the core parsing service logic.

## 2. Windows CRLF Normalization (`GHERKIN-01`)
- Before feeding any feature file source string to the `@cucumber/gherkin` tokenizer, aggressively replace all Windows `\r\n` characters with `\n`.
- This avoids silent and obscure parsing failures deep inside the Cucumber tokenizer.

## 3. Base Parsing
- Invoke the `@cucumber/gherkin` parser using an English dialect stream.
- Extract the raw `Feature`, its `Background`, and the `Scenario` instances.

## 4. Node Expansion & Resolution
- **Background Prepending (`GHERKIN-03`):** The parser does not merge backgrounds natively. For every extracted `Scenario`, prepend the steps from the `Background` object to the execution plan of that `Scenario`.
- **Scenario Outline Expansion (`GHERKIN-04`):** When parsing `Scenario Outline`, evaluate the `Examples` tables. For every row in the examples table, generate a concrete flat `Scenario` with placeholders (`<variable>`) substituted with actual values.
- **Canonical Step Types (`GHERKIN-02`):** Gherkin outputs `And` or `But` keywords directly. The planner needs to know if an `And` is technically a `Given`, `When`, or `Then` to know whether to run an action vs a validation. Maintain a running state of the "last seen primary keyword" during Step iteration and update the Step object's metadata with the resolved `canonicalType`.

## 5. Output Data Structure
- Return a typed internal representation array structure: `ScenarioPlan[]`, where each has a `name`, `tags`, and an array of `ParsedStep` objects (`keyword`, `canonicalType`, `text`, `table/docstring`). 

## 6. Test & Validate
- Write a parser unit test with a `.feature` file utilizing CRLF endings, standard Given/When/Then, an And/But sequence, a Background block, and a Scenario Outline.
- Assert the parsed output expands the Scenario Outline exactly to the number of example rows, prepends the Background steps correctly to all, and resolves the `And`/`But` accurately.
