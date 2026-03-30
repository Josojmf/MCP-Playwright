Feature: Smoke
  Scenario: Basic navigation
    Given I open "https://example.com"
    Then I should see the URL "https://example.com"
