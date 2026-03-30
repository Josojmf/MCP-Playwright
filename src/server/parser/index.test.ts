import assert from "node:assert/strict";
import test from "node:test";
import { GherkinParserService } from "./index";

test("parser normalizes CRLF, expands outlines, prepends background, and resolves canonical types", () => {
  const parser = new GherkinParserService();
  const feature = [
    "Feature: Checkout",
    "  Background:",
    "    Given I open the homepage",
    "",
    "  Scenario Outline: Add item",
    "    When I search for \"<item>\"",
    "    And I add \"<item>\" to cart",
    "    Then I should see \"<item>\" in cart",
    "    But I should not see \"Out of stock\"",
    "",
    "    Examples:",
    "      | item |",
    "      | Book |",
    "      | Pen  |",
  ].join("\r\n");

  const scenarios = parser.parseFeature(feature);

  assert.equal(scenarios.length, 2);

  const firstScenario = scenarios[0];
  assert.equal(firstScenario.steps.length, 5);

  assert.equal(firstScenario.steps[0].canonicalType, "given");
  assert.equal(firstScenario.steps[1].canonicalType, "when");
  assert.equal(firstScenario.steps[2].canonicalType, "when");
  assert.equal(firstScenario.steps[3].canonicalType, "then");
  assert.equal(firstScenario.steps[4].canonicalType, "then");

  assert.ok(firstScenario.steps[1].text.includes("Book"));
  assert.ok(scenarios[1].steps[1].text.includes("Pen"));
});
