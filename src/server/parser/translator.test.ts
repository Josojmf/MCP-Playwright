import assert from "node:assert/strict";
import test from "node:test";
import { GherkinParserService } from "./index";
import { translateAssertion } from "./translator";

test("translator maps URL pattern to Playwright expect call", () => {
  const output = translateAssertion('I should see the URL "https://example.com"');
  assert.equal(output.patternId, "url-match");
  assert.equal(output.playwrightCall, 'expect(page).toHaveURL("https://example.com")');
});

test("translator maps title pattern to Playwright expect call", () => {
  const output = translateAssertion('the page title should be "Home"');
  assert.equal(output.patternId, "title-match");
  assert.equal(output.playwrightCall, 'expect(page).toHaveTitle("Home")');
});

test("translator maps element visible pattern", () => {
  const output = translateAssertion('"Submit" should be visible');
  assert.equal(output.patternId, "text-visible");
  assert.equal(output.playwrightCall, 'expect(page.getByText("Submit")).toBeVisible()');
});

test("translator maps element contains text pattern", () => {
  const output = translateAssertion('the element "[data-testid=hero]" should contain "Welcome"');
  assert.equal(output.patternId, "locator-contains-text");
  assert.equal(
    output.playwrightCall,
    'expect(page.locator("[data-testid=hero]")).toContainText("Welcome")'
  );
});

test("translator maps count pattern", () => {
  const output = translateAssertion('there should be 3 elements matching ".item"');
  assert.equal(output.patternId, "count-elements");
  assert.equal(output.playwrightCall, 'expect(page.locator(".item")).toHaveCount(3)');
});

test("translator maps attribute pattern", () => {
  const output = translateAssertion('the element "input" should have attribute "type" with value "email"');
  assert.equal(output.patternId, "attribute-value");
  assert.equal(output.playwrightCall, 'expect(page.locator("input")).toHaveAttribute("type", "email")');
});

test("translator maps input value pattern", () => {
  const output = translateAssertion('the input "Email" should have value "test@example.com"');
  assert.equal(output.patternId, "input-value");
  assert.equal(
    output.playwrightCall,
    'expect(page.getByLabel("Email")).toHaveValue("test@example.com")'
  );
});

test("translator maps redirect pattern", () => {
  const output = translateAssertion('I should be redirected to "https://example.com/dashboard"');
  assert.equal(output.patternId, "redirect-url");
  assert.equal(output.playwrightCall, 'expect(page).toHaveURL("https://example.com/dashboard")');
});

test("translator returns nulls for unknown pattern", () => {
  const output = translateAssertion("something really obscure");
  assert.equal(output.patternId, null);
  assert.equal(output.playwrightCall, null);
});

test("parser integration populates assertion metadata for then steps", () => {
  const parser = new GherkinParserService();
  const feature = [
    "Feature: Assertions",
    "  Scenario: Then mapping",
    "    Given I open the homepage",
    '    Then I should see the URL "https://example.com"',
    '    Then the page title should be "Example Domain"',
    '    Then "Example Domain" should be visible',
  ].join("\n");

  const scenarios = parser.parseFeature(feature);
  const thenSteps = scenarios[0].steps.filter((step) => step.canonicalType === "then");

  assert.equal(thenSteps.length, 3);
  assert.equal(thenSteps.every((step) => step.assertion?.playwrightCall !== null), true);
});
