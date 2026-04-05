import { ASSERTION_PATTERNS } from "../parser/assertionPatterns";
import { TranslatedAssertion } from "../parser/translator";

export interface AssertionResult {
  status: "passed" | "failed";
  message?: string;
  stack?: string;
}

type AssertionExpect = (value: unknown) => {
  toBeVisible: () => Promise<void> | void;
  toHaveURL: (url: string) => Promise<void> | void;
  toHaveTitle: (title: string) => Promise<void> | void;
  toContainText: (text: string) => Promise<void> | void;
  toHaveCount: (count: number) => Promise<void> | void;
  toHaveAttribute: (name: string, value: string) => Promise<void> | void;
  toHaveValue: (value: string) => Promise<void> | void;
};

interface AssertionPage {
  url?: () => string;
  title?: () => string;
  getByText?: (text: string) => unknown;
  locator?: (selector: string) => unknown;
  getByLabel?: (label: string) => unknown;
}

export interface AssertionContext {
  page?: AssertionPage;
  expect?: AssertionExpect;
  [key: string]: unknown;
}

type AssertionRunner = (assertion: TranslatedAssertion, context: RequiredAssertionContext) => Promise<void>;

interface RequiredAssertionContext {
  page: AssertionPage;
  expect: AssertionExpect;
}

export async function setupPlaywrightContext(): Promise<void> {
  // Placeholder for future Playwright lifecycle wiring.
}

export async function cleanupPlaywrightContext(): Promise<void> {
  // Placeholder for future Playwright lifecycle wiring.
}

export const ALLOWLISTED_ASSERTION_RUNNERS: Record<string, AssertionRunner> = {
  "url-match": async (assertion, context) => {
    const [expectedUrl] = readMatch(assertion, "url-match");
    await context.expect(context.page).toHaveURL(expectedUrl);
  },
  "title-match": async (assertion, context) => {
    const [expectedTitle] = readMatch(assertion, "title-match");
    await context.expect(context.page).toHaveTitle(expectedTitle);
  },
  "text-visible": async (assertion, context) => {
    const [text] = readMatch(assertion, "text-visible");
    await context.expect(readPageMethod(context.page, "getByText")(text)).toBeVisible();
  },
  "locator-visible": async (assertion, context) => {
    const [selector] = readMatch(assertion, "locator-visible");
    await context.expect(readPageMethod(context.page, "locator")(selector)).toBeVisible();
  },
  "locator-contains-text": async (assertion, context) => {
    const [selector, text] = readMatch(assertion, "locator-contains-text");
    await context.expect(readPageMethod(context.page, "locator")(selector)).toContainText(text);
  },
  "count-elements": async (assertion, context) => {
    const [count, selector] = readMatch(assertion, "count-elements");
    await context.expect(readPageMethod(context.page, "locator")(selector)).toHaveCount(Number(count));
  },
  "attribute-value": async (assertion, context) => {
    const [selector, attribute, value] = readMatch(assertion, "attribute-value");
    await context.expect(readPageMethod(context.page, "locator")(selector)).toHaveAttribute(attribute, value);
  },
  "input-value": async (assertion, context) => {
    const [label, value] = readMatch(assertion, "input-value");
    await context.expect(readPageMethod(context.page, "getByLabel")(label)).toHaveValue(value);
  },
  "redirect-url": async (assertion, context) => {
    const [expectedUrl] = readMatch(assertion, "redirect-url");
    await context.expect(context.page).toHaveURL(expectedUrl);
  },
  "text-content": async (assertion, context) => {
    const [text] = readMatch(assertion, "text-content");
    await context.expect(readPageMethod(context.page, "getByText")(text)).toBeVisible();
  },
};

export async function runAssertion(
  assertion: TranslatedAssertion,
  context: AssertionContext
): Promise<AssertionResult> {
  const patternId = assertion.patternId?.trim() ?? null;

  if (!patternId) {
    return unsupportedAssertionResult("untranslatable");
  }

  const runner = ALLOWLISTED_ASSERTION_RUNNERS[patternId];
  if (!runner) {
    return unsupportedAssertionResult(patternId);
  }

  try {
    await runner(assertion, {
      page: context.page ?? {},
      expect: context.expect ?? mockExpect,
    });

    return { status: "passed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      message: translatePlaywrightError(message) ?? message,
      stack: error instanceof Error ? error.stack : undefined,
    };
  }
}

function unsupportedAssertionResult(patternId: string): AssertionResult {
  return {
    status: "failed",
    message: `Unsupported translated assertion pattern: ${patternId}`,
  };
}

function readMatch(assertion: TranslatedAssertion, patternId: string): string[] {
  const pattern = ASSERTION_PATTERNS.find((candidate) => candidate.id === patternId);
  if (!pattern) {
    throw new Error(`Assertion pattern metadata missing for ${patternId}`);
  }

  const match = pattern.regex.exec(assertion.original.trim());
  if (!match) {
    throw new Error(`Translated assertion no longer matches pattern ${patternId}`);
  }

  return match.slice(1);
}

function readPageMethod<T extends keyof AssertionPage>(
  page: AssertionPage,
  key: T
): Exclude<AssertionPage[T], undefined> {
  const method = page[key];
  if (typeof method !== "function") {
    throw new Error(`Playwright page is missing method ${String(key)}`);
  }

  return method as Exclude<AssertionPage[T], undefined>;
}

function mockExpect(value: unknown) {
  return {
    toBeVisible: async () => {
      if (readFlag(value, "visible", true)) {
        return;
      }
      throw new Error("Locator has no element that matches the specified criteria");
    },
    toHaveURL: async (expectedUrl: string) => {
      const currentUrl =
        typeof (value as AssertionPage)?.url === "function"
          ? (value as AssertionPage).url?.()
          : readString(value, "url");

      if (currentUrl === expectedUrl) {
        return;
      }

      throw new Error(`Locator has no URL match: ${currentUrl ?? "unknown"}`);
    },
    toHaveTitle: async (expectedTitle: string) => {
      const currentTitle =
        typeof (value as AssertionPage)?.title === "function"
          ? (value as AssertionPage).title?.()
          : readString(value, "title");

      if (currentTitle === expectedTitle) {
        return;
      }

      throw new Error(`Page title does not match: ${currentTitle ?? "unknown"}`);
    },
    toContainText: async (text: string) => {
      const actual = readString(value, "text") ?? String(value ?? "");
      if (actual.includes(text)) {
        return;
      }

      throw new Error(`Locator does not contain text: ${text}`);
    },
    toHaveCount: async (count: number) => {
      if (readNumber(value, "count") === count) {
        return;
      }

      throw new Error("Count mismatch");
    },
    toHaveAttribute: async (name: string, expectedValue: string) => {
      const attributes = readRecord(value, "attributes");
      if (attributes?.[name] === expectedValue) {
        return;
      }

      throw new Error(`Attribute ${name} does not match: ${attributes?.[name] ?? "missing"}`);
    },
    toHaveValue: async (expectedValue: string) => {
      const actual = readString(value, "value");
      if (actual === expectedValue) {
        return;
      }

      throw new Error(`Value does not match: expected ${expectedValue}, got ${actual ?? "unknown"}`);
    },
  };
}

function readFlag(value: unknown, key: string, fallback: boolean): boolean {
  if (!value || typeof value !== "object" || !(key in value)) {
    return fallback;
  }

  return Boolean((value as Record<string, unknown>)[key]);
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : undefined;
}

function readRecord(value: unknown, key: string): Record<string, string> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  return candidate as Record<string, string>;
}

function translatePlaywrightError(errorMessage: string): string | undefined {
  const translations: Record<string, string> = {
    "Locator has no element that matches the specified criteria":
      "El elemento no coincide con los criterios especificados",
    "Timeout 30000ms exceeded": "Tiempo de espera agotado (30 segundos)",
    "Target page, context or browser has been closed":
      "La página o navegador fue cerrado",
    "net::ERR_FAILED": "Error de conexión de red",
  };

  for (const [pattern, translation] of Object.entries(translations)) {
    if (errorMessage.includes(pattern)) {
      return translation;
    }
  }

  return undefined;
}
