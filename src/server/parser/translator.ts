import { ASSERTION_PATTERNS } from "./assertionPatterns";

export interface TranslatedAssertion {
  patternId: string | null;
  playwrightCall: string | null;
  original: string;
}

export function translateAssertion(thenClauseText: string): TranslatedAssertion {
  const normalizedText = thenClauseText.trim();

  for (const pattern of ASSERTION_PATTERNS) {
    const match = pattern.regex.exec(normalizedText);
    if (match) {
      return {
        patternId: pattern.id,
        playwrightCall: pattern.translate(match),
        original: thenClauseText,
      };
    }
  }

  return {
    patternId: null,
    playwrightCall: null,
    original: thenClauseText,
  };
}
