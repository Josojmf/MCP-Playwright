export interface AssertionPattern {
  id: string;
  name: string;
  regex: RegExp;
  translate: (matches: RegExpExecArray) => string;
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const ASSERTION_PATTERNS: AssertionPattern[] = [
  {
    id: "url-match",
    name: "Should see URL",
    regex: /^I should see the URL "([^"]+)"$/i,
    translate: (m) => `expect(page).toHaveURL("${escapeDoubleQuotes(m[1])}")`,
  },
  {
    id: "title-match",
    name: "Page title",
    regex: /^the page title should be "([^"]+)"$/i,
    translate: (m) => `expect(page).toHaveTitle("${escapeDoubleQuotes(m[1])}")`,
  },
  {
    id: "text-visible",
    name: "Text is visible",
    regex: /^"([^"]+)" should be visible$/i,
    translate: (m) => `expect(page.getByText("${escapeDoubleQuotes(m[1])}")).toBeVisible()`,
  },
  {
    id: "locator-visible",
    name: "Locator visible",
    regex: /^the element "([^"]+)" should be visible$/i,
    translate: (m) => `expect(page.locator("${escapeDoubleQuotes(m[1])}")).toBeVisible()`,
  },
  {
    id: "locator-contains-text",
    name: "Locator contains text",
    regex: /^the element "([^"]+)" should contain "([^"]+)"$/i,
    translate: (m) => `expect(page.locator("${escapeDoubleQuotes(m[1])}")).toContainText("${escapeDoubleQuotes(m[2])}")`,
  },
  {
    id: "count-elements",
    name: "Element count",
    regex: /^there should be (\d+) elements? matching "([^"]+)"$/i,
    translate: (m) => `expect(page.locator("${escapeDoubleQuotes(m[2])}")).toHaveCount(${m[1]})`,
  },
  {
    id: "attribute-value",
    name: "Attribute value",
    regex: /^the element "([^"]+)" should have attribute "([^"]+)" with value "([^"]+)"$/i,
    translate: (m) => `expect(page.locator("${escapeDoubleQuotes(m[1])}")).toHaveAttribute("${escapeDoubleQuotes(m[2])}", "${escapeDoubleQuotes(m[3])}")`,
  },
  {
    id: "input-value",
    name: "Input value",
    regex: /^the input "([^"]+)" should have value "([^"]+)"$/i,
    translate: (m) => `expect(page.getByLabel("${escapeDoubleQuotes(m[1])}")).toHaveValue("${escapeDoubleQuotes(m[2])}")`,
  },
  {
    id: "redirect-url",
    name: "Redirect URL",
    regex: /^I should be redirected to "([^"]+)"$/i,
    translate: (m) => `expect(page).toHaveURL("${escapeDoubleQuotes(m[1])}")`,
  },
  {
    id: "text-content",
    name: "Page contains text",
    regex: /^I should see text "([^"]+)"$/i,
    translate: (m) => `expect(page.getByText("${escapeDoubleQuotes(m[1])}")).toBeVisible()`,
  },
];
