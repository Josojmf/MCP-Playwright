# Phase 2, Plan 4: Gherkin Then-Clause Assertion Translator

**Phase:** 2 (LLM Provider Adapters & MCP Registry)  
**Focus:** Translate Gherkin `Then` steps into Playwright `expect()` assertion calls for independent validation in Phase 3.  
**Requirements Covered:** GHERKIN-05

---

## Task 1: Assertion Pattern Registry

**Files:** `src/server/parser/assertionPatterns.ts`

Define 10+ known `Then`-clause patterns and their Playwright translations:

```typescript
interface AssertionPattern {
  id: string;
  name: string;
  regex: RegExp;
  translate: (matches: RegExpExecArray) => string; // Returns Playwright expect() call
}

export const ASSERTION_PATTERNS: AssertionPattern[] = [
  {
    id: "url-match",
    name: "Should see URL",
    regex: /^I should see the URL "([^"]+)"$/i,
    translate: (m) => `expect(page).toHaveURL("${m[1]}")`,
  },
  {
    id: "title-match",
    name: "Page title",
    regex: /^the page title should be "([^"]+)"$/i,
    translate: (m) => `expect(page).toHaveTitle("${m[1]}")`,
  },
  {
    id: "element-visible",
    name: "Element visible",
    regex: /^"([^"]+)" should be visible$/i,
    translate: (m) => `expect(page.getByText("${m[1]}")).toBeVisible()`,
  },
  {
    id: "element-text",
    name: "Element text match",
    regex: /^the element "([^"]+)" should contain "([^"]+)"$/i,
    translate: (m) => `expect(page.getByText("${m[1]}")).toContainText("${m[2]}")`,
  },
  {
    id: "element-count",
    name: "Element count",
    regex: /^there should be (\d+) "([^"]+)" element/i,
    translate: (m) => `expect(page.getByText("${m[2]}")).toHaveCount(${m[1]})`,
  },
  {
    id: "element-attribute",
    name: "Element attribute value",
    regex: /^the "([^"]+)" element should have attribute "([^"]+)" with value "([^"]+)"$/i,
    translate: (m) => `expect(page.locator('${m[1]}[${m[2]}="${m[3]}"]')).toBeTruthy()`,
  },
  {
    id: "form-value",
    name: "Form field value",
    regex: /^the input "([^"]+)" should have value "([^"]+)"$/i,
    translate: (m) => `expect(page.getByLabel("${m[1]}")).toHaveValue("${m[2]}")`,
  },
  {
    id: "redirect-present",
    name: "Redirect occurred",
    regex: /^I should be redirected to "([^"]+)"$/i,
    translate: (m) => `expect(page).toHaveURL(new RegExp("${m[1]}"))`,
  },
];
```

**Design notes:**
- Patterns are ordered by specificity (most specific first)
- Each pattern generates a Playwright `expect()` call as a string
- Regex captures are passed to the translate function
- Intentionally simple patterns to cover ~80% of real scenarios
- More complex assertions will use LLM evaluation in Phase 3

---

## Task 2: Translator Function

**Files:** `src/server/parser/translator.ts`

Implement the core translation engine:

```typescript
export interface TranslatedAssertion {
  patternId: string | null; // null if no pattern matched
  playwrightCall: string | null; // e.g., "expect(page).toHaveURL(...)"
  original: string; // Original Then clause text
}

export function translateAssertion(thenClauseText: string): TranslatedAssertion {
  // Iterate patterns in order
  for (const pattern of ASSERTION_PATTERNS) {
    const match = pattern.regex.exec(thenClauseText);
    if (match) {
      return {
        patternId: pattern.id,
        playwrightCall: pattern.translate(match),
        original: thenClauseText,
      };
    }
  }
  
  // No pattern matched
  return {
    patternId: null,
    playwrightCall: null,
    original: thenClauseText,
  };
}
```

---

## Task 3: Integration with Gherkin Parser

**Files:** `src/server/parser/index.ts` (extend existing file)

Extend the `GherkinParserService` to translate `Then` steps:

- Add a field to `ParsedStep`: `assertion?: TranslatedAssertion`
- After parsing: iterate each scenario's steps
- For steps with `type: 'then'`, call `translateAssertion(step.text)`
- Store result in the step's `assertion` field
- If no pattern matched, leave field null (Phase 3 will use LLM evaluation)

```typescript
export interface ParsedStep {
  keyword: string;
  canonicalType: 'given' | 'when' | 'then';
  text: string;
  assertion?: TranslatedAssertion; // NEW
  arguments?: readonly (messages.DataTable | messages.DocString)[];
}
```

---

## Task 4: Tests for Assertion Translator

**Files:** `src/server/parser/translator.test.ts`

Test each pattern and the translator:

- **URL pattern:** `"I should see the URL \"https://example.com\""` → `expect(page).toHaveURL("https://example.com")`
- **Title pattern:** `"the page title should be \"Home\""` → `expect(page).toHaveTitle("Home")`
- **Visibility pattern:** `"\"Submit button\" should be visible"` → `expect(page.getByText("Submit button")).toBeVisible()`
- **Text pattern:** `"the element \"Welcome\" should contain \"user\""` → generates correct call
- **Count pattern:** `"there should be 3 \"item\" element(s)"` → generates expect with count 3
- **Attribute pattern:** `"the \"input\" element should have attribute \"type\" with value \"text\""` → generates locator with attribute
- **Form pattern:** `"the input \"email\" should have value \"test@example.com\""` → generates correct call
- **Redirect pattern:** `"I should be redirected to \"https://example.com\""` → generates URL regex
- **No match:** `"something really obscure"` → returns patternId: null, playwrightCall: null
- **Integration:** Parse a feature file with 3 `Then` steps → all steps have `assertion` field populated correctly

---

## Success Criteria

- [ ] 8+ assertion patterns defined and tested
- [ ] Translator correctly identifies and translates matching patterns
- [ ] Translator gracefully handles non-matching patterns (returns null)
- [ ] `ParsedStep.assertion` field populated by parser for all `Then` steps
- [ ] Generated Playwright `expect()` calls are syntactically valid
- [ ] All translator tests pass (pattern matching + integration with parser)
- [ ] Case-insensitive matching where appropriate (e.g., "should" vs "Should")
